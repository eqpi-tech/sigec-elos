#!/usr/bin/env python3
"""
migrate_hoc_v2.py — Migração HOC (MySQL) → SIGEC-ELOS (Supabase), versão 2.

Diferenças da v1:
  - Categorias POR CLIENTE preservadas (categories.client_id, patch_032/033)
  - Catálogo de documentos completo do HOC + vínculos categoria→documento
    (category_documents), com desclassificatório → blocking
  - Meta: 0 descartes silenciosos — fase `reconcile` relata tudo
  - Arquivos permanecem no S3 do HOC (abertos via função get-hoc-file)
  - Sessão MySQL marcada READ ONLY — escrita apenas no Supabase

Pré-requisitos: patch_033 executado; reset_migrated_data_v2.sql executado.

Uso:
  python3 migrate_hoc_v2.py [--dry-run] [--phase <fase>|all]
  Fases: clients, client_categories, catalog_and_links, suppliers,
         supplier_categories, seals_plans, documents, reconcile
"""

import argparse
import json
import logging
import sys
from datetime import datetime, date, timezone
from typing import Optional

import mysql.connector
from supabase import create_client, Client

# Categorias de cliente: id ELOS = OFFSET + id HOC (determinístico, sem colisão
# com a árvore global que usa o namespace original < 1M)
CAT_ID_OFFSET = 1_000_000

RESP_MAP = {"C": "cliente", "F": "fornecedor", "I": "interna"}

# ── Infra ─────────────────────────────────────────────────────────────────────

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(f"migration_v2_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        ],
    )
    return logging.getLogger("hoc_migration_v2")


log = setup_logging()

# Relatório de reconciliação — nenhum descarte é silencioso
STATS: dict = {}

def stat(phase: str, **kwargs):
    s = STATS.setdefault(phase, {"hoc_count": 0, "written": 0, "skipped": 0, "discards": []})
    for k, v in kwargs.items():
        if k == "discard":
            s["discards"].append(v)
            s["skipped"] += 1
        else:
            s[k] = s.get(k, 0) + v if isinstance(v, int) and k in ("written", "skipped", "hoc_count") else v


def connect_mysql(cfg: dict):
    conn = mysql.connector.connect(
        host=cfg["host"], port=cfg.get("port", 3306),
        user=cfg["user"], password=cfg["password"],
        database=cfg["database"], charset=cfg.get("charset", "utf8mb4"),
        use_pure=True, connection_timeout=60,
    )
    cur = conn.cursor()
    cur.execute("SET SESSION transaction_read_only = 1")
    cur.close()
    log.info("MySQL conectado (sessão READ ONLY).")
    return conn


def connect_supabase(cfg: dict) -> Client:
    client = create_client(cfg["url"], cfg["service_role_key"])
    log.info("Supabase conectado.")
    return client


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def clean_cnpj(cnpj) -> Optional[str]:
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


def load_supplier_map(sb: Client, mysql_conn=None, dry_run: bool = False) -> dict:
    """cnpj → supplier UUID. No dry-run, simula com os CNPJs do HOC
    (a fase suppliers não gravou nada — sem isso as fases seguintes
    reportariam descartes falsos)."""
    if dry_run and mysql_conn is not None:
        cur = mysql_conn.cursor()
        cur.execute("SELECT cnpj FROM fornecedor WHERE cnpj IS NOT NULL AND cnpj != ''")
        # valor único por CNPJ — senão a deduplicação por supplier_id colapsa tudo
        m = {clean_cnpj(r[0]): f"DRY-{clean_cnpj(r[0])}" for r in cur.fetchall() if clean_cnpj(r[0])}
        cur.close()
        return m
    m, offset = {}, 0
    while True:
        res = sb.table("suppliers").select("id,cnpj").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            if s["cnpj"]:
                m[clean_cnpj(s["cnpj"])] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    return m


def load_client_map(sb: Client) -> dict:
    """hoc_id → client UUID"""
    res = sb.table("clients").select("id,hoc_id").execute()
    return {c["hoc_id"]: c["id"] for c in (res.data or []) if c.get("hoc_id")}


# ── Fase 1: clients ───────────────────────────────────────────────────────────

