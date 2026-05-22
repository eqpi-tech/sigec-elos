#!/usr/bin/env python3
"""
migrate_hoc.py — Migração HOC (MySQL) → SIGEC-ELOS (Supabase)

Fases:
  1. clients     — HOC cliente → SIGEC clients (todos, ativos e inativos)
  2. suppliers   — HOC fornecedor → SIGEC suppliers (upsert por CNPJ)
  3. seals_plans — HOC processo → SIGEC seals + plans
  4. documents   — HOC processo_documento → SIGEC documents (apenas selos ACTIVE)
  5. categories  — HOC fornecedor_categorias → SIGEC supplier_categories

Uso:
  pip install mysql-connector-python supabase
  python migrate_hoc.py [--dry-run] [--phase clients|suppliers|seals_plans|documents|categories]
"""

import argparse
import json
import logging
import sys
import uuid
from datetime import datetime, date, timezone
from typing import Optional

import mysql.connector
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

def load_config(path: str = "hoc_migration_config.json") -> dict:
    with open(path) as f:
        return json.load(f)


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(f"migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        ],
    )
    return logging.getLogger("hoc_migration")


log = setup_logging()


# ── Connections ───────────────────────────────────────────────────────────────

def connect_mysql(cfg: dict):
    log.info("Conectando ao MySQL HOC...")
    conn = mysql.connector.connect(
        host=cfg["host"],
        port=cfg.get("port", 3306),
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset=cfg.get("charset", "utf8mb4"),
        use_pure=cfg.get("use_pure", True),
        connection_timeout=30,
    )
    log.info("MySQL conectado.")
    return conn


def connect_supabase(cfg: dict) -> Client:
    log.info("Conectando ao Supabase...")
    client = create_client(cfg["url"], cfg["service_role_key"])
    log.info("Supabase conectado.")
    return client


# ── Helpers ───────────────────────────────────────────────────────────────────

def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def clean_cnpj(cnpj: Optional[str]) -> Optional[str]:
    if not cnpj:
        return None
    return "".join(c for c in str(cnpj) if c.isdigit())


def safe_str(val) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def to_date_str(d) -> Optional[str]:
    if d is None:
        return None
    if isinstance(d, (datetime, date)):
        return d.isoformat()
    return str(d)


def classify_seal(rows_resultado) -> tuple[str, str]:
    """
    Recebe lista de resultados de processo_categorias.
    Retorna (status, level) para o seal.

    Aprovado / Com Restrição / Com Carta → aprovado
    NULL / Pré Cadastro                  → em análise
    Não Aprovado*                        → reprovado
    """
    aprovados = 0
    em_analise = 0
    reprovados = 0

    for r in rows_resultado:
        resultado = r if isinstance(r, str) else (r or "")
        if resultado in ("Aprovado", "Aprovado Com Restrição", "Aprovado Com Carta"):
            aprovados += 1
        elif resultado in ("", "Pré Cadastro") or resultado is None:
            em_analise += 1
        else:
            reprovados += 1

    total = aprovados + em_analise + reprovados
    if total == 0:
        return ("PENDING", "Simples")

    if aprovados == total:
        return ("ACTIVE", "Premium")
    elif em_analise > 0:
        return ("PENDING", "Simples")
    else:
        return ("SUSPENDED", "Simples")


# ── Phase 1: Clients ──────────────────────────────────────────────────────────

