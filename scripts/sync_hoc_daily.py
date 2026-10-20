#!/usr/bin/env python3
"""Sincronização diária HOC → ELOS (mão única). Ver docs/SYNC_HOC_ELOS.md.

Reaproveita os helpers e mapeamentos da migração v2 (migrate_hoc_v2.py) —
mesma fonte da última migração total. Princípios:
  · HOC manda nas entidades vinculadas (hoc_id); ELOS-only intocado
  · MySQL SOMENTE leitura; escrita só no Supabase
  · Incremental por update_date (watermark em sync_state); idempotente
  · Sem DELETE destrutivo: remoções viram active=false / required=false
    (exceção documentada: vínculos fornecedor×categoria são configuração
     espelhada 1:1 do HOC e removem a linha)

Uso:
  python3 sync_hoc_daily.py [--dry-run] [--entities clients,categories,...]
                            [--config hoc_migration_config.json]

Entidades: clients, catalog, categories, category_documents, suppliers,
           supplier_categories, seals, documents, hoc_log, invitations,
           boletos_migrados, docs_pendentes_hoc

Cliente MIGRADO (clients.hoc_migrated_at, virada 17/10 — patch_149): o ELOS
passa a ser o dono. A sincronia NÃO grava mais processos, categorias, matriz,
vínculos fornecedor×categoria nem convites dele. Documentos e cadastro do
fornecedor seguem (são do fornecedor, compartilhados com clientes ainda no HOC).
boletos_migrados: confere todo dia no HOC (só leitura) o boleto emitido antes da
virada — compensou → libera o processo no ELOS; venceu → libera o pagamento pelo ELOS.
(details — sócios/bancários/balanços/questionários — roda semanal via
 migrate_hoc_v2.py --phase details, já idempotente.)
"""
import argparse
import json
import re
import time
from datetime import datetime, timezone
import datetime as _dt

from migrate_hoc_v2 import (
    CAT_ID_OFFSET, RESP_MAP, chunks, clean_cnpj, classify_seal,
    connect_mysql, connect_supabase, load_client_map, load_supplier_map,
    log, safe_str, to_date_str,
)

ALL_ENTITIES = ["clients", "catalog", "categories", "category_documents",
                "suppliers", "supplier_categories", "seals", "documents", "hoc_log",
                "invitations", "boletos_migrados", "docs_pendentes_hoc"]

# Primeira execução: tabelas GRANDES começam da data da migração v2;
# as pequenas fazem passada completa (idempotente e barata)
INITIAL_WM = {"seals": "2026-08-12 00:00:00", "documents": "2026-08-12 00:00:00"}

HUMAN_LOG_FILTER = """l.created_by NOT LIKE '%batch%'
  AND l.created_by <> 'sys'
  AND l.created_by NOT LIKE 'consulta.automatica%'"""


# ── sync_state ────────────────────────────────────────────────────────────

def get_state(sb, entity):
    res = sb.table("sync_state").select("*").eq("entity", entity).execute()
    return res.data[0] if res.data else {}

def save_state(sb, entity, **fields):
    rec = {"entity": entity, "last_run_at": datetime.now(timezone.utc).isoformat(), **fields}
    sb.table("sync_state").upsert(rec, on_conflict="entity").execute()


def run_entity(sb, entity, fn, dry):
    t0 = time.time()
    try:
        read, written, wm, last_id = fn()
        if not dry:
            save_state(sb, entity, watermark=wm, last_id=last_id, rows_read=read,
                       rows_written=written, status="ok", error=None,
                       duration_s=round(time.time() - t0, 1))
        log.info(f"[{entity}] ok — lidas {read}, gravadas {written} ({time.time()-t0:.1f}s)")
        return True
    except Exception as e:
        log.error(f"[{entity}] ERRO: {e}")
        if not dry:
            try:
                save_state(sb, entity, status="error", error=str(e)[:900],
                           duration_s=round(time.time() - t0, 1))
            except Exception:
                pass
        return False


# ── helpers ───────────────────────────────────────────────────────────────

def migrated_hoc_clients(sb):
    """hoc_id dos clientes já migrados (o ELOS é o dono; a sincronia não grava)."""
    return {c["hoc_id"] for c in fetch_all(sb, "clients", "hoc_id,hoc_migrated_at")
            if c.get("hoc_id") and c.get("hoc_migrated_at")}


def categories_of_hoc_clients(my, hoc_client_ids):
    """ids ELOS (com offset) das categorias desses clientes do HOC."""
    if not hoc_client_ids:
        return set()
    cur = my.cursor()
    ph = ",".join(["%s"] * len(hoc_client_ids))
    cur.execute(f"SELECT id FROM categoria WHERE id_cliente IN ({ph})", tuple(hoc_client_ids))
    ids = {CAT_ID_OFFSET + r[0] for r in cur.fetchall()}
    cur.close()
    return ids


def strip_none(d):
    """HOC manda quando TEM valor; None não sobrescreve o ELOS."""
    return {k: v for k, v in d.items() if v is not None}

def fetch_all(sb, table, select, order="id", page=1000, **eqs):
    # ORDER estável é OBRIGATÓRIO: paginação PostgREST sem order repete/omite
    # linhas entre páginas (diffs errados → deleções indevidas)
    out, offset = [], 0
    while True:
        q = sb.table(table).select(select).order(order)
        for k, v in eqs.items():
            q = q.eq(k, v)
        res = q.range(offset, offset + page - 1).execute()
        out.extend(res.data or [])
        if not res.data or len(res.data) < page:
            return out
        offset += page

def load_supplier_map_ordered(sb):
    """cnpj → supplier_id com paginação ORDENADA (o load_supplier_map do v2
    pagina sem order — omissões aqui virariam deleções indevidas no diff)."""
    rows = fetch_all(sb, "suppliers", "id,cnpj")
    # clean_cnpj (não \D): o CNPJ alfanumérico mantém as letras (patch_129)
    return {clean_cnpj(r["cnpj"]): r["id"] for r in rows if r.get("cnpj")}


