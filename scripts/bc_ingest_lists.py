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
# gov.br devolve 403 para UA de robô/HEAD — usar UA de navegador (GET)
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"}


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
        if len(vals) < len(header):        # linhas de rodapé/observação
            vals += [""] * (len(header) - len(vals))
        try:
            i_doc = next(i for i, h in enumerate(header) if "cnpj" in h or "cpf" in h)
            i_nome = next(i for i, h in enumerate(header) if "empregador" in h or "nome" in h)
        except StopIteration:
            continue
        doc = re.sub(r"\D", "", vals[i_doc] or "")
        nome = re.sub(r"^[\d./\- ]+", "", vals[i_nome] or "").strip()
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
    url, val = cfg_url(pg, "ingest:leniencia")
    tmpl = (val or {}).get("url_template")
    raw = None
    if not url and tmpl:
        # snapshot datado do Portal (redireciona p/ zip da CGU); tenta D-0..D-7
        for back in range(0, 8):
            d = (datetime.date.today() - datetime.timedelta(days=back)).strftime("%Y%m%d")
            try:
                url = tmpl.format(date=d)
                raw = fetch_bytes(url)
                break
            except Exception:
                url = None
    if not url:
        print("leniencia: sem URL/url_template válido em bc_config 'ingest:leniencia' — PULADO")
        return
    print("Leniência (CGU): baixando…")
    if raw is None:
        raw = fetch_bytes(url)
    if raw[:4] == b"PK\x03\x04":  # zip pelo magic byte (a URL datada nao tem extensao)
        import zipfile
        zf = zipfile.ZipFile(io.BytesIO(raw))
        nomes_zip = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        alvo = next((n for n in nomes_zip if "acordo" in n.lower() and "efeito" not in n.lower()), nomes_zip[0])
        raw = zf.read(alvo)
    text = raw.decode("latin-1", "replace").replace("\r\n", "\n").replace("\r", "\n")
    rdr = csv.DictReader(io.StringIO(text), delimiter=";")
    rows = []
    for rec in rdr:
        low = {k.lower(): (v or "").strip() for k, v in rec.items() if k}
        doc = re.sub(r"\D", "", next((v for k, v in low.items() if "cnpj" in k), ""))
        nome = (next((v for k, v in low.items() if "raz" in k and "cnpj" not in k), "")
                or next((v for k, v in low.items() if "nome" in k and "cnpj" not in k), ""))
        if not doc and not nome:
            continue
        def dt(frag):
            v = next((v for k, v in low.items() if frag in k), "")
            m2 = re.match(r"(\d{2})/(\d{2})/(\d{4})", v)
            return f"{m2.group(3)}-{m2.group(2)}-{m2.group(1)}" if m2 else None
        rows.append([doc or None, doc[:8] if len(doc) == 14 else None, nome or None, None,
                     next((v for k, v in low.items() if "situa" in k), None),
                     dt("data de in"), dt("data de fim"), json.dumps(low, ensure_ascii=False)])
    cols = ["cnpj_digits", "cnpj_root", "nome", "nome_norm", "situacao", "data_inicio", "data_fim", "meta"]
    replace_rows(pg, "ref_leniencia", cols, norm_placeholder(rows, cols),
                 "leniencia", datetime.date.today().isoformat(), url)


INGESTS = {
    "ofac": ingest_ofac,
    "onu": ingest_onu,
    "trabalho_escravo": ingest_trabalho_escravo,
    "leniencia": ingest_leniencia,
}