def migrate_clients(mysql_conn, sb: Client, dry_run: bool, s3_cfg: dict):
    log.info("=== FASE 1: Clientes ===")
    cur = mysql_conn.cursor(dictionary=True)

    cur.execute("SELECT id, razao_social, nome_fantasia, cnpj, sigla, ativo FROM cliente")
    rows = cur.fetchall()
    log.info(f"HOC clientes encontrados: {len(rows)}")

    inserted = updated = skipped = 0

    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        razao = safe_str(row["razao_social"]) or f"Cliente HOC {row['id']}"
        hoc_id = row["id"]

        record = {
            "hoc_id": hoc_id,
            "razao_social": razao,
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "cnpj": cnpj,
        }

        if dry_run:
            log.info(f"  [DRY] cliente hoc_id={hoc_id} cnpj={cnpj} razao={razao}")
            inserted += 1
            continue

        try:
            # Lookup ONLY by hoc_id — CNPJ fallback omitido pois vários clientes HOC
            # compartilham CNPJs inválidos (00000000000000) e sobrescrevem uns aos outros
            existing = None
            res = sb.table("clients").select("id").eq("hoc_id", hoc_id).execute()
            if res.data:
                existing = res.data[0]["id"]
            elif cnpj and len(set(cnpj)) > 1:  # só usa CNPJ real como fallback
                res2 = sb.table("clients").select("id").eq("cnpj", cnpj).execute()
                if res2.data:
                    existing = res2.data[0]["id"]

            if existing:
                sb.table("clients").update(record).eq("id", existing).execute()
                updated += 1
            else:
                sb.table("clients").insert(record).execute()
                inserted += 1

        except Exception as e:
            log.error(f"  ERRO cliente hoc_id={hoc_id}: {e}")
            skipped += 1

    log.info(f"Clientes: {inserted} inseridos, {updated} atualizados, {skipped} erros")
    cur.close()


# ── Phase 2: Suppliers ────────────────────────────────────────────────────────

def migrate_suppliers(mysql_conn, sb: Client, dry_run: bool, batch_size: int):
    log.info("=== FASE 2: Fornecedores ===")
    cur = mysql_conn.cursor(dictionary=True)

    cur.execute("""
        SELECT
            f.id, f.cnpj, f.razao_social, f.nome_fantasia,
            f.email_comercial, f.ativo, f.regime_tributario,
            f.municipio,
            ef.uf           AS uf,
            ef.nome_logradouro AS logradouro,
            ef.cep          AS cep,
            ct.nome         AS contact_name,
            ct.telefone     AS contact_phone
        FROM fornecedor f
        LEFT JOIN (
            SELECT id_fornecedor, MIN(id) as min_id
            FROM endereco_fornecedor WHERE tipo = 'CR'
            GROUP BY id_fornecedor
        ) ef_min ON ef_min.id_fornecedor = f.id
        LEFT JOIN endereco_fornecedor ef
            ON ef.id = ef_min.min_id
        LEFT JOIN (
            SELECT id_fornecedor, MIN(id) as min_id
            FROM contato GROUP BY id_fornecedor
        ) ct_min ON ct_min.id_fornecedor = f.id
        LEFT JOIN contato ct ON ct.id = ct_min.min_id
        ORDER BY f.id
    """)
    # Note: endereco columns are uf, nome_logradouro, cep (not estado/logradouro)
    rows = cur.fetchall()
    log.info(f"HOC fornecedores encontrados: {len(rows)}")

    inserted = updated = skipped = 0

    for i, row in enumerate(rows):
        if i % 500 == 0:
            log.info(f"  Progresso: {i}/{len(rows)}")

        cnpj = clean_cnpj(row["cnpj"])
        hoc_id = row["id"]

        if not cnpj:
            log.warning(f"  Fornecedor hoc_id={hoc_id} sem CNPJ — pulando")
            skipped += 1
            continue

        status = "SUSPENDED" if not row["ativo"] else "PENDING"

        address = {}
        if row.get("logradouro"):
            address["logradouro"] = safe_str(row["logradouro"])
        if row.get("cep"):
            address["cep"] = safe_str(row["cep"])
        if row.get("municipio"):
            address["municipio"] = safe_str(row["municipio"])
        if row.get("uf"):
            address["uf"] = safe_str(row["uf"])

        record = {
            "hoc_id": hoc_id,
            "cnpj": cnpj,
            "razao_social": safe_str(row["razao_social"]) or f"Fornecedor HOC {hoc_id}",
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "email": safe_str(row.get("email_comercial")),
            "contact_name": safe_str(row.get("contact_name")),
            "phone": safe_str(row.get("contact_phone")),
            "state": safe_str(row.get("uf")),
            "city": safe_str(row.get("municipio")),
            "address": address if address else None,
            "regime_tributario": safe_str(row.get("regime_tributario")),
            "status": status,
        }

        if dry_run:
            log.info(f"  [DRY] fornecedor hoc_id={hoc_id} cnpj={cnpj} status={status}")
            inserted += 1
            continue

        try:
            # Upsert by CNPJ (SIGEC has UNIQUE on cnpj)
            res = sb.table("suppliers").upsert(
                record, on_conflict="cnpj"
            ).execute()
            if res.data:
                inserted += 1
        except Exception as e:
            log.error(f"  ERRO fornecedor hoc_id={hoc_id} cnpj={cnpj}: {e}")
            skipped += 1

    log.info(f"Fornecedores: {inserted} upserted, {skipped} erros")
    cur.close()