def max_wm(rows, *cols):
    best = None
    for r in rows:
        for c in cols:
            v = r.get(c)
            if v is not None and (best is None or v > best):
                best = v
    return best.strftime("%Y-%m-%d %H:%M:%S") if best else None


# ── entidades ─────────────────────────────────────────────────────────────

def sync_clients(my, sb, dry):
    cur = my.cursor(dictionary=True)
    cur.execute("SELECT id, razao_social, nome_fantasia, cnpj, sigla, ativo FROM cliente")
    rows = cur.fetchall(); cur.close()
    written = 0
    for row in rows:
        rec = strip_none({
            "hoc_id": row["id"],
            "razao_social": safe_str(row["razao_social"]) or f"Cliente HOC {row['id']}",
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "sigla": safe_str(row.get("sigla")),
            "cnpj": clean_cnpj(row["cnpj"]),
        })
        # espelha o ativo do HOC (patch_059) — False é valor válido, fora do strip_none
        rec["active"] = bool(row["ativo"])
        if dry: written += 1; continue
        res = sb.table("clients").select("id,hoc_migrated_at").eq("hoc_id", row["id"]).execute()
        if res.data and res.data[0].get("hoc_migrated_at"):
            continue   # cliente migrado: o ELOS é o dono do cadastro (patch_149)
        if res.data:
            sb.table("clients").update(rec).eq("id", res.data[0]["id"]).execute()
        elif row["ativo"]:
            # cliente INATIVO no HOC e ausente no ELOS não é recriado
            # (caso Equipo Gestão duplicada, hoc_id 32, removida em 01/09)
            sb.table("clients").insert(rec).execute()
        else:
            continue
        written += 1
    return len(rows), written, None, None


def sync_catalog(my, sb, dry):
    cur = my.cursor(dictionary=True)
    cur.execute("SELECT id, descricao, responsabilidade, busca_automatica, ativo, tipo FROM documento")
    rows = cur.fetchall(); cur.close()
    batch = [{
        "id": d["id"],
        "name": safe_str(d["descricao"]) or f"Documento {d['id']}",
        "responsibility": RESP_MAP.get(d.get("responsabilidade"), "fornecedor"),
        "auto_collect": bool(d.get("busca_automatica")),
        "hoc_tipo": safe_str(d.get("tipo")),
        "active": bool(d.get("ativo")),
    } for d in rows]
    if not dry:
        for chunk in chunks(batch, 500):
            sb.table("documents_catalog").upsert(chunk, on_conflict="id").execute()
    return len(rows), len(batch), None, None


def sync_categories(my, sb, dry, wm):
    cur = my.cursor(dictionary=True)
    cond = "WHERE update_date > %s OR create_date > %s" if wm else ""
    cur.execute(f"""SELECT id, descricao, id_cliente, id_categoria_pai, codigo,
        descricao_ingles, status, update_date, create_date FROM categoria {cond} ORDER BY id""",
        (wm, wm) if wm else None)
    rows = cur.fetchall()
    client_map = load_client_map(sb)
    # pais podem estar fora do lote incremental — valida contra o conjunto total
    cur.execute("SELECT id FROM categoria")
    all_ids = {r["id"] for r in cur.fetchall()}

    migrados = migrated_hoc_clients(sb)
    cats_migrados = categories_of_hoc_clients(my, migrados)
    batch = []
    for row in rows:
        client_id = client_map.get(row["id_cliente"])
        if not client_id or row["id_cliente"] in migrados:   # cliente migrado: o ELOS é o dono
            continue
        pai = row["id_categoria_pai"]
        batch.append({
            "id": CAT_ID_OFFSET + row["id"], "hoc_id": row["id"], "client_id": client_id,
            "name": safe_str(row["descricao"]) or f"Categoria {row['id']}",
            "parent_id": (CAT_ID_OFFSET + pai) if (pai and pai in all_ids) else None,
            "codigo": safe_str(row.get("codigo")),
            "name_en": safe_str(row.get("descricao_ingles")),
            "active": bool(row.get("status")),
        })

    # remoções no HOC → active=false (nunca delete)
    deactivated = 0
    if not dry:
        elos = fetch_all(sb, "categories", "id,hoc_id,active")
        elos_client_hoc = {c["hoc_id"]: c for c in elos if c["hoc_id"] and c["id"] >= CAT_ID_OFFSET}
        gone_ids = [elos_client_hoc[h]["id"] for h in elos_client_hoc if h not in all_ids and elos_client_hoc[h]["active"]
                    and elos_client_hoc[h]["id"] not in cats_migrados]
        for chunk in chunks(gone_ids, 200):
            sb.table("categories").update({"active": False}).in_("id", chunk).execute()
            deactivated += len(chunk)
        # duas passadas (lição da v2: upsert parcial viola NOT NULL)
        for chunk in chunks([{**b, "parent_id": None} for b in batch], 500):
            sb.table("categories").upsert(chunk, on_conflict="id").execute()
        wp = [b for b in batch if b["parent_id"]]
        for chunk in chunks(wp, 500):
            sb.table("categories").upsert(chunk, on_conflict="id").execute()
    if deactivated:
        log.info(f"  categorias desativadas (removidas no HOC): {deactivated}")
    return len(rows), len(batch) + deactivated, max_wm(rows, "update_date", "create_date") or wm, None


