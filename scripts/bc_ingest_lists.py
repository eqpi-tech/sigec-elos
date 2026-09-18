#!/usr/bin/env python3
"""BC Report — ingestão das listas restritivas (rota A local_db). Handoff §7.

Baixa e regrava as tabelas ref_* no Supabase:
  ofac              — SDN List (sdn.csv + aliases alt.csv, Tesouro EUA)
  onu               — Consolidated Sanctions (XML oficial)
  trabalho_escravo  — Lista Suja MTE (XLSX; URL em bc_config 'ingest:trabalho_escravo')
  leniencia         — Acordos de Leniência CGU (CSV; URL em bc_config 'ingest:leniencia')

Uso:
  python3 scripts/bc_ingest_lists.py [ofac onu trabalho_escravo leniencia]
  BC_DB_ENV=SUPABASE_DB_URL_PREVIEW python3 scripts/bc_ingest_lists.py ofac onu

Escreve SOMENTE no Supabase apontado pela env (default SUPABASE_DB_URL).
Cada lista é recarga total (delete + insert) numa transação, e a versão fica
em ref_list_versions (o PDF imprime "Lista atualizada em ...").
"""
import csv, io, json, os, re, ssl, sys, datetime, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import pg8000.native

REPO = Path(__file__).resolve().parent.parent
BATCH = 2000
UA = {"User-Agent": "SIGEC-ELOS/1.0 (bc-report ingest)"}


def db():
    env_name = os.environ.get("BC_DB_ENV", "SUPABASE_DB_URL")
    url = os.environ.get(env_name)
    if not url:
        for line in (REPO / ".env").read_text().splitlines():
            if line.startswith(f"{env_name}="):
                url = line.split("=", 1)[1].strip()
    if not url:
        sys.exit(f"env {env_name} não definida")
    m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)", url)
    return pg8000.native.Connection(
        m.group(1), host=m.group(3), port=int(m.group(4)), database=m.group(5),
        password=urllib.parse.unquote(m.group(2)), timeout=60, ssl_context=True)


