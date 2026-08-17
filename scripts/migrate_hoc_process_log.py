#!/usr/bin/env python3
"""Migra o Log do Processo do HOC → audit_log do ELOS.
Escopo aprovado: SÓ ações humanas (exclui batches, 'sys' e consulta
automática) — ~1,2M linhas. historico_status_homologacao fica p/ depois.

- MySQL: SOMENTE leitura (transaction_read_only).
- Idempotente: remove import anterior (action='HOC_LOG') antes de gravar.
- Formato: audit_log(action='HOC_LOG', entity_type='supplier',
  entity_id=<uuid via suppliers.hoc_id>, created_at=data original,
  metadata={descricao, autor, hoc_processo_id, hoc_log_id, fonte:'hoc'})
"""
import json, os, re, time
import mysql.connector
import pg8000.dbapi

def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

BASE = os.path.dirname(os.path.abspath(__file__))

# ── Conexões ──────────────────────────────────────────────────────────────
cfg = json.load(open(os.path.join(BASE, "hoc_migration_config.json")))["hoc_mysql"]
my = mysql.connector.connect(host=cfg["host"], port=cfg.get("port", 3306), user=cfg["user"],
    password=cfg["password"], database=cfg["database"], charset="utf8mb4", use_pure=True, connection_timeout=60)
c = my.cursor(); c.execute("SET SESSION transaction_read_only = 1"); c.close()
log("MySQL conectado (READ ONLY)")

url = None
with open(os.path.join(BASE, "..", ".env")) as f:
    for line in f:
        if line.startswith("SUPABASE_DB_URL="):
            url = line.split("=", 1)[1].strip().strip('"'); break
m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", url)
pg = pg8000.dbapi.connect(user=m.group(1), password=m.group(2), host=m.group(3),
                          port=int(m.group(4) or 5432), database=m.group(5), ssl_context=True)
pgc = pg.cursor()
log("Supabase conectado")

# ── Mapa hoc_id → supplier uuid ───────────────────────────────────────────
pgc.execute("SELECT hoc_id, id::text FROM suppliers WHERE hoc_id IS NOT NULL")
sup_map = {r[0]: r[1] for r in pgc.fetchall()}
log(f"mapa fornecedores: {len(sup_map)}")

# ── Limpa import anterior (idempotência) ──────────────────────────────────
pgc.execute("DELETE FROM audit_log WHERE action = 'HOC_LOG'")
log(f"import anterior removido: {pgc.rowcount} linhas")
pg.commit()

# ── Stream do MySQL em faixas de id ───────────────────────────────────────
HUMAN_FILTER = """l.created_by NOT LIKE '%batch%'
  AND l.created_by <> 'sys'
  AND l.created_by NOT LIKE 'consulta.automatica%'"""

myc = my.cursor()
myc.execute("SELECT MIN(id), MAX(id) FROM log_processo")
lo, hi = myc.fetchone()
log(f"log_processo ids: {lo}..{hi}")

def esc(v):
    if v is None: return "NULL"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"

total_read = total_written = total_sem_fornecedor = 0
STEP = 100_000
BATCH = 2_000
t0 = time.time()

for start in range(lo, hi + 1, STEP):
    end = start + STEP - 1
    myc.execute(f"""
        SELECT l.id, l.descricao, l.data, l.created_by, p.id_fornecedor
        FROM log_processo l
        JOIN processo p ON p.id = l.id_processo
        WHERE l.id BETWEEN {start} AND {end} AND {HUMAN_FILTER}
    """)
    rows = myc.fetchall()
    total_read += len(rows)

    batch = []
    for hoc_log_id, descricao, data, autor, id_forn in rows:
        sup = sup_map.get(id_forn)
        if not sup:
            total_sem_fornecedor += 1
            continue
        meta = json.dumps({
            "descricao": (descricao or "").strip()[:1000],
            "autor": autor or "",
            "hoc_log_id": hoc_log_id,
            "fonte": "hoc",
        }, ensure_ascii=False)
        batch.append((sup, meta, data.isoformat() if data else None))

    for i in range(0, len(batch), BATCH):
        chunk = batch[i:i + BATCH]
        values = ",".join(
            f"({esc(s)}::uuid, {esc(mt)}::jsonb, {esc(dt)}::timestamptz)" for s, mt, dt in chunk)
        pgc.execute(f"""
            INSERT INTO audit_log (entity_id, metadata, created_at, action, entity_type, user_id)
            SELECT v.eid, v.meta, coalesce(v.ts, now()), 'HOC_LOG', 'supplier', NULL
            FROM (VALUES {values}) AS v(eid, meta, ts)
        """)
        total_written += len(chunk)
    pg.commit()

    if (start - lo) % 1_000_000 < STEP:
        pct = 100 * (end - lo) / (hi - lo)
        log(f"{pct:5.1f}% · lidas {total_read:,} · gravadas {total_written:,} · sem fornecedor {total_sem_fornecedor:,}")

log(f"CONCLUÍDO em {int(time.time()-t0)}s: lidas {total_read:,}, gravadas {total_written:,}, sem fornecedor no ELOS {total_sem_fornecedor:,}")
pgc.execute("SELECT count(*) FROM audit_log WHERE action='HOC_LOG'")
log(f"audit_log HOC_LOG total: {pgc.fetchone()[0]:,}")

# CNPJ de exemplo com bastante log (para validação manual)
pgc.execute("""
    SELECT s.cnpj, s.razao_social, count(*) n
    FROM audit_log a JOIN suppliers s ON s.id = a.entity_id
    WHERE a.action = 'HOC_LOG'
    GROUP BY s.cnpj, s.razao_social ORDER BY n DESC LIMIT 5
""")
for r in pgc.fetchall():
    log(f"exemplo p/ validação: {r[0]} · {r[1][:40]} · {r[2]:,} eventos")

pg.close(); my.close()