def sync_category_documents(my, sb, dry, wm):
    cur = my.cursor(dictionary=True)
    cond = "AND (cd.update_date > %s OR cd.create_date > %s)" if wm else ""
    cur.execute(f"""SELECT cd.id_categoria, cd.id_documento, cd.desclassificatorio,
            cd.update_date, cd.create_date, c.id_cliente
        FROM categoria_documento cd JOIN categoria c ON c.id = cd.id_categoria
        WHERE 1=1 {cond}""", (wm, wm) if wm else None)
    rows = cur.fetchall()
    migrados = migrated_hoc_clients(sb)
    cats_migrados = categories_of_hoc_clients(my, migrados)
    seen, batch = set(), []
    for lk in rows:
        if lk["id_cliente"] in migrados:   # matriz de cliente migrado: o ELOS é o dono
            continue
        key = (lk["id_categoria"], lk["id_documento"])
        if key in seen: continue
        seen.add(key)
        batch.append({
            "category_id": CAT_ID_OFFSET + lk["id_categoria"],
            "document_id": lk["id_documento"],
            "required": True,
            "blocking": bool(lk.get("desclassificatorio")),
        })
    removed = 0
    if not dry:
        for chunk in chunks(batch, 500):
            sb.table("category_documents").upsert(chunk, on_conflict="category_id,document_id").execute()
        # remoções na matriz do HOC → required=false (linha preservada)
        cur.execute("SELECT id_categoria, id_documento FROM categoria_documento")
        hoc_keys = {(CAT_ID_OFFSET + a, b) for a, b in [(r["id_categoria"], r["id_documento"]) for r in cur.fetchall()]}
        elos = fetch_all(sb, "category_documents", "id,category_id,document_id,required")
        for e in elos:
            if e["category_id"] >= CAT_ID_OFFSET and e["required"] and (e["category_id"], e["document_id"]) not in hoc_keys \
                    and e["category_id"] not in cats_migrados:
                sb.table("category_documents").update({"required": False}).eq("id", e["id"]).execute()
                removed += 1
    cur.close()
    if removed:
        log.info(f"  vínculos da matriz desligados (required=false): {removed}")
    return len(rows), len(batch) + removed, max_wm(rows, "update_date", "create_date") or wm, None


def sync_suppliers(my, sb, dry, wm):
    cur = my.cursor(dictionary=True)
    cond = "WHERE f.update_date > %s OR f.create_date > %s" if wm else ""
    cur.execute(f"""
        SELECT f.id, f.cnpj, f.razao_social, f.nome_fantasia, f.email_comercial,
               f.ativo, f.regime_tributario, f.municipio, f.update_date, f.create_date,
               ef.uf AS uf, ef.nome_logradouro AS logradouro, ef.cep AS cep,
               ct.nome AS contact_name, ct.telefone AS contact_phone
        FROM fornecedor f
        LEFT JOIN (SELECT id_fornecedor, MIN(id) as min_id FROM endereco_fornecedor
                   WHERE tipo='CR' GROUP BY id_fornecedor) ef_min ON ef_min.id_fornecedor = f.id
        LEFT JOIN endereco_fornecedor ef ON ef.id = ef_min.min_id
        LEFT JOIN (SELECT id_fornecedor, MIN(id) as min_id FROM contato
                   GROUP BY id_fornecedor) ct_min ON ct_min.id_fornecedor = f.id
        LEFT JOIN contato ct ON ct.id = ct_min.min_id
        {cond} ORDER BY f.id""", (wm, wm) if wm else None)
    rows = cur.fetchall(); cur.close()

    by_cnpj = {}
    for row in rows:
        cnpj = clean_cnpj(row["cnpj"])
        if not cnpj or len(cnpj) not in (13, 14):
            continue
        address = {k: safe_str(row[c]) for k, c in
                   [("logradouro", "logradouro"), ("cep", "cep"), ("municipio", "municipio"), ("uf", "uf")]
                   if row.get(c)}
        rec = strip_none({
            "hoc_id": row["id"], "cnpj": cnpj,
            "razao_social": safe_str(row["razao_social"]) or f"Fornecedor HOC {row['id']}",
            "nome_fantasia": safe_str(row.get("nome_fantasia")),
            "email": safe_str(row.get("email_comercial")),
            "contact_name": safe_str(row.get("contact_name")),
            "phone": safe_str(row.get("contact_phone")),
            "state": safe_str(row.get("uf")),
            "city": safe_str(row.get("municipio")),
            "address": address or None,
            "regime_tributario": safe_str(row.get("regime_tributario")),
        })
        # status: só derruba quando o HOC desativou; ACTIVE/PENDING é gerido
        # pelos selos no ELOS — nunca rebaixar aqui
        if not row["ativo"]:
            rec["status"] = "SUSPENDED"
        by_cnpj[cnpj] = rec

    records = list(by_cnpj.values())
    if not dry:
        for chunk in chunks(records, 500):
            try:
                sb.table("suppliers").upsert(chunk, on_conflict="cnpj").execute()
            except Exception as e:
                log.error(f"  batch suppliers ({e}) — individual")
                for r in chunk:
                    try: sb.table("suppliers").upsert(r, on_conflict="cnpj").execute()
                    except Exception as e2: log.error(f"  supplier hoc_id={r['hoc_id']}: {e2}")
    return len(rows), len(records), max_wm(rows, "update_date", "create_date") or wm, None


def sync_supplier_categories(my, sb, dry):
    # tabela de vínculo sem watermark → diff completo de chaves (config 1:1)
    cur = my.cursor(dictionary=True)
    cur.execute("""SELECT fc.id_fornecedor, fc.id_categoria, f.cnpj
        FROM fornecedor_categorias fc JOIN fornecedor f ON f.id = fc.id_fornecedor""")
    rows = cur.fetchall(); cur.close()
    supplier_map = load_supplier_map_ordered(sb)
    hoc_keys = set()
    for r in rows:
        sid = supplier_map.get(clean_cnpj(r["cnpj"]))
        if sid:
            hoc_keys.add((sid, CAT_ID_OFFSET + r["id_categoria"]))

    elos = fetch_all(sb, "supplier_categories", "id,supplier_id,category_id")
    elos_keys = {(e["supplier_id"], e["category_id"]) for e in elos if e["category_id"] >= CAT_ID_OFFSET}

    # categorias de cliente migrado: o ELOS é o dono (CNAE, reprovação, escolhas)
    cats_migrados = categories_of_hoc_clients(my, migrated_hoc_clients(sb))
    to_add = [{"supplier_id": a, "category_id": b} for a, b in hoc_keys - elos_keys if b not in cats_migrados]
    to_del = [k for k in elos_keys - hoc_keys if k[1] not in cats_migrados]
    if not dry:
        for chunk in chunks(to_add, 500):
            sb.table("supplier_categories").upsert(chunk, on_conflict="supplier_id,category_id").execute()
        for sid, cid in to_del:
            sb.table("supplier_categories").delete().eq("supplier_id", sid).eq("category_id", cid).execute()
    log.info(f"  vínculos fornecedor×categoria: +{len(to_add)} / -{len(to_del)}")
    return len(rows), len(to_add) + len(to_del), None, None