def ingest_pep(pg):
    """PEP — Portal da Transparência (snapshot datado; publicação mensal)."""
    url, val = cfg_url(pg, "ingest:pep")
    tmpl = (val or {}).get("url_template")
    raw = None
    if not url and tmpl:
        # snapshot MENSAL (YYYYMM): tenta o mês corrente e volta até 3
        hoje = datetime.date.today()
        for back in range(0, 4):
            m2 = hoje.month - back
            y2, m2 = (hoje.year + (m2 - 1) // 12, (m2 - 1) % 12 + 1)
            try:
                url = tmpl.format(date=f"{y2}{m2:02d}")
                raw = fetch_bytes(url)
                break
            except Exception:
                url = None
    if not url:
        print("pep: sem URL/url_template válido em bc_config 'ingest:pep' — PULADO")
        return
    print("PEP: baixando…")
    if raw is None:
        raw = fetch_bytes(url)
    if raw[:4] == b"PK\x03\x04":
        import zipfile
        zf = zipfile.ZipFile(io.BytesIO(raw))
        nomes_zip = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        raw = zf.read(nomes_zip[0])
    text = raw.decode("latin-1", "replace").replace("\r\n", "\n").replace("\r", "\n")
    rows = []
    for rec in csv.DictReader(io.StringIO(text), delimiter=";"):
        low = {k.lower().strip('"'): (v or "").strip() for k, v in rec.items() if k}
        nome = next((v for k, v in low.items() if "nome_pep" in k or k == "nome"), "")
        if not nome:
            continue
        rows.append([
            next((v for k, v in low.items() if "cpf" in k), None) or None,
            nome, None,
            next((v for k, v in low.items() if "sigla" in k and "fun" in k), None),
            next((v for k, v in low.items() if "descri" in k and "fun" in k), None),
            next((v for k, v in low.items() if "rg" in k and "o" in k and "nome" in k), None)
            or next((v for k, v in low.items() if "orgao" in k or "órgão" in k), None),
            next((v for k, v in low.items() if k in ("uf", "sg_uf")), None),
            None,
        ])
    cols = ["cpf_masked", "nome", "nome_norm", "sigla_funcao", "descricao_funcao", "orgao", "uf", "meta"]
    replace_rows(pg, "ref_pep", cols, norm_placeholder(rows, cols),
                 "pep", datetime.date.today().isoformat(), url)


def ingest_tse(pg):
    """TSE consulta_cand — aceita VÁRIOS zips ('urls' em bc_config 'ingest:tse',
    ex.: 2022 + 2024) somados numa única carga."""
    url, val = cfg_url(pg, "ingest:tse")
    urls = (val or {}).get("urls") or ([url] if url else [])
    if not urls:
        print("tse: sem URL(s) em bc_config 'ingest:tse' — PULADO (opt-in)")
        return
    import zipfile
    rows = []
    for u in urls:
        print(f"TSE: baixando {u.rsplit('/', 1)[-1]}…")
        zf = zipfile.ZipFile(io.BytesIO(fetch_bytes(u)))
        # o zip traz o consolidado *_BRASIL.csv E um CSV por UF (união =
        # tudo em dobro — carga de 23/09 saiu 2x); com o consolidado
        # presente, lê SÓ ele
        csvs = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        brasil = [n for n in csvs if n.lower().endswith("_brasil.csv")]
        for name in (brasil or csvs):
            text = zf.read(name).decode("latin-1", "replace")
            for rec in csv.DictReader(io.StringIO(text), delimiter=";"):
                low = {k.lower(): (v or "").strip('" ') for k, v in rec.items() if k}
                nome = low.get("nm_candidato", "")
                if not nome:
                    continue
                rows.append([re.sub(r"\D", "", low.get("nr_cpf_candidato", "")) or None,
                             nome, None, low.get("ano_eleicao"), low.get("ds_cargo"),
                             low.get("sg_partido"), low.get("sg_uf"),
                             low.get("ds_sit_tot_turno") or low.get("ds_situacao_candidatura"), None])
        print(f"  acumulado: {len(rows)} candidaturas")
    cols = ["cpf_digits", "nome", "nome_norm", "ano", "cargo", "partido", "uf", "situacao", "meta"]
    replace_rows(pg, "ref_tse", cols, norm_placeholder(rows, cols),
                 "tse", datetime.date.today().isoformat(), "; ".join(urls))


def ingest_icij(pg):
    """ICIJ Offshore Leaks nodes (opt-in: URL do zip em bc_config 'ingest:icij')."""
    url, _ = cfg_url(pg, "ingest:icij")
    if not url:
        print("icij: sem URL em bc_config 'ingest:icij' — PULADO (opt-in)")
        return
    print("ICIJ: baixando…")
    raw = fetch_bytes(url)
    import zipfile
    zf = zipfile.ZipFile(io.BytesIO(raw))
    rows = []
    for name in zf.namelist():
        base = name.lower()
        tipo = "entity" if "entities" in base else "officer" if "officers" in base else None
        if not tipo or not base.endswith(".csv"):
            continue
        text = zf.read(name).decode("utf-8", "replace")
        for rec in csv.DictReader(io.StringIO(text)):
            low = {k.lower(): (v or "").strip() for k, v in rec.items() if k}
            nome = low.get("name", "")
            if not nome:
                continue
            rows.append([low.get("node_id") or low.get("_id"), nome, None, tipo,
                         low.get("sourceid") or low.get("source_id"),
                         low.get("countries") or low.get("country_codes"), None])
    cols = ["uid", "nome", "nome_norm", "tipo", "fonte", "pais", "meta"]
    replace_rows(pg, "ref_icij", cols, norm_placeholder(rows, cols),
                 "icij", datetime.date.today().isoformat(), url)


INGESTS.update({"pep": ingest_pep, "tse": ingest_tse, "icij": ingest_icij})

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
