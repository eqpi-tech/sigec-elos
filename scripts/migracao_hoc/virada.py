#!/usr/bin/env python3
"""Virada de um cliente HOC → ELOS (17/10/2026, patch_149). HOC SOMENTE LEITURA.

Lê o processo ABERTO mais recente de cada fornecedor do cliente no HOC e deixa o
processo do ELOS (um por fornecedor × cliente) no estado decidido pelo Luiz:

  --modo completo  (cliente segue no ELOS)
     pago (boleto pago / subsidiado / transferência):
        categoria aprovada e validade vigente → ACTIVE (homologado)
        demais                                 → PENDING liberado (processo ativo)
     não pago, boleto do HOC a vencer → PENDING aguardando pagamento, boleto
        conferido todo dia no HOC (sync boletos_migrados) — sem cobrança no ELOS
     não pago, sem boleto ou boleto vencido → PENDING aguardando pagamento pelo
        ELOS (preço do fluxo do cliente)
     O não pago vira processo do ELOS (hoc_process_id nulo; origem em
     hoc_origin_process_id) — é assim que a trava de pagamento e o Stripe o tratam.
     Homologação anterior ainda vigente nunca é rebaixada (fica e vai ao relatório).

  --modo historico (cliente inativado — só histórico, sem análise nem rotinas)
     homologado e vigente → ACTIVE · vencido → EXPIRED
     com documento enviado → PENDING (congelado)
     sem nenhum documento enviado → EXPIRED (encerrado na migração)

Por fim marca clients.hoc_migrated_at: a sincronia deixa de gravar o cliente.

Uso (da raiz do repo):
  arch -x86_64 python3.12 scripts/migracao_hoc/virada.py --cliente-hoc 33 --modo completo            # simulação
  arch -x86_64 python3.12 scripts/migracao_hoc/virada.py --cliente-hoc 33 --modo completo --aplicar  # grava
O relatório (CSV com CNPJs) vai para fora do repositório (--saida).
"""
import argparse, csv, datetime as dt, json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from migrate_hoc_v2 import connect_mysql  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ENV = {}
for l in open(os.path.join(ROOT, '.env')):
    if '=' in l and not l.lstrip().startswith('#'):
        k, v = l.rstrip('\n').split('=', 1); ENV[k.strip()] = v.strip().strip('"').strip("'")
PSQL = '/usr/local/opt/libpq/bin/psql'
APROVADO = ('Aprovado', 'Aprovado Com Restrição', 'Aprovado Com Carta')


def psql(db, sql, file=None):
    args = [PSQL, db, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'] + (['-f', file] if file else ['-c', sql])
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr.strip()[:800])
    return r.stdout.strip()


def rows(db, sql):
    return json.loads(psql(db, f"SELECT coalesce(json_agg(row_to_json(x)), '[]') FROM ({sql}) x") or '[]')


