#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed VIX (18/09): DDQ de compliance parametrizado + documentos de aceite.

1) Questionário "Questionário de Compliance (DDQ)" no cliente VIX, com as
   perguntas da planilha e compliance_alert por pergunta (amarelo na planilha:
   a resposta na coluna D é a que dispara a revisão de compliance).
2) Dois documentos de aceite (patch_073) no bucket client-terms:
   Código de Conduta VIXPar e Política Anticorrupção e Antissuborno.

Idempotente: questionário localizado por título (perguntas regravadas);
itens de aceite por título. Uso: ... seed_vix_compliance_terms.py --json <raw> [--apply]
"""
import re, sys, json, os
import pg8000.native

APPLY = '--apply' in sys.argv
RAW = json.load(open(sys.argv[sys.argv.index('--json') + 1]))
VIX_CNPJ = '32681371000172'
HOME = os.path.expanduser('~')

t = lambda r: RAW[str(r)]['c3']   # texto integral da pergunta na linha r

# (linha, tipo, flag, options|None) — mapeado 1:1 da planilha em 18/09
OPT_INTERACAO = ['Não possui', 'Participa de licitações',
                 'Pleiteia obtenção de licenças, autorizações ou permissões',
                 'Possui contato com agentes públicos em fiscalizações',
                 'Há no quadro de empregados agentes ou ex-agentes públicos', 'Outros']
OPT_PPE = ['Não se aplica', 'Empregados', 'Conselheiros', 'Proprietários',
           'Diretoria executiva', 'Acionistas', 'Outros']
QUESTIONS = [
    (13, 'boolean', ['SIM'], None),
    (14, 'text',    None,    None),
    (15, 'select',  None,    OPT_INTERACAO),
    (21, 'boolean', ['SIM'], None),
    (22, 'boolean', ['SIM'], None),
    (23, 'select',  None,    OPT_PPE),
    (30, 'boolean', ['NÃO'], None),
    (31, 'text',    None,    None),
    (32, 'boolean', ['NÃO'], None),
    (33, 'text',    None,    None),
    (34, 'boolean', ['NÃO'], None),
    (35, 'boolean', ['NÃO'], None),
    (36, 'text',    None,    None),
    (37, 'boolean', ['NÃO'], None),
    (38, 'boolean', ['NÃO'], None),
    (39, 'text',    None,    None),
    (40, 'boolean', ['NÃO'], None),
    (41, 'text',    None,    None),
    (42, 'boolean', ['NÃO'], None),
    (43, 'boolean', ['NÃO'], None),
    (44, 'text',    None,    None),
    (45, 'text',    None,    None),
    (46, 'text',    None,    None),
    (47, 'boolean', ['NÃO'], None),
    (48, 'boolean', ['SIM'], None),
    (49, 'text',    None,    None),
    (50, 'boolean', None,    None),
    (51, 'boolean', ['SIM'], None),
    (52, 'boolean', ['SIM'], None),
    (53, 'boolean', ['SIM'], None),
    (54, 'boolean', ['SIM'], None),
    (55, 'boolean', None,    None),
    (56, 'text',    None,    None),
    (57, 'boolean', None,    None),
    (58, 'boolean', None,    None),
]
TITLE = 'Questionário de Compliance (DDQ)'
DESC = ('Due Diligence de Compliance VIXPar — respostas sinalizadas são revisadas '
        'pela área de Compliance (não travam a homologação).')
PDFS = [
    ('Código de Conduta VIXPar', f'{HOME}/Downloads/Cod-de-conduta-VIXPAR.pdf', 'Cod-de-conduta-VIXPAR.pdf'),
    ('Política Anticorrupção e Antissuborno', f'{HOME}/Downloads/Política Anticorrupção e Antissuborno.pdf',
     'Politica-Anticorrupcao-e-Antissuborno.pdf'),
]

url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)
cid = str(pg.run("select id from clients where cnpj=:c", c=VIX_CNPJ)[0][0])
print(f"VIX {cid} · {len(QUESTIONS)} perguntas · modo {'APPLY' if APPLY else 'DRY'}")

for r, tp, flag, opts in QUESTIONS:
    txt = t(r)
    assert txt, f"linha {r} sem texto"
    print(f"  L{r} [{tp}]{' ⚠'+str(flag) if flag else ''} {txt[:70]}")

if APPLY:
    q = pg.run("select id from questionnaires where client_id=:c and title=:t", c=cid, t=TITLE)
    if q:
        qid = str(q[0][0])
        # sem respostas ainda → regravar perguntas é seguro; com respostas, aborta
        n = pg.run("""select count(*) from questionnaire_answers qa
                      join questionnaire_questions qq on qq.id=qa.question_id
                      where qq.questionnaire_id=:q""", q=qid)[0][0]
        if n:
            print(f"questionário já tem {n} respostas — perguntas NÃO regravadas"); sys.exit(0)
        pg.run("delete from questionnaire_questions where questionnaire_id=:q", q=qid)
    else:
        qid = str(pg.run("""insert into questionnaires (client_id, title, description, active)
                            values (:c,:t,:d,true) returning id""", c=cid, t=TITLE, d=DESC)[0][0])
    for i, (r, tp, flag, opts) in enumerate(QUESTIONS):
        pg.run("""insert into questionnaire_questions
                    (questionnaire_id, text, type, options, required, order_index, compliance_alert)
                  values (:q,:x,:tp, cast(:op as jsonb), :req, :i, cast(:fl as text[]))""",
               q=qid, x=t(r), tp=tp, op=json.dumps(opts) if opts else None,
               req=(tp != 'text'), i=i,
               fl='{' + ','.join(f'"{v}"' for v in flag) + '}' if flag else None)
    print(f"questionário {qid}: {len(QUESTIONS)} perguntas gravadas")

    # documentos de aceite → bucket + itens (via REST storage não; usa supabase-py? não —
    # upload direto via API storage REST com service key)
    import urllib.request
    env = {}
    for l in open('.env'):
        l = l.strip()
        if l and '=' in l and not l.startswith('#'):
            k, v = l.split('=', 1); env[k] = v.strip().strip('"')
    SB, KEY = env['SUPABASE_URL'].rstrip('/'), env['SUPABASE_SERVICE_ROLE_KEY']
    for title, path, fname in PDFS:
        if pg.run("select 1 from client_terms_items where client_id=:c and title=:t", c=cid, t=title):
            print(f"  item já existe: {title}"); continue
        data = open(path, 'rb').read()
        spath = f"{cid}/{fname}"
        req = urllib.request.Request(f"{SB}/storage/v1/object/client-terms/{spath}", data=data,
                                     headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                                              "Content-Type": "application/pdf", "x-upsert": "true"},
                                     method="POST")
        urllib.request.urlopen(req)
        pg.run("""insert into client_terms_items (client_id, title, kind, storage_path, file_name, required, active)
                  values (:c,:t,'DOCUMENT',:p,:f,true,true)""", c=cid, t=title, p=spath, f=fname)
        print(f"  item criado: {title} ({len(data)//1024} KB)")
    pg.run("""insert into audit_log (action, entity_type, entity_id, metadata)
              values ('VIX_COMPLIANCE_TERMS_SEED','client',:c::uuid,
                      jsonb_build_object('perguntas', :n::int, 'docs_aceite', 2))""", c=cid, n=len(QUESTIONS))
    print("audit gravado.")
