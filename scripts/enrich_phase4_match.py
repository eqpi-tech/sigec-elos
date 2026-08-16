#!/usr/bin/env python3
"""Fase 4 do enriquecimento: match ELOS × bases legadas + geração de deltas.
Regra de ouro: nunca sobrescrever — delta só existe onde o campo do ELOS
está vazio. Sócios: só candidatos a INSERT com dedupe por CNPJ+CPF.
Gera também a base de prospects (Fase 5, ainda sem aplicar em produção):
CNPJs da base legada ausentes do ELOS.

Saídas em $ENRICH_OUT:
  delta_contacts.parquet   — supplier_id, cnpj, campo, valor_novo, fonte
  delta_partners.parquet   — supplier_id, cnpj, cpf, nome, qualificacao, participacao, fone
  prospects.parquet        — empresas fora do ELOS (1 linha por CNPJ)
  prospect_partners.parquet— sócios dessas empresas
  phase4_report.txt        — contagens
  amostra_delta.csv        — ~50 linhas p/ validação manual
"""
import os, time
import duckdb

OUT = os.environ.get("ENRICH_OUT", "/private/tmp/claude-501/-Users-luiz-panareli-Downloads-workspaces-eqpi-new-sigec-elos/649339e1-faaf-4193-a2f3-9050230a6ce3/scratchpad/enrich")
con = duckdb.connect()
con.execute(f"SET temp_directory='{OUT}/tmp'; SET memory_limit='6GB'; SET threads=6;")

def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

# Vistas base
con.execute(f"CREATE VIEW elos_sup  AS SELECT * FROM '{OUT}/elos_suppliers.parquet'")
con.execute(f"CREATE VIEW elos_par  AS SELECT * FROM '{OUT}/elos_partners.parquet'")
con.execute(f"CREATE VIEW pf        AS SELECT * FROM '{OUT}/pf.parquet'")
con.execute(f"CREATE VIEW pj        AS SELECT * FROM '{OUT}/pj.parquet'")

# ── PJ consolidada: 1 linha por CNPJ (melhor linha: mais contatos) ────────
log("consolidando PJ por CNPJ...")
con.execute(f"""
CREATE TABLE pj1 AS
SELECT * EXCLUDE rn FROM (
  SELECT *, row_number() OVER (
    PARTITION BY cnpj
    ORDER BY (email IS NOT NULL)::int + (fone1 IS NOT NULL)::int DESC, dtabertura DESC NULLS LAST
  ) rn FROM pj
) WHERE rn = 1
""")

# ── PF consolidada: 1 linha por (cnpj, cpf) ───────────────────────────────
log("consolidando PF por (cnpj,cpf)...")
con.execute(f"""
CREATE TABLE pf1 AS
SELECT * EXCLUDE rn FROM (
  SELECT *, row_number() OVER (
    PARTITION BY cnpj, cpf
    ORDER BY (fone1 IS NOT NULL)::int DESC, dtentrada DESC NULLS LAST
  ) rn FROM pf
) WHERE rn = 1
""")

# ── DELTA de contatos (só campos vazios no ELOS; ignora inativos) ─────────
log("gerando delta de contatos...")
con.execute(f"""
CREATE TABLE delta_contacts AS
WITH matched AS (
  SELECT e.id supplier_id, e.cnpj, e.email elos_email, e.phone elos_phone,
         p.email leg_email,
         coalesce(p.fone1, p.fone2, p.fone3, p.fone4) leg_fone
  FROM elos_sup e JOIN pj1 p USING (cnpj)
  WHERE NOT e.inativo
)
SELECT supplier_id, cnpj, 'email' campo, leg_email valor_novo, 'legado_pj' fonte
  FROM matched WHERE elos_email IS NULL AND leg_email IS NOT NULL
UNION ALL
SELECT supplier_id, cnpj, 'phone', leg_fone, 'legado_pj'
  FROM matched WHERE elos_phone IS NULL AND leg_fone IS NOT NULL
""")
con.execute(f"COPY delta_contacts TO '{OUT}/delta_contacts.parquet' (FORMAT PARQUET)")

# ── DELTA de sócios: INSERT candidates, dedupe por CNPJ+CPF ───────────────
log("gerando candidatos a sócios novos...")
con.execute(f"""
CREATE TABLE delta_partners AS
SELECT e.id supplier_id, f.cnpj, f.cpf, f.nome, f.qualificacao,
       f.participacao, f.dtentrada, coalesce(f.fone1, f.fone2) fone
FROM pf1 f
JOIN elos_sup e ON e.cnpj = f.cnpj AND NOT e.inativo
LEFT JOIN elos_par ep ON ep.cnpj = f.cnpj AND ep.cpf = f.cpf
WHERE ep.cpf IS NULL AND f.nome IS NOT NULL
""")
con.execute(f"COPY delta_partners TO '{OUT}/delta_partners.parquet' (FORMAT PARQUET)")