def fetch_bytes(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def cfg_url(pg, key):
    row = pg.run("select value from bc_config where key = :k", k=key)
    if not row:
        return None, None
    val = row[0][0] if isinstance(row[0][0], dict) else json.loads(row[0][0])
    return val.get("url") or None, val


CASTS = {"listed_on": "date", "data_inicio": "date", "data_fim": "date", "meta": "jsonb"}


def replace_rows(pg, table, cols, rows, list_name, list_date, source_url):
    pg.run("begin")
    try:
        pg.run(f"delete from {table}")
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            arrays = list(zip(*chunk))
            sel = ", ".join(
                "bc_norm_name(t.nome)" if c == "nome_norm"
                else f"cast(t.{c} as {CASTS[c]})" if c in CASTS
                else f"t.{c}" for c in cols)
            unnest_cols = [c for c in cols if c != "nome_norm"]
            params = {f"a{j}": list(arrays[cols.index(c)]) for j, c in enumerate(unnest_cols)}
            unnest_sql = ", ".join(f"cast(:a{j} as text[])" for j in range(len(unnest_cols)))
            alias_cols = ", ".join(unnest_cols)
            pg.run(
                f"insert into {table} ({', '.join(cols)}) "
                f"select {sel} from unnest({unnest_sql}) as t({alias_cols})",
                **params)
        pg.run("""
            insert into ref_list_versions (list, list_date, source_url, rows, ingested_at)
            values (:l, cast(:d as date), :u, :n, now())
            on conflict (list) do update
              set list_date = excluded.list_date, source_url = excluded.source_url,
                  rows = excluded.rows, ingested_at = now()""",
               l=list_name, d=list_date, u=source_url, n=len(rows))
        pg.run("commit")
    except Exception:
        pg.run("rollback")
        raise
    print(f"  {list_name}: {len(rows)} linhas (lista de {list_date or 's/ data'})")


def norm_placeholder(rows_with_name, cols):
    """nome_norm é computado no banco (bc_norm_name) — aqui só posiciona o nome."""
    idx = cols.index("nome_norm")
    out = []
    for r in rows_with_name:
        r = list(r)
        r[idx] = r[cols.index("nome")]
        out.append(r)
    return out


def ingest_ofac(pg):
    url, val = cfg_url(pg, "ingest:ofac")
    url = url or "https://www.treasury.gov/ofac/downloads/sdn.csv"
    alt_url = (val or {}).get("alt_url") or "https://www.treasury.gov/ofac/downloads/alt.csv"
    print("OFAC: baixando SDN…")
    rows = []
    main = fetch_bytes(url).decode("latin-1", "replace")
    for rec in csv.reader(io.StringIO(main)):
        if len(rec) < 4 or not rec[0].isdigit():
            continue
        nome, tipo, progs = rec[1].strip(), (rec[2] or "").strip("-0- ").strip(), (rec[3] or "").strip()
        if not nome:
            continue
        rows.append([rec[0], nome, None, tipo or None, progs or None, None])
    try:
        alt = fetch_bytes(alt_url).decode("latin-1", "replace")
        for rec in csv.reader(io.StringIO(alt)):
            if len(rec) < 4 or not rec[0].isdigit():
                continue
            nome = (rec[3] or "").strip()
            if nome and nome != "-0-":
                rows.append([rec[0], nome, None, "aka", None, None])
    except Exception as e:
        print(f"  aviso: aliases (alt.csv) falhou — segue sem: {e}")
    cols = ["uid", "nome", "nome_norm", "tipo", "programs", "meta"]
    replace_rows(pg, "ref_ofac", cols, norm_placeholder(rows, cols),
                 "ofac", datetime.date.today().isoformat(), url)


def dt10(v):
    v = (v or "").strip()[:10]
    return v if re.match(r"\d{4}-\d{2}-\d{2}$", v) else None


def ingest_onu(pg):
    url, _ = cfg_url(pg, "ingest:onu")
    url = url or "https://scsanctions.un.org/resources/xml/en/consolidated.xml"
    print("ONU: baixando consolidated.xml…")
    root = ET.fromstring(fetch_bytes(url))
    gen = root.attrib.get("dateGenerated", "")[:10] or datetime.date.today().isoformat()
    rows = []
    for ind in root.iter("INDIVIDUAL"):
        nome = " ".join(filter(None, [
            (ind.findtext("FIRST_NAME") or "").strip(),
            (ind.findtext("SECOND_NAME") or "").strip(),
            (ind.findtext("THIRD_NAME") or "").strip(),
            (ind.findtext("FOURTH_NAME") or "").strip()])).strip()
        if nome:
            rows.append([ind.findtext("DATAID"), nome, None, "individual",
                         dt10(ind.findtext("LISTED_ON")), None])
        for aka in ind.iter("INDIVIDUAL_ALIAS"):
            a = (aka.findtext("ALIAS_NAME") or "").strip()
            if a:
                rows.append([ind.findtext("DATAID"), a, None, "individual_aka",
                             dt10(ind.findtext("LISTED_ON")), None])
    for ent in root.iter("ENTITY"):
        nome = (ent.findtext("FIRST_NAME") or "").strip()
        if nome:
            rows.append([ent.findtext("DATAID"), nome, None, "entity",
                         dt10(ent.findtext("LISTED_ON")), None])
        for aka in ent.iter("ENTITY_ALIAS"):
            a = (aka.findtext("ALIAS_NAME") or "").strip()
            if a:
                rows.append([ent.findtext("DATAID"), a, None, "entity_aka",
                             dt10(ent.findtext("LISTED_ON")), None])
    cols = ["uid", "nome", "nome_norm", "tipo", "listed_on", "meta"]
    replace_rows(pg, "ref_onu", cols, norm_placeholder(rows, cols), "onu", gen, url)


def ingest_trabalho_escravo(pg):
    url, _ = cfg_url(pg, "ingest:trabalho_escravo")
    if not url:
        print("trabalho_escravo: sem URL em bc_config 'ingest:trabalho_escravo' — PULADO "
              "(pegar o link do XLSX vigente no gov.br e gravar na config)")
        return
    print("Lista Suja (MTE): baixando…")
    import openpyxl  # só é exigido quando a lista está configurada
    wb = openpyxl.load_workbook(io.BytesIO(fetch_bytes(url)), read_only=True)
    ws = wb.active
    header, rows = None, []
    for rec in ws.iter_rows(values_only=True):
        vals = [str(v).strip() if v is not None else "" for v in rec]
        if header is None:
            joined = " ".join(vals).lower()
            if "cnpj" in joined or "cpf" in joined:
                header = [v.lower() for v in vals]
            continue
        try:
            i_doc = next(i for i, h in enumerate(header) if "cnpj" in h or "cpf" in h)
            i_nome = next(i for i, h in enumerate(header) if "empregador" in h or "nome" in h)
        except StopIteration:
            continue
        doc = re.sub(r"\D", "", vals[i_doc] or "")
        nome = vals[i_nome]
        if not doc or not nome:
            continue
        i_uf = next((i for i, h in enumerate(header) if h in ("uf", "estado")), None)
        i_ano = next((i for i, h in enumerate(header) if "ano" in h), None)
        rows.append([doc, doc[:8] if len(doc) == 14 else None, nome, None,
                     vals[i_uf] if i_uf is not None else None,
                     vals[i_ano] if i_ano is not None else None, None])
    cols = ["doc_digits", "cnpj_root", "nome", "nome_norm", "uf", "ano_acao", "meta"]
    replace_rows(pg, "ref_trabalho_escravo", cols, norm_placeholder(rows, cols),
                 "trabalho_escravo", datetime.date.today().isoformat(), url)


def ingest_leniencia(pg):
    url, _ = cfg_url(pg, "ingest:leniencia")
    if not url:
        print("leniencia: sem URL em bc_config 'ingest:leniencia' — PULADO "
              "(CSV do download-de-dados do Portal da Transparência)")
        return
    print("Leniência (CGU): baixando…")
    raw = fetch_bytes(url)
    if url.endswith(".zip"):
        import zipfile
        zf = zipfile.ZipFile(io.BytesIO(raw))
        raw = zf.read(next(n for n in zf.namelist() if n.lower().endswith(".csv")))
    text = raw.decode("latin-1", "replace")
    rdr = csv.DictReader(io.StringIO(text), delimiter=";")
    rows = []
    for rec in rdr:
        low = {k.lower(): (v or "").strip() for k, v in rec.items() if k}
        doc = re.sub(r"\D", "", next((v for k, v in low.items() if "cnpj" in k), ""))
        nome = next((v for k, v in low.items() if "raz" in k or "nome" in k or "sancionado" in k), "")
        if not doc and not nome:
            continue
        def dt(frag):
            v = next((v for k, v in low.items() if frag in k), "")
            m2 = re.match(r"(\d{2})/(\d{2})/(\d{4})", v)
            return f"{m2.group(3)}-{m2.group(2)}-{m2.group(1)}" if m2 else None
        rows.append([doc or None, doc[:8] if len(doc) == 14 else None, nome or None, None,
                     next((v for k, v in low.items() if "situa" in k), None),
                     dt("início") or dt("inicio"), dt("fim"), json.dumps(low, ensure_ascii=False)])
    cols = ["cnpj_digits", "cnpj_root", "nome", "nome_norm", "situacao", "data_inicio", "data_fim", "meta"]
    replace_rows(pg, "ref_leniencia", cols, norm_placeholder(rows, cols),
                 "leniencia", datetime.date.today().isoformat(), url)


INGESTS = {
    "ofac": ingest_ofac,
    "onu": ingest_onu,
    "trabalho_escravo": ingest_trabalho_escravo,
    "leniencia": ingest_leniencia,
}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(INGESTS)
    pg = db()
    try:
        for name in wanted:
            if name not in INGESTS:
                sys.exit(f"lista desconhecida: {name}")
            INGESTS[name](pg)
    finally:
        pg.close()
    print("ingestão concluída.")