def _candidate_procs(my, wm_seals, wm_docs):
    """Processos alterados OU com documentos alterados desde os watermarks."""
    cur = my.cursor()
    ids = set()
    cur.execute("SELECT id FROM processo WHERE update_date > %s", (wm_seals,))
    ids.update(r[0] for r in cur.fetchall())
    cur.execute("SELECT DISTINCT id_processo FROM processo_documento WHERE update_date > %s OR create_date > %s",
                (wm_docs, wm_docs))
    ids.update(r[0] for r in cur.fetchall())
    cur.close()
    return ids


def _archived_pairs(my, sb):
    """Pares (fornecedor, cliente) cujo processo espelhado no ELOS (em análise
    ou homologado) foi ARQUIVADO ou desativado no HOC (20/10, revisão do Farol).
    O arquivamento do HOC não mexe em update_date, então o incremental não via."""
    ids, start = [], 0
    while True:
        res = (sb.table("seals").select("hoc_process_id").in_("status", ["PENDING", "ACTIVE"])
               .not_.is_("hoc_process_id", "null").range(start, start + 999).execute())
        ids += [r["hoc_process_id"] for r in (res.data or [])]
        if len(res.data or []) < 1000: break
        start += 1000
    pairs = set()
    cur = my.cursor(dictionary=True)
    for chunk in chunks(sorted(set(ids)), 1000):
        ph = ",".join(["%s"] * len(chunk))
        cur.execute(f"""SELECT p.id_fornecedor, fl.id_cliente FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
            WHERE p.id IN ({ph}) AND (p.ativo = 0 OR p.data_arquivamento IS NOT NULL)""", tuple(chunk))
        pairs.update((r["id_fornecedor"], r["id_cliente"]) for r in cur.fetchall())
    cur.close()
    return pairs