# ── Phase 3: Seals + Plans ────────────────────────────────────────────────────

def migrate_seals_plans(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE 3: Selos + Planos ===")
    cur = mysql_conn.cursor(dictionary=True)

    # For each valid process (ativo=1, data_validade >= NOW()), grouped by (fornecedor, cliente)
    # Take the most recent process per pair
    cur.execute("""
        SELECT
            p.id                 AS proc_id,
            p.id_fornecedor,
            fl.id_cliente,
            f.cnpj               AS fornecedor_cnpj,
            c.sigla              AS cliente_sigla,
            p.data_validade,
            p.subsidiado
        FROM processo p
        JOIN fluxo fl ON fl.id = p.id_fluxo
        JOIN fornecedor f ON f.id = p.id_fornecedor
        JOIN cliente c ON c.id = fl.id_cliente
        WHERE p.ativo = 1
          AND p.data_validade >= NOW()
          AND f.cnpj IS NOT NULL
          AND f.cnpj != ''
        ORDER BY p.id_fornecedor, fl.id_cliente, p.id DESC
    """)
    all_processes = cur.fetchall()
    log.info(f"HOC processos válidos ativos: {len(all_processes)}")

    # Deduplicate: keep only most recent per (fornecedor, cliente) pair
    seen_pairs = {}
    for row in all_processes:
        key = (row["id_fornecedor"], row["id_cliente"])
        if key not in seen_pairs:
            seen_pairs[key] = row

    processes = list(seen_pairs.values())
    log.info(f"Pares únicos fornecedor×cliente a processar: {len(processes)}")

    # Build map of supplier CNPJ → SIGEC supplier UUID
    log.info("Carregando mapa CNPJ → supplier UUID do SIGEC...")
    supplier_map = {}  # cnpj → sigec_supplier_id
    offset = 0
    while True:
        res = sb.table("suppliers").select("id,cnpj").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            if s["cnpj"]:
                supplier_map[clean_cnpj(s["cnpj"])] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info(f"  {len(supplier_map)} fornecedores no SIGEC")

    # Build map of hoc client_id → SIGEC client UUID
    log.info("Carregando mapa hoc_id → client UUID do SIGEC...")
    client_map = {}  # hoc_client_id → sigec_client_id
    res = sb.table("clients").select("id,hoc_id").execute()
    for c in (res.data or []):
        if c["hoc_id"]:
            client_map[c["hoc_id"]] = c["id"]
    log.info(f"  {len(client_map)} clientes no SIGEC")

    # For plans: track max expiry per supplier (one plan per supplier)
    supplier_plan = {}  # sigec_supplier_id → {expires_at, hoc_process_id}

    seals_created = seals_updated = seals_skipped = 0

    for row in processes:
        cnpj = clean_cnpj(row["fornecedor_cnpj"])
        supplier_id = supplier_map.get(cnpj)
        hoc_client_id = row["id_cliente"]
        client_id = client_map.get(hoc_client_id)
        proc_id = row["proc_id"]

        if not supplier_id:
            log.warning(f"  Fornecedor CNPJ={cnpj} não encontrado no SIGEC — pulando seal")
            seals_skipped += 1
            continue

        if not client_id:
            log.warning(f"  Cliente hoc_id={hoc_client_id} não encontrado no SIGEC — pulando seal")
            seals_skipped += 1
            continue

        # Get resultados das categorias para este processo
        cur2 = mysql_conn.cursor()
        cur2.execute(
            "SELECT resultado FROM processo_categorias WHERE id_processo = %s",
            (proc_id,)
        )
        resultados = [r[0] or "" for r in cur2.fetchall()]
        cur2.close()

        seal_status, seal_level = classify_seal(resultados)
        sigla = safe_str(row.get("cliente_sigla")) or f"HOC-{hoc_client_id}"
        seal_name = f"HOC – {sigla}"
        expiry_date = to_date_str(row["data_validade"])

        seal_record = {
            "supplier_id": supplier_id,
            "client_id": client_id,
            "status": seal_status,
            "level": seal_level,
            "seal_name": seal_name,
            "hoc_process_id": proc_id,
            "hoc_expiry_date": expiry_date,
            "hoc_resultado": ",".join(set(r for r in resultados if r)) or None,
        }

        if seal_status == "ACTIVE":
            seal_record["expires_at"] = expiry_date

        if dry_run:
            log.info(f"  [DRY] seal supplier={supplier_id} client={client_id} {seal_status}/{seal_level}")
            seals_created += 1
        else:
            try:
                # Check if seal already exists for this pair
                res = sb.table("seals").select("id").eq("supplier_id", supplier_id).eq("client_id", client_id).execute()
                if res.data:
                    sb.table("seals").update(seal_record).eq("id", res.data[0]["id"]).execute()
                    seals_updated += 1
                else:
                    sb.table("seals").insert(seal_record).execute()
                    seals_created += 1

                # Track plan: keep the latest expiry per supplier
                if seal_status == "ACTIVE" and row["data_validade"]:
                    existing_plan = supplier_plan.get(supplier_id)
                    if existing_plan is None or row["data_validade"] > existing_plan["expiry"]:
                        supplier_plan[supplier_id] = {
                            "expiry": row["data_validade"],
                            "hoc_process_id": proc_id,
                        }

                # Update supplier status to ACTIVE if they have at least one ACTIVE seal
                if seal_status == "ACTIVE":
                    sb.table("suppliers").update({"status": "ACTIVE"}).eq("id", supplier_id).neq("status", "SUSPENDED").execute()

            except Exception as e:
                log.error(f"  ERRO seal supplier={supplier_id} client={client_id}: {e}")
                seals_skipped += 1

    log.info(f"Selos: {seals_created} criados, {seals_updated} atualizados, {seals_skipped} erros")

    # Create/update plans for ACTIVE suppliers
    log.info(f"Criando planos para {len(supplier_plan)} fornecedores com selo ACTIVE...")
    plans_created = plans_updated = plans_skipped = 0

    for supplier_id, plan_data in supplier_plan.items():
        plan_record = {
            "supplier_id": supplier_id,
            "type": "Premium",
            "status": "ACTIVE",
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": to_date_str(plan_data["expiry"]),
            "source": "HOC",
            "hoc_process_id": plan_data["hoc_process_id"],
        }

        if dry_run:
            plans_created += 1
            continue

        try:
            res = sb.table("plans").select("id").eq("supplier_id", supplier_id).execute()
            if res.data:
                sb.table("plans").update(plan_record).eq("id", res.data[0]["id"]).execute()
                plans_updated += 1
            else:
                sb.table("plans").insert(plan_record).execute()
                plans_created += 1
        except Exception as e:
            log.error(f"  ERRO plan supplier_id={supplier_id}: {e}")
            plans_skipped += 1

    log.info(f"Planos: {plans_created} criados, {plans_updated} atualizados, {plans_skipped} erros")
    cur.close()


# ── Phase 4: Documents ────────────────────────────────────────────────────────

def migrate_documents(mysql_conn, sb: Client, dry_run: bool, s3_cfg: dict):
    log.info("=== FASE 4: Documentos ===")
    cur = mysql_conn.cursor(dictionary=True)

    # Only import documents for valid active processes
    # Most recent approved document (situacao='O') per (fornecedor, documento_tipo) per process
    cur.execute("""
        SELECT
            pd.id_processo,
            pd.id_documento,
            d.descricao           AS doc_descricao,
            pd.data_vencimento,
            pd.situacao,
            a.id                  AS arquivo_id,
            a.nome                AS arquivo_nome,
            f.cnpj                AS fornecedor_cnpj
        FROM processo_documento pd
        JOIN processo p ON p.id = pd.id_processo
        JOIN documento d ON d.id = pd.id_documento
        JOIN arquivo a ON a.id = pd.id_arquivo
        JOIN fornecedor f ON f.id = p.id_fornecedor
        WHERE p.ativo = 1
          AND p.data_validade >= NOW()
          AND pd.situacao = 'O'
          AND f.cnpj IS NOT NULL
          AND f.cnpj != ''
        ORDER BY p.id_fornecedor, pd.id_documento, pd.id DESC
    """)
    rows = cur.fetchall()
    log.info(f"HOC documentos aprovados em processos válidos: {len(rows)}")

    # Build CNPJ → supplier UUID map
    supplier_map = {}
    offset = 0
    while True:
        res = sb.table("suppliers").select("id,cnpj").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            if s["cnpj"]:
                supplier_map[clean_cnpj(s["cnpj"])] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000

    s3_base = s3_cfg["base_url"].rstrip("/") + "/"
    s3_prefix = s3_cfg.get("key_prefix", "hoc_file_")

    inserted = skipped = 0

    # Deduplicate: per (fornecedor, id_documento) keep latest arquivo
    seen = {}
    for row in rows:
        key = (row["fornecedor_cnpj"], row["id_documento"])
        if key not in seen:
            seen[key] = row

    for row in seen.values():
        cnpj = clean_cnpj(row["fornecedor_cnpj"])
        supplier_id = supplier_map.get(cnpj)
        if not supplier_id:
            skipped += 1
            continue

        arquivo_id = row["arquivo_id"]
        s3_url = f"{s3_base}{s3_prefix}{arquivo_id}"

        doc_record = {
            "supplier_id": supplier_id,
            "type": str(row["id_documento"]),
            "label": safe_str(row["doc_descricao"]),
            "source": "MANUAL",
            "status": "VALID" if row["situacao"] == "O" else "EXPIRED",
            "expires_at": to_date_str(row.get("data_vencimento")),
            "public_url": s3_url,
            "hoc_arquivo_id": arquivo_id,
            "hoc_s3_url": s3_url,
        }

        if dry_run:
            log.info(f"  [DRY] doc supplier={supplier_id} tipo={row['id_documento']} arquivo={arquivo_id}")
            inserted += 1
            continue

        try:
            sb.table("documents").upsert(
                doc_record,
                on_conflict="supplier_id,hoc_arquivo_id"
            ).execute()
            inserted += 1
        except Exception as e:
            log.error(f"  ERRO doc arquivo_id={arquivo_id}: {e}")
            skipped += 1

    log.info(f"Documentos: {inserted} upserted, {skipped} erros")
    cur.close()


# ── Phase 5: Supplier Categories ─────────────────────────────────────────────

def migrate_categories(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE 5 (6 no plano): Categorias de Fornecedores ===")
    cur = mysql_conn.cursor(dictionary=True)

    # IDs de categoria do HOC são preservados no SIGEC (patch_017)
    # Busca fornecedores ativos com categorias
    cur.execute("""
        SELECT
            fc.id_fornecedor,
            fc.id_categoria,
            f.cnpj
        FROM fornecedor_categorias fc
        JOIN fornecedor f ON f.id = fc.id_fornecedor
        WHERE f.ativo = 1
          AND f.cnpj IS NOT NULL
          AND f.cnpj != ''
        ORDER BY fc.id_fornecedor
    """)
    rows = cur.fetchall()
    log.info(f"HOC vínculos fornecedor×categoria: {len(rows)}")

    # Build CNPJ → supplier UUID map
    supplier_map = {}
    offset = 0
    while True:
        res = sb.table("suppliers").select("id,cnpj").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            if s["cnpj"]:
                supplier_map[clean_cnpj(s["cnpj"])] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000

    # Verify which category IDs exist in SIGEC
    log.info("Verificando IDs de categoria disponíveis no SIGEC...")
    cat_res = sb.table("categories").select("id").execute()
    valid_cat_ids = {c["id"] for c in (cat_res.data or [])}
    log.info(f"  {len(valid_cat_ids)} categorias no SIGEC")

    inserted = skipped = 0
    batch = []

    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        supplier_id = supplier_map.get(cnpj)
        category_id = row["id_categoria"]

        if not supplier_id:
            skipped += 1
            continue
        if category_id not in valid_cat_ids:
            skipped += 1
            continue

        batch.append({"supplier_id": supplier_id, "category_id": category_id})

        if len(batch) >= 500:
            if not dry_run:
                try:
                    sb.table("supplier_categories").upsert(
                        batch, on_conflict="supplier_id,category_id"
                    ).execute()
                    inserted += len(batch)
                except Exception as e:
                    log.error(f"  ERRO batch categorias: {e}")
                    skipped += len(batch)
            else:
                inserted += len(batch)
            batch = []

    if batch:
        if not dry_run:
            try:
                sb.table("supplier_categories").upsert(
                    batch, on_conflict="supplier_id,category_id"
                ).execute()
                inserted += len(batch)
            except Exception as e:
                log.error(f"  ERRO batch final categorias: {e}")
                skipped += len(batch)
        else:
            inserted += len(batch)

    log.info(f"Categorias: {inserted} upserted, {skipped} pulados")
    cur.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migração HOC → SIGEC-ELOS")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem gravar no banco")
    parser.add_argument(
        "--phase",
        choices=["clients", "suppliers", "seals_plans", "documents", "categories", "all"],
        default="all",
        help="Fase a executar (padrão: all)",
    )
    parser.add_argument("--config", default="hoc_migration_config.json", help="Arquivo de config")
    args = parser.parse_args()

    cfg = load_config(args.config)

    if cfg["sigec_supabase"]["url"] == "FILL_IN_SUPABASE_URL":
        log.error("Configure sigec_supabase.url e sigec_supabase.service_role_key em " + args.config)
        sys.exit(1)

    dry_run = args.dry_run or cfg["migration"].get("dry_run", False)
    if dry_run:
        log.info("*** MODO DRY-RUN — nenhuma gravação será feita ***")

    batch_size = cfg["migration"].get("batch_size", 500)
    s3_cfg = cfg["hoc_s3"]
    phases = cfg["migration"].get("phases", ["clients", "suppliers", "seals_plans", "documents", "categories"])
    run_phase = args.phase

    mysql_conn = connect_mysql(cfg["hoc_mysql"])
    sb = connect_supabase(cfg["sigec_supabase"])

    try:
        if run_phase in ("all", "clients") and "clients" in phases:
            migrate_clients(mysql_conn, sb, dry_run, s3_cfg)

        if run_phase in ("all", "suppliers") and "suppliers" in phases:
            migrate_suppliers(mysql_conn, sb, dry_run, batch_size)

        if run_phase in ("all", "seals_plans") and "seals_plans" in phases:
            migrate_seals_plans(mysql_conn, sb, dry_run)

        if run_phase in ("all", "documents") and "documents" in phases:
            migrate_documents(mysql_conn, sb, dry_run, s3_cfg)

        if run_phase in ("all", "categories") and "categories" in phases:
            migrate_categories(mysql_conn, sb, dry_run)

        log.info("=== MIGRAÇÃO CONCLUÍDA ===")

    finally:
        mysql_conn.close()


if __name__ == "__main__":
    main()
