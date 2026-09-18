#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparo 18/09 — farol do ELOS descolado do HOC (300+ vs 28).

Causas corrigidas neste reparo (as regras novas já estão no sync diário):
 1. SELOS: a data_validade do HOC (gravada na criação) enganou o backfill de
    16/09 — processos pagos AINDA EM ANÁLISE viraram EXPIRED (149 fornecedores
    fora da fila). Recalcula TODOS os pares selo HOC×HOC com a regra correta:
    homologado = categorias aprovadas; pago sem aprovação = Em análise;
    aprovado com validade vencida = EXPIRED.
 2. DOCUMENTOS: o sync só espelhava aprovados ('O'). Espelha agora os
    AGUARDANDO ANÁLISE do farol do HOC (situacao NULL, processo pago e
    concluído, interno OU com arquivo), com a data_limite_analise do HOC.

Uso: ... repair_hoc_queue_20260918.py [--apply]
"""
import re, sys, json, datetime, collections
import pg8000.native, mysql.connector

APPLY = '--apply' in sys.argv

sys.path.insert(0, 'scripts')
from migrate_hoc_v2 import classify_seal  # noqa: E402  (mesma regra do sync)

url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)
cfg = json.load(open('scripts/hoc_migration_config.json'))['hoc_mysql']
my = mysql.connector.connect(host=cfg['host'], user=cfg['user'], password=cfg['password'],
                             database=cfg['database'], port=cfg.get('port', 3306))
cur = my.cursor(dictionary=True)
cur.execute("SET SESSION transaction_read_only = 1")
hoje = datetime.date.today()

supmap = {int(r[0]): str(r[1]) for r in pg.run("select hoc_id, id from suppliers where hoc_id is not null")}
climap = {int(r[0]): (str(r[1]), r[2]) for r in pg.run("select hoc_id, id, razao_social from clients where hoc_id is not null")}

# ── 1. SELOS: pares a revisar = selos ELOS (HOC×HOC) + pares do farol HOC ──
pairs = {(int(r[0]), int(r[1])) for r in pg.run("""
    select sup.hoc_id, cl.hoc_id from seals s
    join suppliers sup on sup.id = s.supplier_id
    join clients cl on cl.id = s.client_id
    where sup.hoc_id is not null and cl.hoc_id is not null""")}
cur.execute("""SELECT DISTINCT p.id_fornecedor f, fl.id_cliente c
  FROM processo_documento pd
  JOIN documento d ON pd.id_documento = d.id
  JOIN processo p ON pd.id_processo = p.id
  JOIN fornecedor fo ON fo.id = p.id_fornecedor
  JOIN fluxo fl ON fl.id = p.id_fluxo
  JOIN cliente c ON c.id = fl.id_cliente
  WHERE p.data_fim IS NOT NULL AND pd.situacao IS NULL
    AND p.ativo = 1 AND fo.ativo = 1 AND c.ativo = 1
    AND (p.boleto_pago = 1 OR (p.boleto_pago = 0 AND d.tipo = 'TIPO_COMPROVANTE_PAGTO'
         AND p.tipo = 'IT' AND p.forma_pagamento = 'WT'))
    AND (d.responsabilidade = 'I' OR (d.responsabilidade = 'F' AND pd.id_arquivo IS NOT NULL))""")
farol_pairs = {(r['f'], r['c']) for r in cur.fetchall()}
pairs |= farol_pairs
print(f"pares a revisar: {len(pairs)} (farol HOC: {len(farol_pairs)}) · {'APPLY' if APPLY else 'DRY'}")

cnt = collections.Counter()
for f_id, c_id in sorted(pairs):
    sid = supmap.get(f_id); cli = climap.get(c_id)
    if not sid or not cli: cnt['par sem mapa ELOS'] += 1; continue
    cid, cli_nome = cli
    cur.execute("""SELECT p.id pid, p.data_validade FROM processo p
        JOIN fluxo fl ON fl.id = p.id_fluxo
        WHERE p.id_fornecedor = %s AND fl.id_cliente = %s AND p.ativo = 1
          AND NOT (COALESCE(p.pre_cadastro,0)=1 AND COALESCE(p.boleto_pago,0)=0 AND COALESCE(p.subsidiado,0)=0)
          AND (COALESCE(p.boleto_pago,0)=1 OR COALESCE(p.subsidiado,0)=1
               OR (p.tipo='IT' AND p.forma_pagamento='WT'))
        ORDER BY p.id DESC LIMIT 1""", (f_id, c_id))
    row = cur.fetchone()
    cur_seal = pg.run("""select id, status, seal_name from seals
                         where supplier_id=:s and client_id=:c limit 1""", s=sid, c=cid)
    if not row:
        # sem processo real: se existir selo PENDING/ACTIVE indevido, expira
        if cur_seal and cur_seal[0][1] in ('PENDING',):
            cnt['sem processo real → EXPIRED'] += 1
            if APPLY: pg.run("update seals set status='EXPIRED' where id=:i", i=cur_seal[0][0])
        else:
            cnt['sem processo real (ok)'] += 1
        continue
    cur.execute("SELECT resultado FROM processo_categorias WHERE id_processo = %s", (row['pid'],))
    status, level = classify_seal([r['resultado'] or '' for r in cur.fetchall()])
    if status == 'ACTIVE' and (not row['data_validade'] or row['data_validade'] < hoje):
        status = 'EXPIRED'
    nome = f"Em análise – {cli_nome}" if status == 'PENDING' else f"Homologado – {cli_nome}"
    if cur_seal:
        sealid, st_old, nome_old = cur_seal[0]
        if st_old == status and (status != 'PENDING' or nome_old == nome):
            cnt[f'já correto ({status})'] += 1; continue
        cnt[f'{st_old} → {status}'] += 1
        if APPLY:
            pg.run("""update seals set status=:st, seal_name=:nm, hoc_process_id=:pid,
                        level=:lv, hoc_expiry_date=:exp,
                        expires_at = case when :st='ACTIVE' then :exp::date else expires_at end
                      where id=:i""",
                   st=status, nm=nome, pid=row['pid'], lv=level,
                   exp=(row['data_validade'].isoformat() if row['data_validade'] else None), i=sealid)
    else:
        cnt[f'criado ({status})'] += 1
        if APPLY:
            pg.run("""insert into seals (supplier_id, client_id, status, seal_name, seal_type,
                        level, hoc_process_id, score)
                      values (:s,:c,:st,:nm,'homologado',:lv,:pid,0)""",
                   s=sid, c=cid, st=status, nm=nome, lv=level, pid=row['pid'])

print("\n== selos ==")
for k, v in cnt.most_common(): print(f"  {v:5d} · {k}")

# ── 2. DOCUMENTOS pendentes do farol ──────────────────────────────────────
cur.execute("""SELECT p.id_fornecedor f, pd.id_documento doc, d.descricao, d.responsabilidade,
       pd.data_vencimento, pd.data_limite_analise, pd.id_arquivo,
       COALESCE(pd.update_date, pd.create_date) enviado
  FROM processo_documento pd
  JOIN documento d ON pd.id_documento = d.id
  JOIN processo p ON pd.id_processo = p.id
  JOIN fornecedor fo ON fo.id = p.id_fornecedor
  JOIN fluxo fl ON fl.id = p.id_fluxo
  JOIN cliente c ON c.id = fl.id_cliente
  WHERE p.data_fim IS NOT NULL AND pd.situacao IS NULL
    AND p.ativo = 1 AND fo.ativo = 1 AND c.ativo = 1
    AND (p.boleto_pago = 1 OR (p.boleto_pago = 0 AND d.tipo = 'TIPO_COMPROVANTE_PAGTO'
         AND p.tipo = 'IT' AND p.forma_pagamento = 'WT'))
    AND (d.responsabilidade = 'I' OR (d.responsabilidade = 'F' AND pd.id_arquivo IS NOT NULL))
  ORDER BY pd.id DESC""")
dcnt = collections.Counter(); seen = set()
for r in cur.fetchall():
    key = (r['f'], r['doc'])
    if key in seen: continue
    seen.add(key)
    sid = supmap.get(r['f'])
    if not sid: dcnt['fornecedor sem mapa'] += 1; continue
    dcnt['upsert PENDING'] += 1
    if APPLY:
        pg.run("""insert into documents (supplier_id, type, label, source, status,
                    expires_at, hoc_arquivo_id, hoc_analysis_due, submitted_at)
                  values (:s,:t,:l,'MANUAL','PENDING',:exp,:arq,:due,:sub)
                  on conflict (supplier_id, type) do update set
                    status='PENDING', label=excluded.label,
                    expires_at=excluded.expires_at,
                    hoc_arquivo_id=excluded.hoc_arquivo_id,
                    hoc_analysis_due=excluded.hoc_analysis_due,
                    submitted_at=excluded.submitted_at""",
               s=sid, t=str(r['doc']), l=' '.join(str(r['descricao'] or '').split()),
               exp=(r['data_vencimento'].isoformat() if r['data_vencimento'] else None),
               arq=r['id_arquivo'],
               due=(r['data_limite_analise'].isoformat() if r['data_limite_analise'] else None),
               sub=(r['enviado'].isoformat() if r['enviado'] else None))
print("\n== documentos ==")
for k, v in dcnt.most_common(): print(f"  {v:5d} · {k}")

if APPLY:
    pg.run("""insert into audit_log (action, entity_type, metadata)
              values ('HOC_QUEUE_REPAIR','sync', :m::jsonb)""",
           m=json.dumps({"selos": dict(cnt), "docs": dict(dcnt)}, ensure_ascii=False))
    print("\naudit gravado.")
my.close()