def sync_seals(my, sb, dry, wm):
    wm = wm or INITIAL_WM["seals"]
    proc_ids = _candidate_procs(my, wm, wm)
    arquivados = _archived_pairs(my, sb)
    if arquivados:
        log.info(f"  processos espelhados arquivados/inativos no HOC: {len(arquivados)} par(es) reavaliado(s)")
    if not proc_ids and not arquivados:
        return 0, 0, wm, None
    cur = my.cursor(dictionary=True)
    # pares (fornecedor, cliente) afetados
    pairs = set(arquivados)
    new_wm = wm
    for chunk in chunks(list(proc_ids), 500):
        ph = ",".join(["%s"] * len(chunk))
        cur.execute(f"""SELECT p.id_fornecedor, fl.id_cliente, p.update_date
            FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo WHERE p.id IN ({ph})""", tuple(chunk))
        for r in cur.fetchall():
            pairs.add((r["id_fornecedor"], r["id_cliente"]))
            if r["update_date"] and r["update_date"].strftime("%Y-%m-%d %H:%M:%S") > new_wm:
                new_wm = r["update_date"].strftime("%Y-%m-%d %H:%M:%S")

    supplier_map = load_supplier_map_ordered(sb)
    client_map = load_client_map(sb)
    migrados = migrated_hoc_clients(sb)
    read = len(pairs); written = 0

    for f_id, c_id in pairs:
        if c_id in migrados:   # processo de cliente migrado: o ELOS é o dono (patch_149)
            continue
        # Processo mais recente REAL do par (18/09): a data_validade do HOC é
        # gravada NA CRIAÇÃO (início+1 ano) e NÃO prova homologação — quem
        # decide é o resultado das categorias (classify_seal). Processo pago/
        # subsidiado ativo SEM aprovação = EM ANÁLISE, mesmo com "validade"
        # preenchida ou vencida (o farol do HOC ignora validade).
        cur.execute("""SELECT p.id AS proc_id, p.data_validade, p.ativo,
                   f.cnpj, c.razao_social AS cliente_razao, c.sigla AS cliente_sigla
            FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
            JOIN fornecedor f ON f.id = p.id_fornecedor
            JOIN cliente c ON c.id = fl.id_cliente
            WHERE p.id_fornecedor = %s AND fl.id_cliente = %s
              AND p.ativo = 1
              AND NOT (COALESCE(p.pre_cadastro, 0) = 1
                       AND COALESCE(p.boleto_pago, 0) = 0
                       AND COALESCE(p.subsidiado, 0) = 0)
              AND (COALESCE(p.boleto_pago, 0) = 1 OR COALESCE(p.subsidiado, 0) = 1
                   OR (p.tipo = 'IT' AND p.forma_pagamento = 'WT'))
            ORDER BY p.id DESC LIMIT 1""", (f_id, c_id))
        row = cur.fetchone()
        supplier_id = None; client_id = client_map.get(c_id)

        # EM ANÁLISE no HOC (regra 09/09): sem homologação vigente, mas com
        # processo ativo que passou de aceite+pagamento (boleto pago ou
        # subsidiado, fora do pré-cadastro) → selo PENDING no ELOS.
        # Pré-cadastro/boleto em aberto NÃO é análise.
        in_analysis = None
        if not row:
            cur.execute("""SELECT p.id AS proc_id, f.cnpj,
                       c.razao_social AS cliente_razao, c.sigla AS cliente_sigla
                FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
                JOIN fornecedor f ON f.id = p.id_fornecedor
                JOIN cliente c ON c.id = fl.id_cliente
                WHERE p.id_fornecedor = %s AND fl.id_cliente = %s
                  AND p.ativo = 1 AND p.data_validade IS NULL
                  AND COALESCE(p.pre_cadastro, 0) = 0
                  AND (p.boleto_pago = 1 OR p.subsidiado = 1)
                ORDER BY p.id DESC LIMIT 1""", (f_id, c_id))
            in_analysis = cur.fetchone()

        if row:
            supplier_id = supplier_map.get(clean_cnpj(row["cnpj"]))
            if not supplier_id or not client_id: continue
            cur.execute("SELECT resultado FROM processo_categorias WHERE id_processo = %s", (row["proc_id"],))
            resultados = [r["resultado"] or "" for r in cur.fetchall()]
            seal_status, seal_level = classify_seal(resultados)
            cliente_nome = safe_str(row["cliente_razao"]) or safe_str(row["cliente_sigla"]) or f"HOC-{c_id}"
            expiry = to_date_str(row["data_validade"])
            # homologado de verdade = categorias APROVADAS; a validade só
            # define vigência (vencida → EXPIRED). Sem aprovação → EM ANÁLISE.
            if seal_status == "ACTIVE" and expiry and expiry < _dt.date.today().isoformat():
                seal_status = "EXPIRED"
            nome_selo = (f"Em análise – {cliente_nome}" if seal_status == "PENDING"
                         else f"Homologado – {cliente_nome}")
            rec = {"status": seal_status, "level": seal_level, "seal_type": "homologado",
                   "seal_name": nome_selo,
                   "hoc_process_id": row["proc_id"], "hoc_expiry_date": expiry,
                   # paridade HOC: resultado "Aprovado Com Carta" = homologação com exceção
                   "exception": any("carta" in (r or "").lower() for r in resultados)}
            if seal_status == "ACTIVE":
                rec["expires_at"] = expiry
        elif in_analysis:
            supplier_id = supplier_map.get(clean_cnpj(in_analysis["cnpj"]))
            if not supplier_id or not client_id: continue
            cliente_nome = safe_str(in_analysis["cliente_razao"]) or safe_str(in_analysis["cliente_sigla"]) or f"HOC-{c_id}"
            rec = {"status": "PENDING", "seal_type": "homologado",
                   "seal_name": f"Em análise – {cliente_nome}",
                   "hoc_process_id": in_analysis["proc_id"]}
        else:
            # par sem processo válido: selo existente expira (nunca deleta)
            cur.execute("SELECT cnpj FROM fornecedor WHERE id = %s", (f_id,))
            fr = cur.fetchone()
            supplier_id = supplier_map.get(clean_cnpj(fr["cnpj"])) if fr else None
            if not supplier_id or not client_id: continue
            rec = {"status": "EXPIRED"}

        if dry: written += 1; continue
        res = sb.table("seals").select("id,status").eq("supplier_id", supplier_id).eq("client_id", client_id).execute()
        if res.data:
            sb.table("seals").update(rec).eq("id", res.data[0]["id"]).execute()
        elif row or in_analysis:
            sb.table("seals").insert({**rec, "supplier_id": supplier_id, "client_id": client_id}).execute()
        written += 1
        if rec.get("status") == "ACTIVE":
            sb.table("suppliers").update({"status": "ACTIVE"}).eq("id", supplier_id).neq("status", "SUSPENDED").execute()
            sb.table("plans").upsert({
                "supplier_id": supplier_id, "type": "homologado", "status": "ACTIVE",
                "ends_at": rec.get("expires_at"), "source": "HOC",
                "hoc_process_id": rec.get("hoc_process_id"),
            }, on_conflict="supplier_id").execute()
    cur.close()
    return read, written, new_wm, None


