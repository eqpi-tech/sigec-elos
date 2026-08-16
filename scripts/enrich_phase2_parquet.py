#!/usr/bin/env python3
"""Fase 2 do enriquecimento: S3 CSV (PF 11GB + PJ 32GB) → parquet normalizado.
Leitura única do S3, encoding latin-1, normalização:
- cnpj/cpf: só dígitos, padded 14/11; linhas inválidas descartadas
- telefones: ddd+numero só dígitos (vazio se incompleto)
- email: lower/trim
Saída: enrich/pf.parquet e enrich/pj.parquet + contagens em phase2_counts.txt
"""
import os, sys, time
import duckdb

OUT = os.environ.get("ENRICH_OUT", "/private/tmp/claude-501/-Users-luiz-panareli-Downloads-workspaces-eqpi-new-sigec-elos/649339e1-faaf-4193-a2f3-9050230a6ce3/scratchpad/enrich")
os.makedirs(OUT, exist_ok=True)

env = {}
with open(os.path.join(os.path.dirname(__file__), "..", ".env")) as f:
    for line in f:
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"')

con = duckdb.connect()
con.execute(f"SET temp_directory='{OUT}/tmp'; SET memory_limit='6GB'; SET threads=6;")
con.execute("INSTALL httpfs; LOAD httpfs;")
# Resiliência de rede: o primeiro run da PJ travou com conexão S3 morta
con.execute("SET http_timeout=120000; SET http_retries=6; SET http_retry_wait_ms=2000; SET http_keep_alive=false;")
con.execute("SET enable_progress_bar=true;")
con.execute(f"""CREATE SECRET s3sec (TYPE S3, KEY_ID '{env["HOC_AWS_ACCESS_KEY_ID"]}',
  SECRET '{env["HOC_AWS_SECRET_ACCESS_KEY"]}', REGION 'sa-east-1',
  ENDPOINT 's3.sa-east-1.amazonaws.com', URL_STYLE 'path');""")

PF = "s3://br.com.equipo.sigec.dadosbrutos/328c5468-3ac4-46c3-81ba-f474e9a564ca.csv"
PJ = "s3://br.com.equipo.sigec.dadosbrutos/b3491e36-1097-4af9-a077-7aa3cbb8d425.csv"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

counts = {}

# ── PF (sócios) ────────────────────────────────────────────────────────────
SKIP_PF = os.environ.get("SKIP_PF") == "1"  # retomada: PF já convertida
if SKIP_PF:
    log("PF: pulada (SKIP_PF=1, parquet existente)")
if not SKIP_PF:
    log("PF: iniciando leitura/normalização...")
    con.execute(f"""
COPY (
  SELECT
    lpad(regexp_replace(cpf, '\\D', '', 'g'), 11, '0')        AS cpf,
    trim(dsnome)                                              AS nome,
    try_cast(dsparticipacao AS DOUBLE)                        AS participacao,
    try_cast(dtentrada AS DATE)                               AS dtentrada,
    nullif(trim(qualif_socio), '')                            AS qualificacao,
    lpad(regexp_replace(cnpj, '\\D', '', 'g'), 14, '0')       AS cnpj,
    nullif(trim(dsnomerazao), '')                             AS razao_social,
    nullif(trim(dsnomefantasia), '')                          AS nome_fantasia,
    try_cast(dtabertura AS DATE)                              AS dtabertura,
    CASE WHEN ddd1_so IS NOT NULL AND fone1_so IS NOT NULL AND length(fone1_so)>=8
         THEN regexp_replace(ddd1_so||fone1_so, '\\D', '', 'g') END AS fone1,
    CASE WHEN ddd2_so IS NOT NULL AND fone2_so IS NOT NULL AND length(fone2_so)>=8
         THEN regexp_replace(ddd2_so||fone2_so, '\\D', '', 'g') END AS fone2
  FROM read_csv('{PF}', all_varchar=true, encoding='latin-1', sample_size=5000)
  WHERE length(regexp_replace(cpf,  '\\D', '', 'g')) BETWEEN 10 AND 11
    AND length(regexp_replace(cnpj, '\\D', '', 'g')) BETWEEN 13 AND 14
) TO '{OUT}/pf.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
""")
counts["pf_validas"] = con.execute(f"SELECT count(*) FROM '{OUT}/pf.parquet'").fetchone()[0]
log(f"PF ok: {counts['pf_validas']} linhas válidas")

