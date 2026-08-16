#!/usr/bin/env python3
"""Fase 6 do enriquecimento — APLICA em produção (aprovado pelo usuário):
1. patch_040 (colunas de auditoria enriched_from/enriched_at)
2. Backup local dos campos que serão alterados (rollback de contatos)
3. Contatos: staging + UPDATE ... FROM em transação — SÓ campos vazios
4. Sócios: staging + INSERT com anti-join (dedupe CNPJ+CPF) em transação
Prospects NÃO são importados (decisão do usuário) — ficam em parquet.
"""
import os, re, csv, time
import duckdb
import pg8000.dbapi

OUT = "/private/tmp/claude-501/-Users-luiz-panareli-Downloads-workspaces-eqpi-new-sigec-elos/649339e1-faaf-4193-a2f3-9050230a6ce3/scratchpad/enrich"
BACKUP_DIR = os.path.expanduser("~/Downloads/workspaces_eqpi_new/enrichment_data")
os.makedirs(BACKUP_DIR, exist_ok=True)

def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

# Qualificação: origem já veio com U+FFFD; lido como latin-1 virou 'ï¿½'.
# Vocabulário fechado → mapeamento exato (não usar replace cego).
QUALIF_FIX = {
    'Sï¿½cio-Administrador': 'Sócio-Administrador',
    'Sï¿½cio': 'Sócio',
    'Sï¿½cio com Capital': 'Sócio com Capital',
    'Conselheiro de Administraï¿½ï¿½o': 'Conselheiro de Administração',
    'Sï¿½cio sem Capital': 'Sócio sem Capital',
    'Titular Pessoa Fï¿½sica Residente ou Domiciliado no Brasil': 'Titular Pessoa Física Residente ou Domiciliado no Brasil',
    'Sï¿½cio Menor (Assistido/Representado)': 'Sócio Menor (Assistido/Representado)',
    'Sï¿½cio Pessoa Fï¿½sica Residente no Exterior': 'Sócio Pessoa Física Residente no Exterior',
    'Sï¿½cio-Gerente': 'Sócio-Gerente',
    'Sï¿½cio Incapaz ou Relat.Incapaz (exceto menor)': 'Sócio Incapaz ou Relat.Incapaz (exceto menor)',
    'Sï¿½cio Comanditado': 'Sócio Comanditado',
    'Secretï¿½rio': 'Secretário',
}
def fix_qualif(q):
    if q is None: return None
    return QUALIF_FIX.get(q, q)

def esc(v):
    """Literal SQL seguro para INSERT multi-linha (evita 1 round-trip por linha)."""
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def bulk_insert(cur, table, rows, batch=2000):
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        values = ",".join("(" + ",".join(esc(v) for v in row) + ")" for row in chunk)
        cur.execute(f"INSERT INTO {table} VALUES {values}")

# ── Conexões ──────────────────────────────────────────────────────────────
url = None
with open(os.path.join(os.path.dirname(__file__), "..", ".env")) as f:
    for line in f:
        if line.startswith("SUPABASE_DB_URL="):
            url = line.split("=", 1)[1].strip().strip('"'); break
m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", url)
pg = pg8000.dbapi.connect(user=m.group(1), password=m.group(2), host=m.group(3),
                          port=int(m.group(4) or 5432), database=m.group(5), ssl_context=True)
cur = pg.cursor()
d = duckdb.connect()

# ── 1. patch_040 ──────────────────────────────────────────────────────────
log("aplicando patch_040 (colunas de auditoria)...")
with open(os.path.join(os.path.dirname(__file__), "..", "supabase", "patch_040_enrichment.sql")) as f:
    cur.execute(f.read())
pg.commit()

# ── 2. Backup de rollback dos contatos ────────────────────────────────────
log("backup dos campos que serão alterados...")
contacts = d.execute(f"SELECT supplier_id, campo, valor_novo FROM '{OUT}/delta_contacts.parquet'").fetchall()
ids = sorted({c[0] for c in contacts})
backup_rows = []
for i in range(0, len(ids), 5000):
    chunk = ids[i:i+5000]
    cur.execute("SELECT id::text, email, phone FROM suppliers WHERE id = ANY(%s::uuid[])", (chunk,))
    backup_rows.extend(cur.fetchall())