def sync_documents(my, sb, dry, wm):
    wm = wm or INITIAL_WM["documents"]
    cur = my.cursor(dictionary=True)
    cur.execute("""SELECT DISTINCT p.id_fornecedor, pd.id_documento, pd.update_date, pd.create_date
        FROM processo_documento pd JOIN processo p ON p.id = pd.id_processo
        WHERE pd.update_date > %s OR pd.create_date > %s""", (wm, wm))
    changed = cur.fetchall()
    if not changed:
        cur.close(); return 0, 0, wm, None
    new_wm = max_wm(changed, "update_date", "create_date") or wm
    keys = {(r["id_fornecedor"], r["id_documento"]) for r in changed}
    supplier_map = load_supplier_map_ordered(sb)

    written = 0
    for f_id, doc_id in keys:
        # 1) PENDENTE DE ANÁLISE tem prioridade (18/09 — a fila do analista
        #    do ELOS espelha o farol do HOC): situacao NULL, processo pago e
        #    concluído pelo fornecedor (data_fim), interno OU com arquivo
        cur.execute("""SELECT pd.data_vencimento, pd.data_limite_analise, a.id AS arquivo_id,
                   d.descricao AS doc_descricao, d.responsabilidade, f.cnpj,
                   COALESCE(pd.update_date, pd.create_date) AS enviado_em
            FROM processo_documento pd
            JOIN processo p ON p.id = pd.id_processo
            JOIN documento d ON d.id = pd.id_documento
            LEFT JOIN arquivo a ON a.id = pd.id_arquivo
            JOIN fornecedor f ON f.id = p.id_fornecedor
            JOIN fluxo fl ON fl.id = p.id_fluxo
            JOIN cliente c ON c.id = fl.id_cliente
            WHERE p.id_fornecedor = %s AND pd.id_documento = %s
              AND p.ativo = 1 AND f.ativo = 1 AND c.ativo = 1
              AND p.data_fim IS NOT NULL AND pd.situacao IS NULL
              AND (p.boleto_pago = 1
                   OR (p.boleto_pago = 0 AND d.tipo = 'TIPO_COMPROVANTE_PAGTO'
                       AND p.tipo = 'IT' AND p.forma_pagamento = 'WT'))
              AND (d.responsabilidade = 'I' OR (d.responsabilidade = 'F' AND pd.id_arquivo IS NOT NULL))
            ORDER BY pd.id DESC LIMIT 1""", (f_id, doc_id))
        pend = cur.fetchone()
        if pend:
            supplier_id = supplier_map.get(clean_cnpj(pend["cnpj"]))
            if not supplier_id:
                continue
            rec = {
                "supplier_id": supplier_id, "type": str(doc_id),
                "label": safe_str(pend["doc_descricao"]),
                "source": "MANUAL", "status": "PENDING",
                "expires_at": to_date_str(pend.get("data_vencimento")),
                "public_url": None,
                "hoc_arquivo_id": pend["arquivo_id"],
                "hoc_analysis_due": to_date_str(pend.get("data_limite_analise")),
                "submitted_at": (pend["enviado_em"].isoformat() if pend.get("enviado_em") else None),
            }
            if dry: written += 1; continue
            sb.table("documents").upsert(rec, on_conflict="supplier_id,type").execute()
            written += 1
            continue

        # 2) versão APROVADA vigente (regra original)
        cur.execute("""SELECT pd.data_vencimento, pd.situacao, a.id AS arquivo_id,
                   d.descricao AS doc_descricao, f.cnpj
            FROM processo_documento pd
            JOIN processo p ON p.id = pd.id_processo
            JOIN documento d ON d.id = pd.id_documento
            JOIN arquivo a ON a.id = pd.id_arquivo
            JOIN fornecedor f ON f.id = p.id_fornecedor
            WHERE p.id_fornecedor = %s AND pd.id_documento = %s
              AND p.ativo = 1 AND p.data_validade >= NOW() AND pd.situacao = 'O'
            ORDER BY pd.id DESC LIMIT 1""", (f_id, doc_id))
        row = cur.fetchone()
        if not row:
            continue  # sem versão vigente no HOC — mantém o que o ELOS tem
        supplier_id = supplier_map.get(clean_cnpj(row["cnpj"]))
        if not supplier_id:
            continue
        rec = {
            "supplier_id": supplier_id, "type": str(doc_id),
            "label": safe_str(row["doc_descricao"]),
            "source": "MANUAL", "status": "VALID",
            "expires_at": to_date_str(row.get("data_vencimento")),
            "public_url": None,
            "hoc_arquivo_id": row["arquivo_id"],
            "hoc_analysis_due": None,
        }
        if dry: written += 1; continue
        sb.table("documents").upsert(rec, on_conflict="supplier_id,type").execute()
        written += 1
    cur.close()
    log.info(f"  chaves (fornecedor,doc) afetadas: {len(keys)} · atualizadas: {written}")
    return len(changed), written, new_wm, None


def sync_hoc_log(my, sb, dry, last_id):
    if last_id is None:
        # bootstrap: maior hoc_log_id já importado (ordenação por caminho JSON)
        try:
            res = sb.table("audit_log").select("metadata->hoc_log_id") \
                .eq("action", "HOC_LOG").order("metadata->hoc_log_id", desc=True).limit(1).execute()
            last_id = int(res.data[0]["hoc_log_id"]) if res.data else 0
        except Exception:
            last_id = 35719557  # max da importação inicial (17/08/2026)
    cur = my.cursor()
    # 15/10 (patch_144): o cliente do processo vai junto — o cliente vê no ELOS
    # só o log do processo DELE (client_process_log)
    cur.execute(f"""SELECT l.id, l.descricao, l.data, l.created_by, p.id_fornecedor, fl.id_cliente
        FROM log_processo l JOIN processo p ON p.id = l.id_processo
        LEFT JOIN fluxo fl ON fl.id = p.id_fluxo
        WHERE l.id > %s AND {HUMAN_LOG_FILTER} ORDER BY l.id""", (last_id,))
    rows = cur.fetchall(); cur.close()
    if not rows:
        return 0, 0, None, last_id
    supplier_map_hoc = {r["hoc_id"]: r["id"]
                        for r in fetch_all(sb, "suppliers", "id,hoc_id")
                        if r.get("hoc_id") is not None}

    written = 0; max_id = last_id
    batch = []
    for hoc_log_id, descricao, data, autor, id_forn, id_cli in rows:
        max_id = max(max_id, hoc_log_id)
        sup = supplier_map_hoc.get(id_forn)
        if not sup: continue
        batch.append({
            "entity_id": sup, "entity_type": "supplier", "action": "HOC_LOG", "user_id": None,
            "created_at": data.isoformat() if data else datetime.now(timezone.utc).isoformat(),
            "metadata": {"descricao": (descricao or "").strip()[:1000], "autor": autor or "",
                          "hoc_log_id": hoc_log_id, "hoc_cliente_id": id_cli, "fonte": "hoc"},
        })
    if not dry:
        for chunk in chunks(batch, 500):
            sb.table("audit_log").insert(chunk).execute()
    written = len(batch)
    return len(rows), written, None, max_id