def q(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def hoc_processos(cli):
    cfg = json.load(open(os.path.join(ROOT, 'scripts', 'hoc_migration_config.json')))
    my = connect_mysql(cfg['hoc_mysql']); cur = my.cursor(dictionary=True)
    cur.execute("SET SESSION transaction_read_only = 1")
    cur.execute("SELECT @@session.transaction_read_only AS ro"); assert cur.fetchone()['ro'] == 1, 'HOC não está em leitura'
    cur.execute("""
      SELECT p.id proc, f.cnpj, p.data_validade, p.pre_cadastro, p.subsidiado, p.subsidio_interno, p.boleto_pago,
             p.forma_pagamento, DATE(p.data_inicio) inicio,
             (SELECT MAX(b.data_vencimento) FROM boleto b WHERE b.id_processo = p.id AND b.data_pagamento IS NULL) boleto_vence,
             (SELECT MAX(b.data_pagamento) FROM boleto b WHERE b.id_processo = p.id) boleto_pago_em,
             (SELECT COUNT(*) FROM processo_documento pd WHERE pd.id_processo = p.id AND pd.id_arquivo IS NOT NULL) enviados,
             (SELECT GROUP_CONCAT(COALESCE(pc.resultado, '') SEPARATOR '|') FROM processo_categorias pc WHERE pc.id_processo = p.id) resultados
      FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo JOIN fornecedor f ON f.id = p.id_fornecedor
      WHERE fl.id_cliente = %s AND p.ativo = 1 AND p.data_arquivamento IS NULL
        AND p.id = (SELECT MAX(p2.id) FROM processo p2 JOIN fluxo f2 ON f2.id = p2.id_fluxo
                    WHERE p2.id_fornecedor = p.id_fornecedor AND f2.id_cliente = fl.id_cliente
                      AND p2.ativo = 1 AND p2.data_arquivamento IS NULL)""", (cli,))
    out = cur.fetchall(); my.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cliente-hoc', type=int, required=True)
    ap.add_argument('--modo', choices=['completo', 'historico'], required=True)
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--saida', default=os.path.abspath(os.path.join(ROOT, '..', 'virada_hoc')))
    a = ap.parse_args()
    db = ENV['SUPABASE_DB_URL']
    hoje = dt.date.today()

    cli = rows(db, f"SELECT id, coalesce(nome_fantasia, razao_social) nome, active, hoc_migrated_at FROM clients WHERE hoc_id = {a.cliente_hoc}")
    if not cli: sys.exit('cliente não encontrado no ELOS')
    cli = cli[0]
    fluxo = rows(db, f"SELECT id FROM client_flows WHERE client_id = '{cli['id']}' AND active ORDER BY is_default DESC NULLS LAST, created_at LIMIT 1")
    fluxo_id = fluxo[0]['id'] if fluxo else None
    sups = {r['cnpj']: r['id'] for r in rows(db, "SELECT id, cnpj FROM suppliers WHERE cnpj IS NOT NULL")}
    selos = {r['supplier_id']: r for r in rows(db, f"""SELECT id, supplier_id, status, released_at, hoc_process_id, expires_at
                                                         FROM seals WHERE client_id = '{cli['id']}'""")}

    plano, sql = [], []
    for p in hoc_processos(a.cliente_hoc):
        cnpj = ''.join(ch for ch in (p['cnpj'] or '') if ch.isalnum()).upper()
        sid = sups.get(cnpj)
        res = [r for r in (p['resultados'] or '').split('|')] if p['resultados'] is not None else []
        aprovado = any(r in APROVADO for r in res)
        val = p['data_validade']
        vigente = bool(val and val >= hoje)
        pago = bool(p['subsidiado'] or p['subsidio_interno'] or p['boleto_pago'] or p['forma_pagamento'] == 'WT')
        bv = p['boleto_vence'].date() if hasattr(p['boleto_vence'], 'date') else p['boleto_vence']
        atual = selos.get(sid) if sid else None
        lin = {'cnpj': cnpj, 'hoc_processo': p['proc'], 'inicio': str(p['inicio']), 'pago': pago,
               'subsidiado': bool(p['subsidiado'] or p['subsidio_interno']), 'boleto_vence': str(bv or ''),
               'enviados': p['enviados'], 'resultados': '/'.join(sorted(set(res))),
               'elos_antes': (atual or {}).get('status', '(sem processo)'), 'acao': '', 'elos_depois': ''}
        if not sid:
            lin['acao'] = 'IGNORADO: fornecedor não existe no ELOS'; plano.append(lin); continue

        # ── decide o estado ──────────────────────────────────────────────
        # homologação do ELOS ainda vigente nunca é rebaixada (renovação aberta
        # no HOC e não concluída/paga): fica como está e vai ao relatório
        vigente_antes = bool(atual and atual['status'] == 'ACTIVE' and atual.get('expires_at')
                             and atual['expires_at'][:10] >= hoje.isoformat())
        alvo = None
        if a.modo == 'historico':
            if pago and aprovado and vigente:
                alvo = dict(status='ACTIVE', hoc=True, expira=str(val), motivo=None, acao='homologado (histórico)')
            elif pago and aprovado:
                alvo = dict(status='EXPIRED', hoc=True, expira=str(val), motivo=None, acao='homologação vencida (histórico)')
            elif not pago:
                lin['acao'] = 'IGNORADO: sem pagamento/pré-cadastro (sem processo)'; plano.append(lin); continue
            elif vigente_antes:
                lin['acao'] = 'MANTIDO: homologação vigente no ELOS; processo novo do HOC não concluído'
                lin['elos_depois'] = 'ACTIVE'; plano.append(lin); continue
            elif p['enviados'] == 0 and not atual:
                lin['acao'] = 'IGNORADO: nunca espelhado e sem documentos (nada a encerrar)'; plano.append(lin); continue
            elif p['enviados'] > 0:
                alvo = dict(status='PENDING', hoc=True, expira=None, motivo=None, acao='em andamento — congelado (histórico)')
            else:
                alvo = dict(status='EXPIRED', hoc=True, expira=None,
                            motivo='Encerrado na migração para o SIGEC-ELOS (17/10/2026): nenhum documento enviado',
                            acao='ENCERRADO: nenhum documento enviado')
        else:
            if pago and aprovado and vigente:
                alvo = dict(status='ACTIVE', hoc=True, expira=str(val), motivo=None, acao='homologado')
            elif pago:
                alvo = dict(status='PENDING', hoc=True, expira=None, motivo=None, acao='pago — processo ativo (em análise)')
            else:
                if vigente_antes:
                    lin['acao'] = 'MANTIDO: homologação anterior vigente; novo processo do HOC não pago — verificar'
                    lin['elos_depois'] = 'ACTIVE'; plano.append(lin); continue
                a_vencer = bool(bv and bv >= hoje)
                alvo = dict(status='PENDING', hoc=False, expira=None, motivo=None,
                            boleto='A_VENCER' if a_vencer else None, vence=str(bv) if a_vencer else None,
                            acao='aguardando pagamento — boleto HOC a vencer (conferência diária)' if a_vencer
                                 else 'aguardando pagamento pelo ELOS')
        lin['acao'] = alvo['acao']; lin['elos_depois'] = alvo['status'] + ('' if alvo['hoc'] else ' (não liberado)')
        plano.append(lin)

        # ── SQL (uma transação no fim) ───────────────────────────────────
        nome = ('Homologado – ' if alvo['status'] == 'ACTIVE' else 'Em análise – ') + cli['nome']
        if alvo['hoc']:
            campos = {'status': alvo['status'], 'hoc_process_id': p['proc'], 'hoc_origin_process_id': p['proc'],
                      'expires_at': alvo['expira'], 'hoc_expiry_date': str(val) if val else None,
                      'seal_name': nome if alvo['status'] != 'EXPIRED' else None, 'seal_type': 'homologado',
                      'suspended_reason': alvo['motivo'], 'hoc_boleto_status': None, 'hoc_boleto_due': None}
        else:
            campos = {'status': 'PENDING', 'hoc_process_id': None, 'released_at': None, 'hoc_origin_process_id': p['proc'],
                      'flow_id': fluxo_id, 'expires_at': None, 'hoc_expiry_date': None, 'seal_name': None,
                      'seal_type': 'homologado', 'suspended_reason': None, 'rejection_reason': None, 'exception': False,
                      'hoc_boleto_status': alvo.get('boleto'), 'hoc_boleto_due': alvo.get('vence')}
        if atual:
            sets = ', '.join(f'{k} = {q(v)}' for k, v in campos.items())
            sql.append(f"UPDATE seals SET {sets} WHERE id = '{atual['id']}';")
        else:
            campos.update({'supplier_id': sid, 'client_id': cli['id'], 'level': 'Simples', 'score': 0})
            campos.pop('released_at', None)
            sql.append(f"INSERT INTO seals ({', '.join(campos)}) VALUES ({', '.join(q(v) for v in campos.values())});")

    sql.append(f"UPDATE clients SET hoc_migrated_at = coalesce(hoc_migrated_at, now()) WHERE id = '{cli['id']}';")

    os.makedirs(a.saida, exist_ok=True)
    tag = f"{a.cliente_hoc}_{dt.datetime.now():%Y%m%d_%H%M}{'' if a.aplicar else '_simulacao'}"
    rel = os.path.join(a.saida, f'virada_{tag}.csv')
    with open(rel, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(plano[0].keys()) if plano else ['acao']); w.writeheader(); w.writerows(plano)
    resumo = {}
    for l in plano: resumo[(l['elos_antes'], l['acao'])] = resumo.get((l['elos_antes'], l['acao']), 0) + 1
    print(f"Cliente {cli['nome']} (HOC {a.cliente_hoc}) · modo {a.modo} · fluxo ELOS {fluxo_id} · {len(plano)} processos do HOC")
    for (antes, acao), n in sorted(resumo.items(), key=lambda x: (x[0][1], x[0][0])):
        print(f'  {n:4d}  {acao:70s} (ELOS antes: {antes})')
    print(f'relatório: {rel}')

    if not a.aplicar:
        print('SIMULAÇÃO — nada gravado. Rode com --aplicar para gravar.'); return
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as f:
        f.write('BEGIN;\n' + '\n'.join(sql) + '\nCOMMIT;\n'); arq = f.name
    psql(db, None, file=arq)
    print(f'GRAVADO: {len(sql) - 1} processos + marca de cliente migrado (uma transação).')


if __name__ == '__main__':
    main()
