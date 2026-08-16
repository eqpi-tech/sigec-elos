#!/usr/bin/env python3
"""patch_041 + backfill de supplier_partners.telefone a partir da base
legada PF (parquet). Cobre TODOS os sócios PF (novos e antigos do HOC)
casando por (CNPJ da empresa, CPF do sócio). Só preenche onde está NULL.
"""
import os, re, time
import duckdb
import pg8000.dbapi

OUT = "/private/tmp/claude-501/-Users-luiz-panareli-Downloads-workspaces-eqpi-new-sigec-elos/649339e1-faaf-4193-a2f3-9050230a6ce3/scratchpad/enrich"

def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

def esc(v):
    if v is None: return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

url = None
with open(os.path.join(os.path.dirname(__file__), "..", ".env")) as f:
    for line in f:
        if line.startswith("SUPABASE_DB_URL="):
            url = line.split("=", 1)[1].strip().strip('"'); break
m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", url)
pg = pg8000.dbapi.connect(user=m.group(1), password=m.group(2), host=m.group(3),
                          port=int(m.group(4) or 5432), database=m.group(5), ssl_context=True)
cur = pg.cursor()

# 1. patch_041
with open(os.path.join(os.path.dirname(__file__), "..", "supabase", "patch_041_partner_phones.sql")) as f:
    cur.execute(f.read())
pg.commit()
log("patch_041 aplicado")

# 2. Sócios atuais sem telefone (id, cnpj empresa, cpf)
cur.execute("""
  SELECT p.id::text, regexp_replace(coalesce(s.cnpj,''),'\\D','','g'),
         regexp_replace(coalesce(p.cpf_cnpj,''),'\\D','','g')
  FROM supplier_partners p JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.telefone IS NULL
    AND length(regexp_replace(coalesce(p.cpf_cnpj,''),'\\D','','g')) BETWEEN 10 AND 11
    AND length(regexp_replace(coalesce(s.cnpj,''),'\\D','','g')) BETWEEN 13 AND 14
""")
rows = [(r[0], r[1].zfill(14), r[2].zfill(11)) for r in cur.fetchall()]
log(f"sócios PF sem telefone no banco: {len(rows)}")

# 3. Match local no parquet PF
d = duckdb.connect()
d.execute(f"SET memory_limit='6GB'; SET temp_directory='{OUT}/tmp'")
d.execute("CREATE TABLE alvo (id VARCHAR, cnpj VARCHAR, cpf VARCHAR)")
d.executemany("INSERT INTO alvo VALUES (?,?,?)", rows)
fones = d.execute(f"""
  WITH pf1 AS (
    SELECT cnpj, cpf, coalesce(fone1, fone2) fone,
           row_number() OVER (PARTITION BY cnpj, cpf ORDER BY (fone1 IS NOT NULL)::int DESC) rn
    FROM '{OUT}/pf.parquet' WHERE fone1 IS NOT NULL OR fone2 IS NOT NULL
  )
  SELECT a.id, p.fone FROM alvo a JOIN pf1 p ON p.cnpj=a.cnpj AND p.cpf=a.cpf AND p.rn=1
""").fetchall()
log(f"telefones encontrados no legado: {len(fones)}")

# 4. Staging + UPDATE em lote
cur.execute("CREATE TEMP TABLE _stg_fones (id uuid, telefone text)")
for i in range(0, len(fones), 2000):
    chunk = fones[i:i+2000]
    values = ",".join(f"({esc(a)}::uuid,{esc(b)})" for a, b in chunk)
    cur.execute(f"INSERT INTO _stg_fones VALUES {values}")
cur.execute("""
  UPDATE supplier_partners p SET telefone = st.telefone
  FROM _stg_fones st WHERE st.id = p.id AND p.telefone IS NULL
""")
n = cur.rowcount
pg.commit()
log(f"telefones aplicados: {n}")

cur.execute("SELECT count(*), count(telefone) FROM supplier_partners")
r = cur.fetchone()
log(f"supplier_partners: {r[0]} sócios, {r[1]} com telefone ({100*r[1]//r[0]}%)")
pg.close()
log("CONCLUÍDO")