def sync_invitations(my, sb, dry):
    """Convites do HOC (tabela convite) → invitations, SÓ COMO HISTÓRICO (patch_116).

    Regra do Luiz (05/10/2026): convite com hoc_id NUNCA dispara nada pelo ELOS
    (lembrete, reenvio, cancelamento, vínculo, liberação de processo) — o HOC
    tem processo ativo próprio. As travas estão no código e nos gatilhos.
      F → REGISTERED (com supplier_id pelo CNPJ, como o convite do ELOS)
      C → CANCELLED · P → SENT se criado nos últimos 12 meses, senão EXPIRED
    Pendente/cancelado ficam sem supplier_id: o cliente não passa a enxergar
    dados de quem não concluiu o cadastro. token NULL: link nunca existiu aqui.
    Sem watermark (convite não tem data de alteração) → diff completo; só
    grava o que mudou. Sem DELETE.
    """
    cur = my.cursor(dictionary=True)
    cur.execute("""SELECT id, cnpj, razao_social, email, contato, telefone, id_cliente,
                          origem, status, subsidiado, id_processo, escopo_fornecedor,
                          data_criacao, data_finalizacao, create_date
                   FROM convite ORDER BY id""")
    rows = cur.fetchall(); cur.close()

    client_map = load_client_map(sb)
    supplier_map = load_supplier_map_ordered(sb)
    flows = fetch_all(sb, "client_flows", "id,client_id,is_default,active")
    default_flow = {}
    for fl in flows:
        if fl.get("active") and (fl.get("is_default") or fl["client_id"] not in default_flow):
            default_flow[fl["client_id"]] = fl["id"]

    corte = datetime.now() - _dt.timedelta(days=365)
    def iso(v):
        return v.isoformat() if v else None

    migrados = migrated_hoc_clients(sb)
    alvo, sem_cliente = {}, 0
    for r in rows:
        cid = client_map.get(r["id_cliente"])
        if not cid:
            sem_cliente += 1
            continue
        if r["id_cliente"] in migrados:   # histórico já trazido até a virada
            continue
        criado = r["data_criacao"] or r["create_date"]
        st = r["status"]
        status = ("REGISTERED" if st == "F" else "CANCELLED" if st == "C"
                  else ("SENT" if criado and criado >= corte else "EXPIRED"))
        cnpj = clean_cnpj(r["cnpj"]) or ""
        rec = {
            "hoc_id": r["id"], "client_id": cid, "status": status,
            "hoc_status": st, "hoc_origem": safe_str(r["origem"]),
            "hoc_processo_id": r["id_processo"],
            "supplier_cnpj": cnpj,
            "supplier_razao_social": safe_str(r["razao_social"]) or "",
            "supplier_email": (safe_str(r["email"]) or "").lower() or None,
            "contato": safe_str(r["contato"]), "telefone": safe_str(r["telefone"]),
            "escopo": safe_str(r["escopo_fornecedor"]),
            "subsidiado": bool(r["subsidiado"]),
            "supplier_id": supplier_map.get(cnpj) if status == "REGISTERED" else None,
            "flow_id": default_flow.get(cid),
            "cancelled_at": iso(r["data_finalizacao"]) if status == "CANCELLED" else None,
            "cancel_reason": "Cancelado no HOC" if status == "CANCELLED" else None,
        }
        alvo[r["id"]] = (rec, iso(criado), iso(r["data_finalizacao"] or criado))

    COMP = ["client_id", "status", "hoc_status", "hoc_origem", "hoc_processo_id", "supplier_cnpj",
            "supplier_razao_social", "supplier_email", "contato", "telefone", "escopo",
            "subsidiado", "supplier_id", "flow_id", "cancel_reason"]
    elos = {e["hoc_id"]: e for e in fetch_all(sb, "invitations", "id," + ",".join(["hoc_id"] + COMP),
                                              order="hoc_id") if e.get("hoc_id") is not None}

    novos, mudou = [], []
    for hid, (rec, criado, atualizado) in alvo.items():
        cur_ = elos.get(hid)
        if cur_ is None:
            novos.append({**rec, "token": None, "invited_by_role": "CLIENT", "objetivo": "homologacao",
                          "created_at": criado, "updated_at": atualizado})
        elif any((cur_.get(k) or None) != (rec.get(k) or None) for k in COMP):
            mudou.append((cur_["id"], {**rec, "updated_at": datetime.now(timezone.utc).isoformat()}))

    por_status = {}
    for rec, _, _ in alvo.values():
        por_status[rec["status"]] = por_status.get(rec["status"], 0) + 1
    log.info(f"  convites HOC: {len(rows)} lidos · {sem_cliente} sem cliente mapeado · "
             f"alvo {por_status} · novos {len(novos)} · alterados {len(mudou)}")
    if not dry:
        for chunk in chunks(novos, 500):
            sb.table("invitations").insert(chunk).execute()
        for iid, rec in mudou:
            sb.table("invitations").update(rec).eq("id", iid).not_.is_("hoc_id", "null").execute()
    return len(rows), len(novos) + len(mudou), None, None


# ── main ──────────────────────────────────────────────────────────────────

def sync_boletos_migrados(my, sb, dry):
    """Boleto emitido no HOC antes da virada (seals.hoc_boleto_status='A_VENCER').

    Decisão do Luiz (17/10): conferir todo dia no HOC se houve pagamento.
      pago no HOC          → processo liberado no ELOS (released_at = data do pagamento)
      vencido há 5+ dias   → VENCIDO: o fornecedor passa a pagar pelo ELOS
    (5 dias de tolerância para a compensação bancária). HOC só leitura.
    """
    rows = [r for r in fetch_all(sb, "seals", "id,hoc_origin_process_id,hoc_boleto_status,hoc_boleto_due,released_at")
            if r.get("hoc_boleto_status") == "A_VENCER" and not r.get("released_at") and r.get("hoc_origin_process_id")]
    if not rows:
        return 0, 0, None, None
    cur = my.cursor(dictionary=True)
    hoje = _dt.date.today()
    written = 0
    for r in rows:
        cur.execute("""SELECT p.boleto_pago, p.data_pagamento AS proc_pago,
                              MAX(b.data_pagamento) AS pago_em, MAX(b.data_vencimento) AS vence
                       FROM processo p LEFT JOIN boleto b ON b.id_processo = p.id
                       WHERE p.id = %s GROUP BY p.id, p.boleto_pago, p.data_pagamento""", (r["hoc_origin_process_id"],))
        h = cur.fetchone()
        if not h:
            continue
        pago_em = h["pago_em"] or h["proc_pago"]
        if h["boleto_pago"] or pago_em:
            quando = (pago_em or datetime.now(timezone.utc))
            upd = {"hoc_boleto_status": "PAGO", "released_at": quando.isoformat() if hasattr(quando, "isoformat") else str(quando)}
            log.info(f"  boleto HOC compensado → processo liberado: seal {r['id']} (HOC {r['hoc_origin_process_id']})")
        else:
            vence = h["vence"].date() if hasattr(h["vence"], "date") else h["vence"]
            if not vence or vence + _dt.timedelta(days=5) >= hoje:
                continue
            upd = {"hoc_boleto_status": "VENCIDO"}
            log.info(f"  boleto HOC vencido em {vence} sem pagamento → paga pelo ELOS: seal {r['id']}")
        if not dry:
            sb.table("seals").update(upd).eq("id", r["id"]).execute()
        written += 1
    cur.close()
    return len(rows), written, None, None


