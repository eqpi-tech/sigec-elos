#!/usr/bin/env python3
"""
recalc_scores_v2.py — Recalcula seals.score por selo (pós-migração v2).

Regra: cada selo usa o denominador do SEU fluxo —
  selo de cliente → docs exigidos pelas categorias do cliente (client_id)
  selo ELOS       → docs exigidos pelas categorias globais
Fallbacks: client_document_flows → global.

Só escreve no Supabase (seals.score). Uso:
  arch -x86_64 python3 recalc_scores_v2.py
"""
import json
from supabase import create_client

cfg = json.load(open("hoc_migration_config.json"))["sigec_supabase"]
sb = create_client(cfg["url"], cfg["service_role_key"])


def fetch_all(table, select, page=1000, **filters):
    rows, offset = [], 0
    while True:
        q = sb.table(table).select(select).range(offset, offset + page - 1)
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        rows.extend(res.data or [])
        if not res.data or len(res.data) < page:
            return rows
        offset += page


print("Carregando dados...")
seals = fetch_all("seals", "id, supplier_id, client_id")
sup_cats = fetch_all("supplier_categories", "supplier_id, category_id, categories(client_id)")
cat_docs = fetch_all("category_documents", "category_id, document_id")
docs = fetch_all("documents", "supplier_id, type, status")
flows = fetch_all("client_document_flows", "client_id, catalog_id, required")
print(f"  {len(seals)} selos · {len(sup_cats)} vínculos · {len(cat_docs)} cat_docs · {len(docs)} docs")

# categoria → docs exigidos
docs_by_cat = {}
for r in cat_docs:
    docs_by_cat.setdefault(r["category_id"], set()).add(r["document_id"])

# fornecedor → {owner: set(categorias)}
cats_by_sup = {}
for r in sup_cats:
    owner = (r.get("categories") or {}).get("client_id") or "global"
    cats_by_sup.setdefault(r["supplier_id"], {}).setdefault(owner, set()).add(r["category_id"])

# fornecedor → tipos VALID
valid_by_sup = {}
for d in docs:
    if d["status"] == "VALID":
        valid_by_sup.setdefault(d["supplier_id"], set()).add(str(d["type"]))

# cliente → fluxo manual (fallback)
flow_by_client = {}
for f in flows:
    if f.get("required", True):
        flow_by_client.setdefault(f["client_id"], set()).add(f["catalog_id"])

updates = []
for seal in seals:
    sup, owner = seal["supplier_id"], seal["client_id"] or "global"
    groups = cats_by_sup.get(sup, {})
    req = set()
    for cat in groups.get(owner, set()):
        req |= docs_by_cat.get(cat, set())
    if not req and seal["client_id"]:
        req = flow_by_client.get(seal["client_id"], set())
    if not req:
        for cat in groups.get("global", set()):
            req |= docs_by_cat.get(cat, set())
    if not req:
        continue
    valid = valid_by_sup.get(sup, set())
    score = round(100 * sum(1 for t in req if str(t) in valid) / len(req))
    updates.append({"id": seal["id"], "score": score})

print(f"Atualizando {len(updates)} selos...")
for i in range(0, len(updates), 200):
    sb.table("seals").upsert(updates[i:i + 200], on_conflict="id").execute()
print("✅ concluído")
dist = {}
for u in updates:
    b = min(u["score"] // 20 * 20, 80)
    dist[b] = dist.get(b, 0) + 1
for b in sorted(dist):
    print(f"  score {b:>3}-{b+19}: {dist[b]:>5} selos")