with open(f"{BACKUP_DIR}/rollback_contacts_{time.strftime('%Y%m%d_%H%M%S')}.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id", "email_antes", "phone_antes"]); w.writerows(backup_rows)
log(f"backup salvo: {len(backup_rows)} fornecedores")

# ── 3. Contatos: staging + UPDATE (só vazios) ─────────────────────────────
log("aplicando contatos...")
cur.execute("CREATE TEMP TABLE _stg_contacts (supplier_id uuid, campo text, valor text)")
bulk_insert(cur, "_stg_contacts", [(c[0], c[1], c[2]) for c in contacts])
log(f"staging contatos: {len(contacts)} linhas")

cur.execute("""
UPDATE suppliers s SET email = st.valor, enriched_from = 'legado_eqpi', enriched_at = now()
FROM _stg_contacts st
WHERE st.supplier_id = s.id AND st.campo = 'email'
  AND nullif(trim(coalesce(s.email, '')), '') IS NULL
""")
n_email = cur.rowcount
cur.execute("""
UPDATE suppliers s SET phone = st.valor, enriched_from = 'legado_eqpi', enriched_at = now()
FROM _stg_contacts st
WHERE st.supplier_id = s.id AND st.campo = 'phone'
  AND nullif(trim(coalesce(s.phone, '')), '') IS NULL
""")
n_phone = cur.rowcount
pg.commit()
log(f"contatos aplicados: {n_email} emails, {n_phone} telefones")

# ── 4. Sócios: staging + INSERT anti-join ─────────────────────────────────
log("aplicando sócios novos...")
partners = d.execute(f"""
  SELECT supplier_id, cpf, nome, qualificacao, participacao FROM '{OUT}/delta_partners.parquet'
""").fetchall()
cur.execute("""CREATE TEMP TABLE _stg_partners
  (supplier_id uuid, cpf text, nome text, cargo text, participacao numeric)""")
bulk_insert(cur, "_stg_partners", [(p[0], p[1], p[2], fix_qualif(p[3]), p[4]) for p in partners])
log(f"staging sócios: {len(partners)} linhas")

cur.execute("""
INSERT INTO supplier_partners (supplier_id, tipo, cpf_cnpj, nome, cargo, participacao, enriched_from, enriched_at)
SELECT st.supplier_id, 'pf', st.cpf, st.nome, st.cargo, st.participacao, 'legado_eqpi', now()
FROM _stg_partners st
WHERE NOT EXISTS (
  SELECT 1 FROM supplier_partners p
  WHERE p.supplier_id = st.supplier_id
    AND regexp_replace(coalesce(p.cpf_cnpj, ''), '\\D', '', 'g') = st.cpf
)
""")
n_partners = cur.rowcount
pg.commit()
log(f"sócios inseridos: {n_partners}")

# ── 5. Verificação final ──────────────────────────────────────────────────
cur.execute("""SELECT
  count(*) FILTER (WHERE nullif(trim(coalesce(email,'')),'') IS NOT NULL),
  count(*) FILTER (WHERE nullif(trim(coalesce(phone,'')),'') IS NOT NULL),
  count(*) FROM suppliers WHERE deleted_at IS NULL AND archived_at IS NULL""")
r = cur.fetchone()
log(f"suppliers ativos agora: email {r[0]}/{r[2]}, phone {r[1]}/{r[2]}")
cur.execute("SELECT count(*), count(DISTINCT supplier_id) FROM supplier_partners")
r = cur.fetchone()
log(f"supplier_partners agora: {r[0]} sócios em {r[1]} fornecedores")
cur.execute("SELECT count(*) FROM supplier_partners WHERE enriched_from = 'legado_eqpi'")
log(f"sócios marcados legado_eqpi: {cur.fetchone()[0]}")
pg.close()
log("FASE 6 CONCLUÍDA")