def sync_docs_pendentes_hoc(my, sb, dry):
    """Documento "Em análise" no ELOS cujo único arquivo é do HOC (20/10, revisão
    do Farol). sync_documents só grava PENDENTE ou APROVADO vigente: quando o HOC
    recusava, ou aprovava num processo ainda sem validade, o ELOS ficava com o
    "Em análise" antigo para sempre. Aqui, todo dia: se o arquivo não está
    pendente em nenhum processo ATIVO do HOC, o documento recebe a situação da
    última análise do HOC — O → VALID · NO → REJECTED · VC → EXPIRED.
    Documento com arquivo enviado no ELOS (storage_path) nunca é tocado."""
    docs, start = [], 0
    while True:
        res = (sb.table("documents").select("id,hoc_arquivo_id,expires_at").eq("status", "PENDING")
               .not_.is_("hoc_arquivo_id", "null").is_("storage_path", "null").range(start, start + 999).execute())
        docs += res.data or []
        if len(res.data or []) < 1000: break
        start += 1000
    if not docs:
        return 0, 0, None, None
    cur = my.cursor(dictionary=True)
    estado = {}
    for chunk in chunks(sorted({d["hoc_arquivo_id"] for d in docs}), 1000):
        ph = ",".join(["%s"] * len(chunk))
        cur.execute(f"""SELECT pd.id_arquivo, pd.situacao, pd.data_vencimento, pd.data_analise, pd.id,
                   (pd.situacao IS NULL AND p.ativo = 1 AND p.data_arquivamento IS NULL AND p.data_fim IS NOT NULL) AS pendente
            FROM processo_documento pd JOIN processo p ON p.id = pd.id_processo
            WHERE pd.id_arquivo IN ({ph})""", tuple(chunk))
        for r in cur.fetchall():
            e = estado.setdefault(r["id_arquivo"], {"pendente": False, "ultima": None})
            if r["pendente"]:
                e["pendente"] = True
            elif r["situacao"] in ("O", "NO", "VC"):
                chave = (r["data_analise"] or datetime.min, r["id"])
                if not e["ultima"] or chave > e["ultima"][0]:
                    e["ultima"] = (chave, r["situacao"], r["data_vencimento"])
    cur.close()
    MAPA = {"O": "VALID", "NO": "REJECTED", "VC": "EXPIRED"}
    mudancas = {"VALID": 0, "REJECTED": 0, "EXPIRED": 0}
    for d in docs:
        e = estado.get(d["hoc_arquivo_id"])
        if not e or e["pendente"] or not e["ultima"]:
            continue   # segue pendente no HOC (ou sem análise registrada): mantém
        _, sit, venc = e["ultima"]
        novo = MAPA[sit]
        upd = {"status": novo}
        if novo == "VALID" and venc:
            upd["expires_at"] = to_date_str(venc)
            if to_date_str(venc) < _dt.date.today().isoformat():
                upd["status"] = novo = "EXPIRED"
        if novo == "REJECTED":
            upd["review_note"] = "Recusado na análise do SIGEC-HOC — aguardando novo envio do fornecedor"
        mudancas[novo] += 1
        if not dry:
            sb.table("documents").update(upd).eq("id", d["id"]).eq("status", "PENDING").execute()
    log.info(f"  docs 'Em análise' só com arquivo do HOC: {len(docs)} conferidos · "
             f"→ válido {mudancas['VALID']} · recusado {mudancas['REJECTED']} · vencido {mudancas['EXPIRED']}")
    return len(docs), sum(mudancas.values()), None, None


def main():
    ap = argparse.ArgumentParser(description="Sync diário HOC → ELOS")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--entities", default="all")
    ap.add_argument("--config", default="hoc_migration_config.json")
    args = ap.parse_args()

    with open(args.config) as f:
        cfg = json.load(f)
    my = connect_mysql(cfg["hoc_mysql"])
    sb = connect_supabase(cfg["sigec_supabase"])

    wanted = ALL_ENTITIES if args.entities == "all" else [e.strip() for e in args.entities.split(",")]
    ok = True
    for entity in ALL_ENTITIES:
        if entity not in wanted:
            continue
        state = {} if args.dry_run else get_state(sb, entity)
        wm, last_id = state.get("watermark"), state.get("last_id")
        fn = {
            "clients":             lambda: sync_clients(my, sb, args.dry_run),
            "catalog":             lambda: sync_catalog(my, sb, args.dry_run),
            "categories":          lambda: sync_categories(my, sb, args.dry_run, wm),
            "category_documents":  lambda: sync_category_documents(my, sb, args.dry_run, wm),
            "suppliers":           lambda: sync_suppliers(my, sb, args.dry_run, wm),
            "supplier_categories": lambda: sync_supplier_categories(my, sb, args.dry_run),
            "seals":               lambda: sync_seals(my, sb, args.dry_run, wm),
            "documents":           lambda: sync_documents(my, sb, args.dry_run, wm),
            "hoc_log":             lambda: sync_hoc_log(my, sb, args.dry_run, last_id),
            "invitations":         lambda: sync_invitations(my, sb, args.dry_run),
            "boletos_migrados":    lambda: sync_boletos_migrados(my, sb, args.dry_run),
            "docs_pendentes_hoc":  lambda: sync_docs_pendentes_hoc(my, sb, args.dry_run),
        }[entity]
        ok = run_entity(sb, entity, fn, args.dry_run) and ok

    my.close()
    log.info("SYNC CONCLUÍDO" + (" (dry-run)" if args.dry_run else "") + ("" if ok else " — COM ERROS"))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
