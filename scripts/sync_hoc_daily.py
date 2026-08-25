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
           supplier_categories, seals, documents, hoc_log
(details — sócios/bancários/balanços/questionários — roda semanal via
 migrate_hoc_v2.py --phase details, já idempotente.)
"""
import argparse
import json
import re
import time
from datetime import datetime, timezone

from migrate_hoc_v2 import (
    CAT_ID_OFFSET, RESP_MAP, chunks, clean_cnpj, classify_seal,
    connect_mysql, connect_supabase, load_client_map, load_supplier_map,
    log, safe_str, to_date_str,
)

ALL_ENTITIES = ["clients", "catalog", "categories", "category_documents",
                "suppliers", "supplier_categories", "seals", "documents", "hoc_log"]

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
    return {re.sub(r"\D", "", r["cnpj"] or ""): r["id"] for r in rows if r.get("cnpj")}


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
        if dry: written += 1; continue
        res = sb.table("clients").select("id").eq("hoc_id", row["id"]).execute()
        if res.data:
            sb.table("clients").update(rec).eq("id", res.data[0]["id"]).execute()
        else:
            sb.table("clients").insert(rec).execute()
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

    batch = []
    for row in rows:
        client_id = client_map.get(row["id_cliente"])
        if not client_id:
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
        gone_ids = [elos_client_hoc[h]["id"] for h in elos_client_hoc if h not in all_ids and elos_client_hoc[h]["active"]]
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
            cd.update_date, cd.create_date
        FROM categoria_documento cd JOIN categoria c ON c.id = cd.id_categoria
        WHERE 1=1 {cond}""", (wm, wm) if wm else None)
    rows = cur.fetchall()
    seen, batch = set(), []
    for lk in rows:
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
            if e["category_id"] >= CAT_ID_OFFSET and e["required"] and (e["category_id"], e["document_id"]) not in hoc_keys:
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

    to_add = [{"supplier_id": a, "category_id": b} for a, b in hoc_keys - elos_keys]
    to_del = list(elos_keys - hoc_keys)
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


def sync_seals(my, sb, dry, wm):
    wm = wm or INITIAL_WM["seals"]
    proc_ids = _candidate_procs(my, wm, wm)
    if not proc_ids:
        return 0, 0, wm, None
    cur = my.cursor(dictionary=True)
    # pares (fornecedor, cliente) afetados
    pairs = set()
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
    read = len(pairs); written = 0

    for f_id, c_id in pairs:
        # processo mais recente VÁLIDO do par (mesma regra da v2)
        cur.execute("""SELECT p.id AS proc_id, p.data_validade, p.ativo,
                   f.cnpj, c.razao_social AS cliente_razao, c.sigla AS cliente_sigla
            FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
            JOIN fornecedor f ON f.id = p.id_fornecedor
            JOIN cliente c ON c.id = fl.id_cliente
            WHERE p.id_fornecedor = %s AND fl.id_cliente = %s
              AND p.ativo = 1 AND p.data_validade >= NOW()
            ORDER BY p.id DESC LIMIT 1""", (f_id, c_id))
        row = cur.fetchone()
        supplier_id = None; client_id = client_map.get(c_id)

        if row:
            supplier_id = supplier_map.get(clean_cnpj(row["cnpj"]))
            if not supplier_id or not client_id: continue
            cur.execute("SELECT resultado FROM processo_categorias WHERE id_processo = %s", (row["proc_id"],))
            resultados = [r["resultado"] or "" for r in cur.fetchall()]
            seal_status, seal_level = classify_seal(resultados)
            cliente_nome = safe_str(row["cliente_razao"]) or safe_str(row["cliente_sigla"]) or f"HOC-{c_id}"
            expiry = to_date_str(row["data_validade"])
            rec = {"status": seal_status, "level": seal_level, "seal_type": "homologado",
                   "seal_name": f"Homologado – {cliente_nome}",
                   "hoc_process_id": row["proc_id"], "hoc_expiry_date": expiry}
            if seal_status == "ACTIVE":
                rec["expires_at"] = expiry
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
        elif row:
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
    cur.execute(f"""SELECT l.id, l.descricao, l.data, l.created_by, p.id_fornecedor
        FROM log_processo l JOIN processo p ON p.id = l.id_processo
        WHERE l.id > %s AND {HUMAN_LOG_FILTER} ORDER BY l.id""", (last_id,))
    rows = cur.fetchall(); cur.close()
    if not rows:
        return 0, 0, None, last_id
    supplier_map_hoc = {r["hoc_id"]: r["id"]
                        for r in fetch_all(sb, "suppliers", "id,hoc_id")
                        if r.get("hoc_id") is not None}

    written = 0; max_id = last_id
    batch = []
    for hoc_log_id, descricao, data, autor, id_forn in rows:
        max_id = max(max_id, hoc_log_id)
        sup = supplier_map_hoc.get(id_forn)
        if not sup: continue
        batch.append({
            "entity_id": sup, "entity_type": "supplier", "action": "HOC_LOG", "user_id": None,
            "created_at": data.isoformat() if data else datetime.now(timezone.utc).isoformat(),
            "metadata": {"descricao": (descricao or "").strip()[:1000], "autor": autor or "",
                          "hoc_log_id": hoc_log_id, "fonte": "hoc"},
        })
    if not dry:
        for chunk in chunks(batch, 500):
            sb.table("audit_log").insert(chunk).execute()
    written = len(batch)
    return len(rows), written, None, max_id


# ── main ──────────────────────────────────────────────────────────────────

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
        }[entity]
        ok = run_entity(sb, entity, fn, args.dry_run) and ok

    my.close()
    log.info("SYNC CONCLUÍDO" + (" (dry-run)" if args.dry_run else "") + ("" if ok else " — COM ERROS"))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