# ── PJ (empresas) ──────────────────────────────────────────────────────────
log("PJ: iniciando leitura/normalização...")
con.execute(f"""
COPY (
  SELECT
    lpad(regexp_replace(cnpj, '\\D', '', 'g'), 14, '0')       AS cnpj,
    nullif(trim(dsnomerazao), '')                             AS razao_social,
    nullif(trim(dsmatriz), '')                                AS matriz,
    try_cast(dtabertura AS DATE)                              AS dtabertura,
    nullif(trim(cdcnae), '')                                  AS cnae,
    nullif(trim(descricao_cnae), '')                          AS cnae_desc,
    try_cast(vlcapitalsocial AS DOUBLE)                       AS capital_social,
    nullif(trim(cdsituacaocadastral), '')                     AS situacao,
    try_cast(nrfuncionarios AS BIGINT)                        AS funcionarios,
    nullif(trim(dsportereceita), '')                          AS porte,
    nullif(trim(dslogradouro), '')                            AS logradouro,
    nullif(trim(dsnumero), '')                                AS numero,
    nullif(trim(dscomplemento), '')                           AS complemento,
    nullif(trim(dsbairro), '')                                AS bairro,
    nullif(trim(dscidade), '')                                AS cidade,
    nullif(trim(dsuf), '')                                    AS uf,
    regexp_replace(coalesce(dscep,''), '\\D', '', 'g')        AS cep,
    CASE WHEN ddd1 IS NOT NULL AND fone1 IS NOT NULL AND length(fone1)>=8
         THEN regexp_replace(ddd1||fone1, '\\D', '', 'g') END AS fone1,
    CASE WHEN ddd2 IS NOT NULL AND fone2 IS NOT NULL AND length(fone2)>=8
         THEN regexp_replace(ddd2||fone2, '\\D', '', 'g') END AS fone2,
    CASE WHEN ddd3 IS NOT NULL AND fone3 IS NOT NULL AND length(fone3)>=8
         THEN regexp_replace(ddd3||fone3, '\\D', '', 'g') END AS fone3,
    CASE WHEN ddd4 IS NOT NULL AND fone4 IS NOT NULL AND length(fone4)>=8
         THEN regexp_replace(ddd4||fone4, '\\D', '', 'g') END AS fone4,
    CASE WHEN dsemail IS NOT NULL AND position('@' IN dsemail) > 1
         THEN lower(trim(dsemail)) END                        AS email,
    lpad(regexp_replace(coalesce(socio_cpf,''), '\\D', '', 'g'), 11, '0') AS socio_cpf
  FROM read_csv('{PJ}', all_varchar=true, sample_size=5000)
  WHERE length(regexp_replace(cnpj, '\\D', '', 'g')) BETWEEN 13 AND 14
) TO '{OUT}/pj.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
""")  # PJ é UTF-8 (a PF é latin-1) — encoding descoberto na prática
counts["pj_validas"] = con.execute(f"SELECT count(*) FROM '{OUT}/pj.parquet'").fetchone()[0]
log(f"PJ ok: {counts['pj_validas']} linhas válidas")

# ── Resumo ────────────────────────────────────────────────────────────────
r = con.execute(f"""SELECT count(DISTINCT cnpj), count(DISTINCT cpf) FROM '{OUT}/pf.parquet'""").fetchone()
counts["pf_cnpjs"], counts["pf_cpfs"] = r
r = con.execute(f"""SELECT count(DISTINCT cnpj),
    count(*) FILTER (WHERE email IS NOT NULL),
    count(*) FILTER (WHERE fone1 IS NOT NULL) FROM '{OUT}/pj.parquet'""").fetchone()
counts["pj_cnpjs"], counts["pj_com_email"], counts["pj_com_fone"] = r

with open(f"{OUT}/phase2_counts.txt", "w") as f:
    for k, v in counts.items():
        f.write(f"{k}={v}\n")
log(f"RESUMO: {counts}")
log("FASE 2 CONCLUÍDA")