def phase_clients(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE clients ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("SELECT id, razao_social, nome_fantasia, cnpj, sigla, ativo FROM cliente")
    rows = cur.fetchall()
    stat("clients", hoc_count=len(rows))
    log.info(f"HOC clientes: {len(rows)}")

    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        record = {
            "hoc_id": row["id"],
            "razao_social": safe_str(row["razao_social"]) or f"Cliente HOC {row['id']}",
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "sigla": safe_str(row.get("sigla")),
            "cnpj": cnpj,
        }
        if dry_run:
            stat("clients", written=1)
            continue
        try:
            # lookup por hoc_id (CNPJs do HOC podem ser inválidos/duplicados)
            res = sb.table("clients").select("id").eq("hoc_id", row["id"]).execute()
            if res.data:
                sb.table("clients").update(record).eq("id", res.data[0]["id"]).execute()
            else:
                sb.table("clients").insert(record).execute()
            stat("clients", written=1)
        except Exception as e:
            log.error(f"  ERRO cliente hoc_id={row['id']}: {e}")
            stat("clients", discard={"phase": "clients", "hoc_id": row["id"], "motivo": str(e)})
    cur.close()


# ── Fase 2: client_categories ────────────────────────────────────────────────

def phase_client_categories(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE client_categories ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, descricao, id_cliente, id_categoria_pai, codigo,
               descricao_ingles, status
        FROM categoria ORDER BY id
    """)
    rows = cur.fetchall()
    stat("client_categories", hoc_count=len(rows))
    log.info(f"HOC categorias: {len(rows)}")

    client_map = load_client_map(sb)
    cat_ids = {r["id"] for r in rows}

    batch = []
    for row in rows:
        client_id = client_map.get(row["id_cliente"])
        if not client_id:
            stat("client_categories", discard={
                "phase": "client_categories", "hoc_id": row["id"],
                "motivo": f"cliente hoc_id={row['id_cliente']} não migrado"})
            continue

        pai = row["id_categoria_pai"]
        parent_id = (CAT_ID_OFFSET + pai) if (pai and pai in cat_ids) else None

        batch.append({
            "id": CAT_ID_OFFSET + row["id"],
            "hoc_id": row["id"],
            "client_id": client_id,
            "name": safe_str(row["descricao"]) or f"Categoria {row['id']}",
            "parent_id": parent_id,
            "codigo": safe_str(row.get("codigo")),
            "name_en": safe_str(row.get("descricao_ingles")),
            "active": bool(row.get("status")),
        })

    if dry_run:
        stat("client_categories", written=len(batch))
        log.info(f"[DRY] {len(batch)} categorias seriam gravadas")
        cur.close()
        return

    # Duas passadas: primeiro sem parent (evita FK para pai ainda não inserido),
    # depois REGRAVA os registros completos com parent_id.
    # (upsert parcial {id, parent_id} falha: o caminho de insert do ON CONFLICT
    #  viola o NOT NULL de name — bug que deixou 10k categorias sem hierarquia)
    for chunk in chunks([{**b, "parent_id": None} for b in batch], 500):
        try:
            sb.table("categories").upsert(chunk, on_conflict="id").execute()
            stat("client_categories", written=len(chunk))
        except Exception as e:
            log.error(f"  ERRO batch categorias: {e}")
            for b in chunk:
                stat("client_categories", discard={"phase": "client_categories", "hoc_id": b["hoc_id"], "motivo": str(e)})

    with_parent = [b for b in batch if b["parent_id"]]
    log.info(f"Atualizando parent_id de {len(with_parent)} categorias (registros completos)...")
    for chunk in chunks(with_parent, 500):
        try:
            sb.table("categories").upsert(chunk, on_conflict="id").execute()
        except Exception as e:
            log.error(f"  ERRO batch parents: {e}")
            for b in chunk:
                stat("client_categories", discard={"phase": "client_categories", "hoc_id": b["hoc_id"], "motivo": f"parent: {e}"})
    cur.close()


# ── Fase 3: catalog_and_links ────────────────────────────────────────────────

def phase_catalog_and_links(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE catalog_and_links ===")
    cur = mysql_conn.cursor(dictionary=True)

    # 3a. Catálogo completo de documentos do HOC (mesmo namespace de IDs do ELOS)
    cur.execute("""
        SELECT id, descricao, responsabilidade, busca_automatica, ativo, tipo
        FROM documento ORDER BY id
    """)
    docs = cur.fetchall()
    stat("catalog", hoc_count=len(docs))
    log.info(f"HOC documentos (tipos): {len(docs)}")

    catalog_batch = [{
        "id": d["id"],
        "name": safe_str(d["descricao"]) or f"Documento {d['id']}",
        "responsibility": RESP_MAP.get(d.get("responsabilidade"), "fornecedor"),
        "auto_collect": bool(d.get("busca_automatica")),
        "hoc_tipo": safe_str(d.get("tipo")),
        "active": bool(d.get("ativo")),
    } for d in docs]

    if dry_run:
        stat("catalog", written=len(catalog_batch))
    else:
        for chunk in chunks(catalog_batch, 500):
            try:
                sb.table("documents_catalog").upsert(chunk, on_conflict="id").execute()
                stat("catalog", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch catálogo: {e}")
                for b in chunk:
                    stat("catalog", discard={"phase": "catalog", "hoc_id": b["id"], "motivo": str(e)})

    # 3b. Vínculos categoria→documento (desclassificatorio → blocking)
    cur.execute("""
        SELECT cd.id_categoria, cd.id_documento, cd.desclassificatorio
        FROM categoria_documento cd
        JOIN categoria c ON c.id = cd.id_categoria
    """)
    links = cur.fetchall()
    stat("category_links", hoc_count=len(links))
    log.info(f"HOC vínculos categoria×documento: {len(links)}")

    valid_doc_ids = {d["id"] for d in docs}
    link_batch = []
    seen = set()
    for lk in links:
        key = (lk["id_categoria"], lk["id_documento"])
        if key in seen:
            continue
        seen.add(key)
        if lk["id_documento"] not in valid_doc_ids:
            stat("category_links", discard={
                "phase": "category_links", "categoria": lk["id_categoria"],
                "documento": lk["id_documento"], "motivo": "documento inexistente no HOC"})
            continue
        link_batch.append({
            "category_id": CAT_ID_OFFSET + lk["id_categoria"],
            "document_id": lk["id_documento"],
            "required": True,
            "blocking": bool(lk.get("desclassificatorio")),
        })

    if dry_run:
        stat("category_links", written=len(link_batch))
        log.info(f"[DRY] {len(link_batch)} vínculos seriam gravados")
    else:
        for chunk in chunks(link_batch, 500):
            try:
                sb.table("category_documents").upsert(chunk, on_conflict="category_id,document_id").execute()
                stat("category_links", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch vínculos: {e}")
                for b in chunk:
                    stat("category_links", discard={
                        "phase": "category_links", "categoria": b["category_id"],
                        "documento": b["document_id"], "motivo": str(e)})
    cur.close()


# ── Fase 4: suppliers ─────────────────────────────────────────────────────────

def phase_suppliers(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE suppliers ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT
            f.id, f.cnpj, f.razao_social, f.nome_fantasia,
            f.email_comercial, f.ativo, f.regime_tributario, f.municipio,
            ef.uf AS uf, ef.nome_logradouro AS logradouro, ef.cep AS cep,
            ct.nome AS contact_name, ct.telefone AS contact_phone
        FROM fornecedor f
        LEFT JOIN (
            SELECT id_fornecedor, MIN(id) as min_id
            FROM endereco_fornecedor WHERE tipo = 'CR' GROUP BY id_fornecedor
        ) ef_min ON ef_min.id_fornecedor = f.id
        LEFT JOIN endereco_fornecedor ef ON ef.id = ef_min.min_id
        LEFT JOIN (
            SELECT id_fornecedor, MIN(id) as min_id FROM contato GROUP BY id_fornecedor
        ) ct_min ON ct_min.id_fornecedor = f.id
        LEFT JOIN contato ct ON ct.id = ct_min.min_id
        ORDER BY f.id
    """)
    rows = cur.fetchall()
    stat("suppliers", hoc_count=len(rows))
    log.info(f"HOC fornecedores: {len(rows)}")

    # Monta registros deduplicados por CNPJ (última linha do HOC vence — mesmo
    # resultado do upsert sequencial da v1, mas relatado com transparência)
    by_cnpj = {}
    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        if not cnpj:
            stat("suppliers", discard={"phase": "suppliers", "hoc_id": row["id"], "motivo": "sem CNPJ"})
            continue

        if cnpj in by_cnpj:
            stat("suppliers", discard={
                "phase": "suppliers", "hoc_id": by_cnpj[cnpj]["hoc_id"], "cnpj": cnpj,
                "motivo": f"CNPJ duplicado no HOC — mesclado com hoc_id {row['id']} (linha mais recente vence)"})

        address = {k: safe_str(row[c]) for k, c in
                   [("logradouro", "logradouro"), ("cep", "cep"), ("municipio", "municipio"), ("uf", "uf")]
                   if row.get(c)}

        by_cnpj[cnpj] = {
            "hoc_id": row["id"],
            "cnpj": cnpj,
            "razao_social": safe_str(row["razao_social"]) or f"Fornecedor HOC {row['id']}",
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "email": safe_str(row.get("email_comercial")),
            "contact_name": safe_str(row.get("contact_name")),
            "phone": safe_str(row.get("contact_phone")),
            "state": safe_str(row.get("uf")),
            "city": safe_str(row.get("municipio")),
            "address": address or None,
            "regime_tributario": safe_str(row.get("regime_tributario")),
            "status": "SUSPENDED" if not row["ativo"] else "PENDING",
        }

    records = list(by_cnpj.values())
    log.info(f"  {len(records)} fornecedores únicos por CNPJ")

    if dry_run:
        stat("suppliers", written=len(records))
    else:
        done = 0
        for chunk in chunks(records, 500):
            try:
                sb.table("suppliers").upsert(chunk, on_conflict="cnpj").execute()
                stat("suppliers", written=len(chunk))
            except Exception as e:
                # fallback: isola o erro linha a linha
                log.error(f"  ERRO batch suppliers ({e}) — tentando individualmente")
                for r in chunk:
                    try:
                        sb.table("suppliers").upsert(r, on_conflict="cnpj").execute()
                        stat("suppliers", written=1)
                    except Exception as e2:
                        stat("suppliers", discard={"phase": "suppliers", "hoc_id": r["hoc_id"], "cnpj": r["cnpj"], "motivo": str(e2)})
            done += len(chunk)
            if done % 5000 < 500:
                log.info(f"  Progresso: {done}/{len(records)}")
    cur.close()


# ── Fase 5: supplier_categories ──────────────────────────────────────────────

def phase_supplier_categories(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE supplier_categories (meta: 0 descartes) ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT fc.id_fornecedor, fc.id_categoria, f.cnpj
        FROM fornecedor_categorias fc
        JOIN fornecedor f ON f.id = fc.id_fornecedor
        ORDER BY fc.id_fornecedor
    """)
    rows = cur.fetchall()
    stat("supplier_categories", hoc_count=len(rows))
    log.info(f"HOC vínculos fornecedor×categoria: {len(rows)}")

    supplier_map = load_supplier_map(sb, mysql_conn, dry_run)

    # categorias de cliente migradas (ids com offset)
    if dry_run:
        # No dry-run a fase client_categories não gravou — simula com os IDs do HOC
        cur2 = mysql_conn.cursor()
        cur2.execute("SELECT id FROM categoria")
        cat_ids = {CAT_ID_OFFSET + r[0] for r in cur2.fetchall()}
        cur2.close()
        log.info(f"  [DRY] {len(cat_ids)} categorias simuladas a partir do HOC")
    else:
        cat_ids = set()
        offset = 0
        while True:
            res = sb.table("categories").select("id").not_.is_("client_id", "null").range(offset, offset + 999).execute()
            if not res.data:
                break
            cat_ids.update(c["id"] for c in res.data)
            if len(res.data) < 1000:
                break
            offset += 1000
        log.info(f"  {len(cat_ids)} categorias de cliente no ELOS")

    batch, seen = [], set()
    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        supplier_id = supplier_map.get(cnpj)
        cat_id = CAT_ID_OFFSET + row["id_categoria"]

        if not supplier_id:
            stat("supplier_categories", discard={
                "phase": "supplier_categories", "fornecedor_hoc": row["id_fornecedor"],
                "cnpj": cnpj, "motivo": "fornecedor não migrado (sem CNPJ na fase suppliers)"})
            continue
        if cat_id not in cat_ids:
            stat("supplier_categories", discard={
                "phase": "supplier_categories", "categoria_hoc": row["id_categoria"],
                "motivo": "categoria não migrada"})
            continue
        key = (supplier_id, cat_id)
        if key in seen:
            continue
        seen.add(key)
        batch.append({"supplier_id": supplier_id, "category_id": cat_id})

    log.info(f"  {len(batch)} vínculos válidos para gravar")
    if dry_run:
        stat("supplier_categories", written=len(batch))
    else:
        for chunk in chunks(batch, 500):
            try:
                sb.table("supplier_categories").upsert(chunk, on_conflict="supplier_id,category_id").execute()
                stat("supplier_categories", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch: {e}")
                for b in chunk:
                    stat("supplier_categories", discard={"phase": "supplier_categories", **b, "motivo": str(e)})
    cur.close()


# ── Fase 6: seals_plans ───────────────────────────────────────────────────────

def classify_seal(resultados) -> tuple:
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
    if total == 0:
        return ("PENDING", "Simples")
    if aprovados == total:
        return ("ACTIVE", "Premium")
    if em_analise > 0:
        return ("PENDING", "Simples")
    return ("SUSPENDED", "Simples")


def phase_seals_plans(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE seals_plans ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT p.id AS proc_id, p.id_fornecedor, fl.id_cliente,
               f.cnpj AS fornecedor_cnpj, c.sigla AS cliente_sigla,
               c.razao_social AS cliente_razao,
               p.data_validade, p.subsidiado
        FROM processo p
        JOIN fluxo fl ON fl.id = p.id_fluxo
        JOIN fornecedor f ON f.id = p.id_fornecedor
        JOIN cliente c ON c.id = fl.id_cliente
        WHERE p.ativo = 1 AND p.data_validade >= NOW()
          AND f.cnpj IS NOT NULL AND f.cnpj != ''
        ORDER BY p.id_fornecedor, fl.id_cliente, p.id DESC
    """)
    all_proc = cur.fetchall()
    seen_pairs = {}
    for row in all_proc:
        key = (row["id_fornecedor"], row["id_cliente"])
        if key not in seen_pairs:
            seen_pairs[key] = row
    processes = list(seen_pairs.values())
    stat("seals", hoc_count=len(processes))
    log.info(f"Pares únicos fornecedor×cliente: {len(processes)}")

    supplier_map = load_supplier_map(sb, mysql_conn, dry_run)
    client_map = load_client_map(sb)
    supplier_plan = {}
    seal_batch = []

    # Busca TODOS os resultados de uma vez (em lotes) — evita 1 query por processo
    log.info("Carregando resultados de processo_categorias em lote...")
    resultados_map = {}
    proc_ids = [r["proc_id"] for r in processes]
    cur2 = mysql_conn.cursor()
    for chunk in chunks(proc_ids, 500):
        placeholders = ",".join(["%s"] * len(chunk))
        cur2.execute(
            f"SELECT id_processo, resultado FROM processo_categorias WHERE id_processo IN ({placeholders})",
            tuple(chunk),
        )
        for pid, resultado in cur2.fetchall():
            resultados_map.setdefault(pid, []).append(resultado or "")
    cur2.close()
    log.info(f"  Resultados carregados para {len(resultados_map)} processos")

    for i, row in enumerate(processes):
        if i % 500 == 0:
            log.info(f"  Progresso seals: {i}/{len(processes)}")
        cnpj = clean_cnpj(row["fornecedor_cnpj"])
        supplier_id = supplier_map.get(cnpj)
        client_id = client_map.get(row["id_cliente"])
        if not supplier_id:
            stat("seals", discard={"phase": "seals", "cnpj": cnpj, "motivo": "fornecedor não migrado"})
            continue
        if not client_id:
            stat("seals", discard={"phase": "seals", "cliente_hoc": row["id_cliente"], "motivo": "cliente não migrado"})
            continue

        resultados = resultados_map.get(row["proc_id"], [])

        seal_status, seal_level = classify_seal(resultados)
        cliente_nome = safe_str(row.get("cliente_razao")) or safe_str(row.get("cliente_sigla")) or f"HOC-{row['id_cliente']}"
        expiry = to_date_str(row["data_validade"])

        seal_record = {
            "supplier_id": supplier_id,
            "client_id": client_id,
            "status": seal_status,
            "level": seal_level,
            "seal_type": "homologado",  # HOC = homologação com análise profissional
            "seal_name": f"Homologado – {cliente_nome}",
            "hoc_process_id": row["proc_id"],
            "hoc_expiry_date": expiry,
            "hoc_resultado": ",".join(set(r for r in resultados if r)) or None,
        }
        if seal_status == "ACTIVE":
            seal_record["expires_at"] = expiry
            if row["data_validade"]:
                prev = supplier_plan.get(supplier_id)
                if prev is None or row["data_validade"] > prev["expiry"]:
                    supplier_plan[supplier_id] = {"expiry": row["data_validade"], "hoc_process_id": row["proc_id"]}

        seal_batch.append(seal_record)

    if dry_run:
        stat("seals", written=len(seal_batch))
    else:
        # Pós-reset a tabela está vazia → inserts em lote.
        # (upsert com on_conflict não funciona com índice único parcial do seals)
        existing = set()
        offset = 0
        while True:
            res = sb.table("seals").select("supplier_id,client_id").range(offset, offset + 999).execute()
            if not res.data:
                break
            existing.update((s["supplier_id"], s["client_id"]) for s in res.data)
            if len(res.data) < 1000:
                break
            offset += 1000

        to_insert = [s for s in seal_batch if (s["supplier_id"], s["client_id"]) not in existing]
        to_update = [s for s in seal_batch if (s["supplier_id"], s["client_id"]) in existing]

        for chunk in chunks(to_insert, 200):
            try:
                sb.table("seals").insert(chunk).execute()
                stat("seals", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch seals: {e}")
                for s in chunk:
                    stat("seals", discard={"phase": "seals", "supplier_id": s["supplier_id"], "motivo": str(e)})

        for s in to_update:
            try:
                sb.table("seals").update(s).eq("supplier_id", s["supplier_id"]).eq("client_id", s["client_id"]).execute()
                stat("seals", written=1)
            except Exception as e:
                stat("seals", discard={"phase": "seals", "supplier_id": s["supplier_id"], "motivo": str(e)})

        # Fornecedores com selo ACTIVE ficam ACTIVE (exceto suspensos) — em lote
        active_suppliers = list({s["supplier_id"] for s in seal_batch if s["status"] == "ACTIVE"})
        log.info(f"Ativando {len(active_suppliers)} fornecedores com selo ACTIVE...")
        for chunk in chunks(active_suppliers, 200):
            try:
                sb.table("suppliers").update({"status": "ACTIVE"}).in_("id", chunk).neq("status", "SUSPENDED").execute()
            except Exception as e:
                log.error(f"  ERRO batch ativação: {e}")

    log.info(f"Planos para {len(supplier_plan)} fornecedores ACTIVE...")
    stat("plans", hoc_count=len(supplier_plan))
    plan_batch = [{
        "supplier_id": supplier_id,
        # patch_023: CHECK type IN (verificado|homologado) — HOC = análise profissional
        "type": "homologado",
        "status": "ACTIVE",
        "starts_at": datetime.now(timezone.utc).isoformat(),
        "ends_at": to_date_str(pdata["expiry"]),
        "source": "HOC",
        "hoc_process_id": pdata["hoc_process_id"],
    } for supplier_id, pdata in supplier_plan.items()]

    if dry_run:
        stat("plans", written=len(plan_batch))
    else:
        for chunk in chunks(plan_batch, 200):
            try:
                sb.table("plans").upsert(chunk, on_conflict="supplier_id").execute()
                stat("plans", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch plans ({e}) — tentando individualmente")
                for r in chunk:
                    try:
                        sb.table("plans").upsert(r, on_conflict="supplier_id").execute()
                        stat("plans", written=1)
                    except Exception as e2:
                        stat("plans", discard={"phase": "plans", "supplier_id": r["supplier_id"], "motivo": str(e2)})
    cur.close()


# ── Fase 7: documents ─────────────────────────────────────────────────────────

def phase_documents(mysql_conn, sb: Client, dry_run: bool, s3_cfg: dict):
    log.info("=== FASE documents (arquivos permanecem no S3 do HOC) ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT pd.id_processo, pd.id_documento, d.descricao AS doc_descricao,
               pd.data_vencimento, pd.situacao, a.id AS arquivo_id,
               a.nome AS arquivo_nome, f.cnpj AS fornecedor_cnpj
        FROM processo_documento pd
        JOIN processo p ON p.id = pd.id_processo
        JOIN documento d ON d.id = pd.id_documento
        JOIN arquivo a ON a.id = pd.id_arquivo
        JOIN fornecedor f ON f.id = p.id_fornecedor
        WHERE p.ativo = 1 AND p.data_validade >= NOW()
          AND pd.situacao = 'O'
          AND f.cnpj IS NOT NULL AND f.cnpj != ''
        ORDER BY p.id_fornecedor, pd.id_documento, pd.id DESC
    """)
    rows = cur.fetchall()

    # Deduplica: último arquivo por (fornecedor, tipo de documento)
    seen = {}
    for row in rows:
        key = (row["fornecedor_cnpj"], row["id_documento"])
        if key not in seen:
            seen[key] = row
    stat("documents", hoc_count=len(seen))
    log.info(f"Documentos únicos a migrar: {len(seen)} (de {len(rows)} envios)")

    supplier_map = load_supplier_map(sb, mysql_conn, dry_run)
    s3_base = s3_cfg["base_url"].rstrip("/") + "/"
    s3_prefix = s3_cfg.get("key_prefix", "hoc_file_")

    doc_batch = []
    for row in seen.values():
        cnpj = clean_cnpj(row["fornecedor_cnpj"])
        supplier_id = supplier_map.get(cnpj)
        if not supplier_id:
            stat("documents", discard={"phase": "documents", "cnpj": cnpj, "motivo": "fornecedor não migrado"})
            continue

        arquivo_id = row["arquivo_id"]
        doc_batch.append({
            "supplier_id": supplier_id,
            "type": str(row["id_documento"]),
            "label": safe_str(row["doc_descricao"]),
            "source": "MANUAL",
            "status": "VALID",
            "expires_at": to_date_str(row.get("data_vencimento")),
            # bucket é privado — acesso via função get-hoc-file (URL pré-assinada)
            "public_url": None,
            "hoc_arquivo_id": arquivo_id,
            "hoc_s3_url": f"{s3_base}{s3_prefix}{arquivo_id}",
        })

    if dry_run:
        stat("documents", written=len(doc_batch))
    else:
        # Pós-reset a tabela está vazia — insert em lote com UNIQUE(supplier_id,type)
        # garantido pela deduplicação `seen` acima. Fallback individual isola erros.
        done = 0
        for chunk in chunks(doc_batch, 500):
            try:
                sb.table("documents").upsert(chunk, on_conflict="supplier_id,type").execute()
                stat("documents", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch documents ({e}) — tentando individualmente")
                for r in chunk:
                    try:
                        sb.table("documents").upsert(r, on_conflict="supplier_id,type").execute()
                        stat("documents", written=1)
                    except Exception as e2:
                        stat("documents", discard={"phase": "documents", "arquivo_id": r["hoc_arquivo_id"], "motivo": str(e2)})
            done += len(chunk)
            if done % 5000 < 500:
                log.info(f"  Progresso docs: {done}/{len(doc_batch)}")
    cur.close()


# ── Fase details: dados completos do fornecedor/cliente (sem perda) ──────────
# Estruturado → supplier_partners, supplier_bank_accounts, supplier_financials,
#               cnae_list e colunas novas (patch_035)
# Integral    → suppliers.hoc_extra / clients.hoc_extra (JSONB com TODAS as
#               linhas relacionadas: endereços, contatos, anexos, escopos,
#               mensagens, termos, bancários históricos, balanços brutos)
# Questionário → seals.hoc_questionario (respostas dos processos válidos)

def _fetch_grouped(cur, sql, key="id_fornecedor"):
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    grouped = {}
    for row in cur.fetchall():
        rec = dict(zip(cols, row))
        for k, v in rec.items():
            if isinstance(v, (datetime, date)):
                rec[k] = v.isoformat()
        grouped.setdefault(rec.get(key), []).append(rec)
    return grouped


def phase_details(mysql_conn, sb: Client, dry_run: bool):
    log.info("=== FASE details (dados completos, sem perda) ===")
    cur = mysql_conn.cursor()

    # hoc_id → supplier UUID (mapeamento direto, mais preciso que CNPJ)
    hoc_to_uuid = {}
    offset = 0
    while True:
        res = sb.table("suppliers").select("id,hoc_id").not_.is_("hoc_id", "null").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            hoc_to_uuid[s["hoc_id"]] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info(f"  {len(hoc_to_uuid)} fornecedores mapeados por hoc_id")

    # ── Carrega TODAS as tabelas relacionadas (agrupadas por fornecedor) ──
    log.info("  Carregando tabelas relacionadas do HOC...")
    enderecos  = _fetch_grouped(cur, "SELECT * FROM endereco_fornecedor")
    contatos   = _fetch_grouped(cur, "SELECT * FROM contato")
    cnaes      = _fetch_grouped(cur, "SELECT * FROM cnae_fornecedor")
    socios     = _fetch_grouped(cur, "SELECT * FROM socio_fornecedor")
    bancarios  = _fetch_grouped(cur, "SELECT * FROM dados_bancarios_fornecedor")
    anexos     = _fetch_grouped(cur, "SELECT * FROM fornecedor_anexos")
    mensagens  = _fetch_grouped(cur, "SELECT * FROM mensagem_fornecedor")
    contratantes = _fetch_grouped(cur, "SELECT * FROM fornecedor_contratante")
    clientes_forn = _fetch_grouped(cur, "SELECT * FROM fornecedor_clientes")
    termos     = _fetch_grouped(cur, "SELECT id_fornecedor, id_termo_uso, data_aceite, aceito_por FROM termo_uso_fornecedor")

    # Balanços via processo_documento → processo → fornecedor
    balancos = _fetch_grouped(cur, """
        SELECT p.id_fornecedor, b.*, YEAR(pd.data_vencimento) AS ano_ref, pd.id_processo
        FROM balanco b
        JOIN processo_documento pd ON pd.id = b.id_processo_documento
        JOIN processo p ON p.id = pd.id_processo
        WHERE b.registro_cancelado IS NULL OR b.registro_cancelado = 0
    """)

    # Dados cadastrais completos do fornecedor
    cur.execute("SELECT * FROM fornecedor")
    fcols = [d[0] for d in cur.description]
    fornecedores = {}
    for row in cur.fetchall():
        rec = dict(zip(fcols, row))
        for k, v in rec.items():
            if isinstance(v, (datetime, date)):
                rec[k] = v.isoformat()
        fornecedores[rec["id"]] = rec
    log.info(f"  Tabelas carregadas: {len(fornecedores)} fornecedores, {sum(len(v) for v in socios.values())} sócios, "
             f"{sum(len(v) for v in bancarios.values())} bancários, {sum(len(v) for v in balancos.values())} balanços")

    stat("details_suppliers", hoc_count=len(hoc_to_uuid))

    # ── 1. Enriquecimento de suppliers (colunas + hoc_extra integral) ──
    sup_batch = []
    partner_batch = []
    bank_batch = []
    fin_rows = {}   # (uuid, year) → record

    for hoc_id, uuid in hoc_to_uuid.items():
        f = fornecedores.get(hoc_id)
        if not f:
            stat("details_suppliers", discard={"phase": "details", "hoc_id": hoc_id, "motivo": "fornecedor sumiu do HOC"})
            continue

        cn = [safe_str(c.get("codigo")) for c in cnaes.get(hoc_id, []) if safe_str(c.get("codigo"))]
        sup_batch.append({
            "id": uuid,
            # Colunas NOT NULL repetidas: o caminho de INSERT do ON CONFLICT
            # valida o tuple inteiro antes de resolver o conflito — o upsert
            # precisa carregar TODAS as colunas NOT NULL (cnpj, razao_social)
            "cnpj": clean_cnpj(f.get("cnpj")),
            "razao_social": safe_str(f.get("razao_social")) or f"Fornecedor HOC {hoc_id}",
            "inscricao_estadual":  safe_str(f.get("inscricao_estadual")),
            "inscricao_municipal": safe_str(f.get("inscricao_municipal")),
            "data_abertura":       f.get("data_abertura"),
            "tipo_empresa":        safe_str(f.get("tipo_empresa")),
            "email_financeiro":    safe_str(f.get("email_financeiro")),
            "cnae_list":           cn or None,
            "hoc_extra": {
                "fornecedor":    f,
                "enderecos":     enderecos.get(hoc_id, []),
                "contatos":      contatos.get(hoc_id, []),
                "anexos":        anexos.get(hoc_id, []),
                "mensagens":     mensagens.get(hoc_id, []),
                "contratantes":  contratantes.get(hoc_id, []),
                "clientes_do_fornecedor": clientes_forn.get(hoc_id, []),
                "termos_aceite": termos.get(hoc_id, []),
                "dados_bancarios_historico": bancarios.get(hoc_id, []),
                "balancos_brutos": balancos.get(hoc_id, []),
            },
        })

        # Sócios → supplier_partners
        for s in socios.get(hoc_id, []):
            tipo_raw = (s.get("tipo") or "").upper()
            tipo = "pj" if "PJ" in tipo_raw or "JUR" in tipo_raw else ("estrangeiro" if "ESTRANG" in tipo_raw or "INT" in tipo_raw else "pf")
            part = None
            try:
                part = float(s.get("participacao_societaria")) if s.get("participacao_societaria") not in (None, "") else None
                if part is not None and part > 999: part = None
            except Exception:
                part = None
            partner_batch.append({
                "hoc_id": s["id"],
                "supplier_id": uuid,
                "tipo": tipo,
                "cpf_cnpj": safe_str(s.get("cpf")),
                "nome": safe_str(s.get("nome")) or "—",
                "cargo": safe_str(s.get("cargo")),
                "nacionalidade": safe_str(s.get("nacionalidade")),
                "participacao": part,
            })

        # Dados bancários → o registro mais recente não cancelado
        vals = [b for b in bancarios.get(hoc_id, []) if not b.get("registro_cancelado")]
        if vals:
            best = max(vals, key=lambda b: (b.get("versao") or 0, b.get("create_date") or ""))
            conta = safe_str(best.get("conta")) or ""
            digito = safe_str(best.get("digito_conta"))
            bank_batch.append({
                "supplier_id": uuid,
                "hoc_id": best["id"],
                "bank_name": safe_str(best.get("banco")),
                "bank_code": safe_str(best.get("codigo_banco")) or safe_str(best.get("bank_code")),
                "bank_agency": safe_str(best.get("agencia")),
                "bank_account": f"{conta}-{digito}" if digito else conta or None,
                "pix_key": None,
            })

        # Balanços → supplier_financials (1 por ano; mais recente vence)
        for b in balancos.get(hoc_id, []):
            year = b.get("ano_ref")
            if not year:
                continue
            ac  = float(b.get("ativo_circulante") or 0)
            anc = float(b.get("ativo_nao_circulante") or 0)
            pc  = float(b.get("passivo_circulante") or 0)
            pnc = float(b.get("passivo_nao_circulante") or 0)
            rec = {
                "supplier_id": uuid,
                "year": int(year),
                "ativo": float(b.get("valor_ativo_total") or 0) or (ac + anc) or None,
                "passivo": (pc + pnc) or None,
                "estoque": float(b.get("estoque") or 0) or None,
            }
            fin_rows[(uuid, int(year))] = rec  # última linha (versão maior) sobrescreve

    log.info(f"  Preparado: {len(sup_batch)} suppliers, {len(partner_batch)} sócios, {len(bank_batch)} bancários, {len(fin_rows)} balanços")

    if dry_run:
        stat("details_suppliers", written=len(sup_batch))
        stat("details_partners", hoc_count=len(partner_batch), written=len(partner_batch))
        stat("details_bank", hoc_count=len(bank_batch), written=len(bank_batch))
        stat("details_financials", hoc_count=len(fin_rows), written=len(fin_rows))
    else:
        for chunk in chunks(sup_batch, 100):
            try:
                sb.table("suppliers").upsert(chunk, on_conflict="id").execute()
                stat("details_suppliers", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch suppliers extra: {e}")
                for r in chunk:
                    try:
                        sb.table("suppliers").upsert(r, on_conflict="id").execute()
                        stat("details_suppliers", written=1)
                    except Exception as e2:
                        stat("details_suppliers", discard={"phase": "details", "supplier": r["id"], "motivo": str(e2)})

        stat("details_partners", hoc_count=len(partner_batch))
        for chunk in chunks(partner_batch, 500):
            try:
                sb.table("supplier_partners").upsert(chunk, on_conflict="hoc_id").execute()
                stat("details_partners", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch sócios: {e}")
                for r in chunk:
                    try:
                        sb.table("supplier_partners").upsert(r, on_conflict="hoc_id").execute()
                        stat("details_partners", written=1)
                    except Exception as e2:
                        stat("details_partners", discard={"phase": "details_partners", "hoc_id": r["hoc_id"], "motivo": str(e2)})

        stat("details_bank", hoc_count=len(bank_batch))
        for chunk in chunks(bank_batch, 500):
            try:
                sb.table("supplier_bank_accounts").upsert(chunk, on_conflict="supplier_id").execute()
                stat("details_bank", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch bancários: {e}")
                for r in chunk:
                    try:
                        sb.table("supplier_bank_accounts").upsert(r, on_conflict="supplier_id").execute()
                        stat("details_bank", written=1)
                    except Exception as e2:
                        stat("details_bank", discard={"phase": "details_bank", "supplier": r["supplier_id"], "motivo": str(e2)})

        stat("details_financials", hoc_count=len(fin_rows))
        for chunk in chunks(list(fin_rows.values()), 500):
            try:
                sb.table("supplier_financials").upsert(chunk, on_conflict="supplier_id,year").execute()
                stat("details_financials", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch balanços: {e}")
                for r in chunk:
                    try:
                        sb.table("supplier_financials").upsert(r, on_conflict="supplier_id,year").execute()
                        stat("details_financials", written=1)
                    except Exception as e2:
                        stat("details_financials", discard={"phase": "details_financials", "supplier": r["supplier_id"], "motivo": str(e2)})

    # ── 2. Clientes: linha completa → clients.hoc_extra ──
    cur.execute("SELECT * FROM cliente")
    ccols = [d[0] for d in cur.description]
    cli_batch = []
    client_map = load_client_map(sb)
    for row in cur.fetchall():
        rec = dict(zip(ccols, row))
        for k, v in rec.items():
            if isinstance(v, (datetime, date)):
                rec[k] = v.isoformat()
        uuid = client_map.get(rec["id"])
        if uuid:
            cli_batch.append({
                "id": uuid,
                # razao_social NOT NULL: tuple de INSERT do ON CONFLICT é validado
                "razao_social": safe_str(rec.get("razao_social")) or f"Cliente HOC {rec['id']}",
                "hoc_extra": {"cliente": rec},
            })
    stat("details_clients", hoc_count=len(cli_batch))
    if dry_run:
        stat("details_clients", written=len(cli_batch))
    else:
        for chunk in chunks(cli_batch, 100):
            try:
                sb.table("clients").upsert(chunk, on_conflict="id").execute()
                stat("details_clients", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch clientes extra: {e}")

    # ── 3. Questionários dos processos válidos → seals.hoc_questionario ──
    # Em LOTES por id_processo: a query única (332k respostas em JOIN)
    # derruba a conexão MySQL
    log.info("  Carregando respostas de questionário dos processos válidos...")

    # seals com hoc_process_id (primeiro, para saber QUAIS processos buscar)
    seal_by_proc = {}
    offset = 0
    while True:
        res = sb.table("seals").select("id,hoc_process_id").not_.is_("hoc_process_id", "null").range(offset, offset + 999).execute()
        if not res.data:
            break
        for s in res.data:
            seal_by_proc[s["hoc_process_id"]] = s["id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info(f"  {len(seal_by_proc)} selos com processo HOC")

    by_proc = {}
    proc_ids = list(seal_by_proc.keys())
    cur2 = mysql_conn.cursor(dictionary=True)
    for idx, chunk in enumerate(chunks(proc_ids, 200)):
        placeholders = ",".join(["%s"] * len(chunk))
        cur2.execute(f"""
            SELECT qr.id_processo, q.pergunta AS questao,
                   COALESCE(r.descricao, qr.resposta_tipo_texto,
                            CAST(qr.resposta_tipo_numero AS CHAR),
                            CAST(qr.resposta_tipo_data AS CHAR)) AS resposta,
                   qr.ordem
            FROM questionario_resposta qr
            LEFT JOIN questao q ON q.id = qr.id_questao
            LEFT JOIN resposta r ON r.id = qr.id_resposta_tipo_unica
            WHERE qr.id_processo IN ({placeholders})
              AND (qr.ultima_resposta = 1 OR qr.ultima_resposta IS NULL)
            ORDER BY qr.id_processo, qr.ordem
        """, tuple(chunk))
        for r in cur2.fetchall():
            if r["questao"] or r["resposta"]:
                by_proc.setdefault(r["id_processo"], []).append(
                    {"questao": safe_str(r["questao"]), "resposta": safe_str(r["resposta"])})
        if idx % 5 == 0:
            log.info(f"  questionários: lote {idx + 1}/{(len(proc_ids) + 199) // 200}")
    cur2.close()
    log.info(f"  {len(by_proc)} processos com respostas")

    q_batch = [{"id": seal_by_proc[pid], "hoc_questionario": answers}
               for pid, answers in by_proc.items() if pid in seal_by_proc]
    stat("details_questionario", hoc_count=len(by_proc), written=0)
    if dry_run:
        stat("details_questionario", written=len(q_batch))
    else:
        for chunk in chunks(q_batch, 50):
            try:
                sb.table("seals").upsert(chunk, on_conflict="id").execute()
                stat("details_questionario", written=len(chunk))
            except Exception as e:
                log.error(f"  ERRO batch questionário: {e}")

    cur.close()


# ── Fase 8: reconcile ─────────────────────────────────────────────────────────

def phase_reconcile(sb: Client):
    log.info("=== FASE reconcile ===")
    print(f"\n{'FASE':26s} {'HOC':>10s} {'GRAVADOS':>10s} {'DESCARTES':>10s}")
    print("-" * 60)
    total_discards = 0
    for phase, s in STATS.items():
        print(f"{phase:26s} {s['hoc_count']:>10,} {s['written']:>10,} {s['skipped']:>10,}")
        total_discards += s["skipped"]
    print("-" * 60)

    # Verificação no destino
    for table, label in [("clients", "clients"), ("categories", "categories (total)"),
                         ("suppliers", "suppliers"), ("supplier_categories", "supplier_categories"),
                         ("category_documents", "category_documents"), ("seals", "seals"),
                         ("plans", "plans"), ("documents", "documents")]:
        try:
            res = sb.table(table).select("id", count="exact").limit(1).execute()
            print(f"  ELOS {label:32s} {res.count:>10,}")
        except Exception:
            pass

    report_path = f"migration_v2_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w") as f:
        json.dump(STATS, f, indent=2, ensure_ascii=False, default=str)
    log.info(f"Relatório completo (com todos os descartes): {report_path}")
    if total_discards:
        log.warning(f"⚠ {total_discards} descartes no total — revisar o relatório antes de aceitar a migração")
    else:
        log.info("✅ 0 descartes — meta atingida")


# ── Main ──────────────────────────────────────────────────────────────────────

ALL_PHASES = ["clients", "client_categories", "catalog_and_links", "suppliers",
              "supplier_categories", "seals_plans", "documents", "details", "reconcile"]


def main():
    parser = argparse.ArgumentParser(description="Migração HOC → SIGEC-ELOS v2")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--phase", choices=ALL_PHASES + ["all"], default="all")
    parser.add_argument("--config", default="hoc_migration_config.json")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = json.load(f)

    dry_run = args.dry_run
    if dry_run:
        log.info("*** MODO DRY-RUN — nenhuma gravação no Supabase ***")

    mysql_conn = connect_mysql(cfg["hoc_mysql"])
    sb = connect_supabase(cfg["sigec_supabase"])
    s3_cfg = cfg["hoc_s3"]

    runners = {
        "clients":             lambda: phase_clients(mysql_conn, sb, dry_run),
        "client_categories":   lambda: phase_client_categories(mysql_conn, sb, dry_run),
        "catalog_and_links":   lambda: phase_catalog_and_links(mysql_conn, sb, dry_run),
        "suppliers":           lambda: phase_suppliers(mysql_conn, sb, dry_run),
        "supplier_categories": lambda: phase_supplier_categories(mysql_conn, sb, dry_run),
        "seals_plans":         lambda: phase_seals_plans(mysql_conn, sb, dry_run),
        "documents":           lambda: phase_documents(mysql_conn, sb, dry_run, s3_cfg),
        "details":             lambda: phase_details(mysql_conn, sb, dry_run),
        "reconcile":           lambda: phase_reconcile(sb),
    }

    try:
        to_run = ALL_PHASES if args.phase == "all" else [args.phase]
        for p in to_run:
            runners[p]()
        log.info("=== MIGRAÇÃO V2 CONCLUÍDA ===")
    finally:
        mysql_conn.close()


if __name__ == "__main__":
    main()