# ── PROSPECTS: CNPJs legados fora do ELOS ─────────────────────────────────
log("gerando prospects (fora do ELOS)...")
con.execute(f"""
CREATE TABLE prospects AS
SELECT p.*
FROM pj1 p LEFT JOIN elos_sup e USING (cnpj)
WHERE e.cnpj IS NULL
""")
con.execute(f"COPY prospects TO '{OUT}/prospects.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)")

con.execute(f"""
CREATE TABLE prospect_partners AS
SELECT f.cnpj, f.cpf, f.nome, f.qualificacao, f.participacao, f.dtentrada,
       coalesce(f.fone1, f.fone2) fone
FROM pf1 f
JOIN prospects pr USING (cnpj)
""")
con.execute(f"COPY prospect_partners TO '{OUT}/prospect_partners.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)")

# ── Sócios de PF cujas empresas não estão nem na PJ nem no ELOS ───────────
r_extra = con.execute("""
SELECT count(DISTINCT f.cnpj) FROM pf1 f
LEFT JOIN elos_sup e USING (cnpj) LEFT JOIN pj1 p USING (cnpj)
WHERE e.cnpj IS NULL AND p.cnpj IS NULL
""").fetchone()[0]

# ── Relatório ─────────────────────────────────────────────────────────────
rep = {}
rep["elos_ativos_cnpj14"]   = con.execute("SELECT count(*) FROM elos_sup WHERE NOT inativo").fetchone()[0]
rep["pj_cnpjs"]             = con.execute("SELECT count(*) FROM pj1").fetchone()[0]
rep["match_cnpjs"]          = con.execute("SELECT count(*) FROM elos_sup e JOIN pj1 USING (cnpj) WHERE NOT e.inativo").fetchone()[0]
rep["delta_email"]          = con.execute("SELECT count(*) FROM delta_contacts WHERE campo='email'").fetchone()[0]
rep["delta_phone"]          = con.execute("SELECT count(*) FROM delta_contacts WHERE campo='phone'").fetchone()[0]
rep["delta_partners"]       = con.execute("SELECT count(*) FROM delta_partners").fetchone()[0]
rep["delta_partners_supps"] = con.execute("SELECT count(DISTINCT supplier_id) FROM delta_partners").fetchone()[0]
rep["prospects"]            = con.execute("SELECT count(*) FROM prospects").fetchone()[0]
rep["prospect_partners"]    = con.execute("SELECT count(*) FROM prospect_partners").fetchone()[0]
rep["pf_cnpjs_sem_pj_sem_elos"] = r_extra

before = con.execute("""SELECT
  count(*) FILTER (WHERE email IS NOT NULL), count(*) FILTER (WHERE phone IS NOT NULL), count(*)
  FROM elos_sup WHERE NOT inativo""").fetchone()
rep["email_antes"] = f"{before[0]}/{before[2]} ({100*before[0]//before[2]}%)"
rep["email_depois"] = f"{before[0]+rep['delta_email']}/{before[2]} ({100*(before[0]+rep['delta_email'])//before[2]}%)"
rep["phone_antes"] = f"{before[1]}/{before[2]} ({100*before[1]//before[2]}%)"
rep["phone_depois"] = f"{before[1]+rep['delta_phone']}/{before[2]} ({100*(before[1]+rep['delta_phone'])//before[2]}%)"

with open(f"{OUT}/phase4_report.txt", "w") as f:
    for k, v in rep.items():
        line = f"{k}={v}"; print(line); f.write(line + "\n")

# ── Amostra p/ validação manual (~50 linhas mescladas) ────────────────────
con.execute(f"""
COPY (
  SELECT * FROM (
    SELECT 'contato' tipo, d.cnpj, d.campo detalhe, d.valor_novo valor, cast(NULL AS VARCHAR) extra
    FROM delta_contacts d ORDER BY random() LIMIT 30
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'socio_novo', p.cnpj, p.nome, p.qualificacao, p.cpf
    FROM delta_partners p ORDER BY random() LIMIT 15
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'prospect', cnpj, razao_social, email, fone1 FROM prospects ORDER BY random() LIMIT 10
  )
) TO '{OUT}/amostra_delta.csv' (FORMAT CSV, HEADER)
""")
log("FASE 4 CONCLUÍDA — amostra em amostra_delta.csv; NADA aplicado em produção")
