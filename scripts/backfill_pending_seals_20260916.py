# -*- coding: utf-8 -*-
# Backfill 16/09 (aprovado): corrige selos PENDING herdados da migração v2.
# A data_validade do HOC é gravada NA CRIAÇÃO do processo (início+1 ano);
# a v2 tratou "validade vigente" como processo real e criou selos "Homologado"
# PENDING para pré-cadastros não pagos → apareciam como "Em análise" sem docs.
#
# Regra (confirmada pelo usuário):
#   · pré-cadastro NÃO pago (mesmo com validade) → SEM selo (vira "Cadastro (sem processo)")
#   · pago ou subsidiado → PENDING "Em análise – {cliente}"
#   · processo vencido ou sem processo ativo → EXPIRED
# Espelha a mesma regra corrigida no sync_hoc_daily.py (não recria).
#
# Uso: ... backfill_pending_seals.py [--apply]   (sem --apply = dry-run)
import re, json, sys, datetime, collections
import pg8000.native, mysql.connector

APPLY = '--apply' in sys.argv
ROOT = '/Users/luiz.panareli/Downloads/workspaces_eqpi_new/sigec-elos'

url = [l.split('=', 1)[1].strip().strip('"') for l in open(f'{ROOT}/.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)

cfg = json.load(open(f'{ROOT}/scripts/hoc_migration_config.json'))['hoc_mysql']
my = mysql.connector.connect(host=cfg['host'], user=cfg['user'], password=cfg['password'],
                             database=cfg['database'], port=cfg.get('port', 3306))
cur = my.cursor(dictionary=True)
cur.execute("SET SESSION transaction_read_only = 1")


def classify_seal(resultados):  # cópia fiel da v2
    aprovados = em_analise = reprovados = 0
    for r in resultados:
        r = r or ""
        if r in ("Aprovado", "Aprovado Com Restrição", "Aprovado Com Carta"):
            aprovados += 1
        elif r in ("", "Pré Cadastro"):
            em_analise += 1
        else:
            reprovados += 1
    total = aprovados + em_analise + reprovados
    if total == 0: return ("PENDING", "Simples")
    if aprovados == total: return ("ACTIVE", "Premium")
    if em_analise > 0: return ("PENDING", "Simples")
    return ("SUSPENDED", "Simples")


seals = pg.run("""
  select s.id, s.seal_name, sup.hoc_id, cl.hoc_id, cl.razao_social, s.supplier_id
  from seals s
  join suppliers sup on sup.id = s.supplier_id
  left join clients cl on cl.id = s.client_id
  where s.status = 'PENDING' and sup.hoc_id is not null and cl.hoc_id is not null""")
print(f"selos PENDING (HOC×HOC) a revisar: {len(seals)} · modo: {'APPLY' if APPLY else 'DRY-RUN'}", flush=True)

# selos com carta de exceção nunca são apagados
prot = {r[0] for r in pg.run("select distinct seal_id from supplier_category_approvals")}

hoje = datetime.date.today()
cnt = collections.Counter()
for sid, sname, f_id, c_id, cliente, supplier_id in seals:
    f_id, c_id = int(f_id), int(c_id)
    cur.execute("""SELECT p.id pid, p.data_validade, p.pre_cadastro, p.boleto_pago, p.subsidiado
                   FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
                   WHERE p.id_fornecedor = %s AND fl.id_cliente = %s AND p.ativo = 1
                   ORDER BY p.id DESC""", (f_id, c_id))
    ps = cur.fetchall()
    real = lambda p: not ((p['pre_cadastro'] or 0) and not (p['boleto_pago'] or 0) and not (p['subsidiado'] or 0))
    vig  = [p for p in ps if p['data_validade'] and p['data_validade'] >= hoje and real(p)]
    ana  = [p for p in ps if p['data_validade'] is None and not (p['pre_cadastro'] or 0)
            and ((p['boleto_pago'] or 0) or (p['subsidiado'] or 0))]
    raw  = [p for p in ps if not real(p) or (p['data_validade'] is None and not (p['boleto_pago'] or 0)
            and not (p['subsidiado'] or 0) and not (p['pre_cadastro'] or 0))]

    if vig:
        p = vig[0]
        cur.execute("SELECT resultado FROM processo_categorias WHERE id_processo = %s", (p['pid'],))
        status, level = classify_seal([r['resultado'] or '' for r in cur.fetchall()])
        nome = f"Em análise – {cliente}" if status == 'PENDING' else f"Homologado – {cliente}"
        cnt[f'atualizado → {status}' + (' (renomeado Em análise)' if status == 'PENDING' else '')] += 1
        if APPLY:
            exp = p['data_validade'].isoformat()
            pg.run("""update seals set status=:st, level=:lv, seal_name=:nm,
                        hoc_process_id=:pid, hoc_expiry_date=:exp,
                        expires_at = case when :st='ACTIVE' then :exp::date else expires_at end
                      where id=:id""", st=status, lv=level, nm=nome, pid=p['pid'], exp=exp, id=sid)
            if status == 'ACTIVE':
                pg.run("update suppliers set status='ACTIVE' where id=:s and status <> 'SUSPENDED'", s=supplier_id)
    elif ana:
        p = ana[0]
        nome = f"Em análise – {cliente}"
        cnt['mantido PENDING' + (' (renomeado)' if sname != nome else '')] += 1
        if APPLY and sname != nome:
            pg.run("update seals set seal_name=:nm, hoc_process_id=:pid where id=:id",
                   nm=nome, pid=p['pid'], id=sid)
    elif raw:
        if sid in prot:
            cnt['pré-cadastro MAS tem carta de exceção — mantido (revisar)'] += 1
        else:
            cnt['excluído (vira Cadastro sem processo)'] += 1
            if APPLY:
                pg.run("delete from seals where id=:id", id=sid)
    else:
        cnt['EXPIRED (processo vencido/inexistente)'] += 1
        if APPLY:
            pg.run("update seals set status='EXPIRED' where id=:id", id=sid)

for k, v in cnt.most_common():
    print(f"{v:5d} · {k}", flush=True)

if APPLY:
    pg.run("""insert into audit_log (action, entity_type, metadata)
              values ('SEAL_BACKFILL_PRECADASTRO', 'seal', :m::jsonb)""",
           m=json.dumps({"data": str(hoje), "regra": "16/09 pre-cadastro nao pago sem selo",
                         "contagens": dict(cnt)}, ensure_ascii=False))
    print("audit_log gravado.", flush=True)
my.close()
