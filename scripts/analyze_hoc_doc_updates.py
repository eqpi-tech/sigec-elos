#!/usr/bin/env python3
"""Análise READ-ONLY do HOC: como o backoffice atualiza documentos?
- Estrutura de processo_documento / arquivo (colunas de auditoria)
- Substituições: múltiplas versões por (processo, documento)
- Padrão de lote: quantos docs o mesmo usuário atualiza no mesmo dia
"""
import json
import mysql.connector

with open("hoc_migration_config.json") as f:
    cfg = json.load(f)["hoc_mysql"]

conn = mysql.connector.connect(
    host=cfg["host"], port=cfg.get("port", 3306), user=cfg["user"],
    password=cfg["password"], database=cfg["database"],
    charset=cfg.get("charset", "utf8mb4"), use_pure=True, connection_timeout=60,
)
cur = conn.cursor()
cur.execute("SET SESSION transaction_read_only = 1")
cur.close()

cur = conn.cursor(dictionary=True)

print("=== Colunas de processo_documento ===")
cur.execute("DESCRIBE processo_documento")
for r in cur.fetchall():
    print(f"  {r['Field']:30s} {r['Type']}")

print("\n=== Colunas de arquivo ===")
cur.execute("DESCRIBE arquivo")
for r in cur.fetchall():
    print(f"  {r['Field']:30s} {r['Type']}")

print("\n=== Tabelas de log/histórico existentes ===")
cur.execute("SHOW TABLES")
tables = [list(r.values())[0] for r in cur.fetchall()]
for t in tables:
    if any(k in t.lower() for k in ("log", "hist", "audit")):
        print(f"  {t}")

print("\n=== Versões por (processo, documento): substituições ===")
cur.execute("""
    SELECT versoes, COUNT(*) AS pares
    FROM (
        SELECT id_processo, id_documento, COUNT(*) AS versoes
        FROM processo_documento
        GROUP BY id_processo, id_documento
    ) x GROUP BY versoes ORDER BY versoes LIMIT 12
""")
for r in cur.fetchall():
    print(f"  {r['versoes']} versão(ões): {r['pares']} pares processo×documento")

# Colunas de data/usuário reais (nomes podem variar) — detecta dinamicamente
cur.execute("DESCRIBE processo_documento")
pd_cols = [r["Field"] for r in cur.fetchall()]
date_col = next((c for c in pd_cols if "cadastro" in c.lower() or "criacao" in c.lower() or c.lower() in ("data", "created_at")), None)
user_col = next((c for c in pd_cols if "usuario" in c.lower() or "user" in c.lower()), None)
print(f"\n(coluna de data detectada: {date_col} · coluna de usuário: {user_col})")

if date_col:
    print(f"\n=== Atualizações por dia (últimos 120 dias com atividade) — evidência de lote ===")
    cur.execute(f"""
        SELECT DATE({date_col}) AS dia, COUNT(*) AS docs,
               COUNT(DISTINCT id_processo) AS processos
        FROM processo_documento
        WHERE {date_col} IS NOT NULL
        GROUP BY DATE({date_col})
        ORDER BY dia DESC LIMIT 15
    """)
    for r in cur.fetchall():
        print(f"  {r['dia']}: {r['docs']:5d} docs em {r['processos']:4d} processos")

if date_col and user_col:
    print(f"\n=== Top dias por usuário (lotes por analista) ===")
    cur.execute(f"""
        SELECT {user_col} AS usuario, DATE({date_col}) AS dia, COUNT(*) AS docs
        FROM processo_documento
        WHERE {date_col} IS NOT NULL
        GROUP BY {user_col}, DATE({date_col})
        ORDER BY docs DESC LIMIT 10
    """)
    for r in cur.fetchall():
        print(f"  usuário {r['usuario']}: {r['docs']} docs em {r['dia']}")

print("\n=== Situações de processo_documento ===")
cur.execute("SELECT situacao, COUNT(*) AS n FROM processo_documento GROUP BY situacao ORDER BY n DESC")
for r in cur.fetchall():
    print(f"  {r['situacao']}: {r['n']}")

conn.close()
print("\nOK (nenhuma escrita realizada)")
