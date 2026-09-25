#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa postos de mobilidade (SPEC_MOBILIDADE.md §8) das planilhas de postos:
  ~/Downloads/Relatório Vigilância Patrimonial_v2.xlsx
  ~/Downloads/Relatório Limpeza Predial e Veicular_v2.xlsx

v2 (25/09, respostas do cliente): as planilhas não têm mais a coluna
'Empresa Contratante' — TODAS as linhas são do cliente âncora. Correções que
o cliente confirmou: CNPJ da unidade de Parauapebas (quarteirizada), HIGITRONS
× RRC separados, Guaíba/RS mantém o CNPJ da unidade de SP, e vigilância de
Macaé/RJ é DESARMADA (Registro da Arma não é exigido nesses postos).

Função → categoria (decidido com o cliente):
  · vigilância: fornecedor marcado "(quarteirizada)" → VIG. PATRIMONIAL ARMADA
    QUARTEIRIZADA · VIGILANTE/VIGLANTE (armado ou não) e CONTROLADOR DE ACESSO
    armado → VIG. PATRIMONIAL ARMADA · PORTEIRO, SUPERVISOR e controlador
    desarmado → PORTARIA
  · limpeza: MANOBRISTA/FRENTISTA → LAVAGEM DE VEÍCULOS · ASG, LAVADOR, AUX.
    DE LIMPEZA, OPERADOR DE ETA, SUPERVISOR → LIMPEZA PREDIAL E DE ÔNIBUS
O flag 'armado' da planilha decide a exigência do Registro da Arma, não a
categoria. Linhas sem CNPJ válido ou função sem mapa saem em relatório.

Reconciliação: postos já importados que não estão mais na planilha são
INATIVADOS (nunca apagados); os que têm pessoas/documentos anexados são
preservados e listados para conferência manual.

Uso: PYTHONPATH=<pylibs> arch -x86_64 python3 scripts/import_mobility_posts.py [--apply]
"""
import os, re, sys, unicodedata
import pg8000.native
import openpyxl

APPLY = '--apply' in sys.argv

CLIENT_CNPJ = '32681371000172'   # cliente dono dos postos na plataforma

VIGILANCIA = os.path.expanduser('~/Downloads/Relatório Vigilância Patrimonial_v2.xlsx')
LIMPEZA    = os.path.expanduser('~/Downloads/Relatório Limpeza Predial e Veicular_v2.xlsx')

CAT_VIG_ARMADA        = 500027
CAT_VIG_QUARTEIRIZADA = 500028
CAT_PORTARIA          = 500029
CAT_LIMPEZA           = 500030
CAT_LAVAGEM           = 500031

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').upper())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()

def is_quarteirizada(fornecedor):
    f = norm(fornecedor)
    return 'QUARTEIRIZ' in f or 'QUARTERIZ' in f

def map_funcao_vigilancia(funcao, fornecedor, armado):
    f = norm(funcao)
    if is_quarteirizada(fornecedor):
        return CAT_VIG_QUARTEIRIZADA
    if f.startswith(('VIGILANTE', 'VIGLANTE')):          # inclui typo da planilha
        return CAT_VIG_ARMADA                            # armado=Não → sem Registro da Arma
    if f.startswith('CONTROLADOR DE ACESSO'):
        return CAT_VIG_ARMADA if armado else CAT_PORTARIA
    if f.startswith(('PORTEIRO', 'SUPERVISOR')):
        return CAT_PORTARIA
    return None

def map_funcao_limpeza(funcao):
    f = norm(funcao)
    if 'MANOBRISTA' in f or f.startswith('FRENTISTA'):
        return CAT_LAVAGEM
    if f.startswith(('ASG', 'LAVADOR', 'AUX. DE LIMPEZA', 'AUX DE LIMPEZA',
                     'AUXILIAR DE LIMPEZA', 'OPERADOR DE ETA', 'SUPERVISOR')):
        return CAT_LIMPEZA
    return None

def clean_city(v, uf):
    c = str(v or '').strip()
    c = re.sub(r'\s*-\s*' + re.escape(uf) + r'$', '', c, flags=re.I)  # "IGARAPÉ - MG"
    return c.title()

def valid_cnpj(d):
    if len(d) != 14 or d == d[0] * 14:
        return False
    def dv(n):
        w = [5,4,3,2,9,8,7,6,5,4,3,2] if n == 12 else [6,5,4,3,2,9,8,7,6,5,4,3,2]
        r = sum(p * int(d[i]) for i, p in enumerate(w)) % 11
        return 0 if r < 2 else 11 - r
    return dv(12) == int(d[12]) and dv(13) == int(d[13])

def read_sheet(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr_i = next(i for i, r in enumerate(rows) if r and 'CNPJ' in [norm(c) for c in r if c])
    hdr = [norm(c) for c in rows[hdr_i]]
    return [dict(zip(hdr, r)) for r in rows[hdr_i + 1:] if r and any(r)]

posts, rejects = [], []

for path, kind in [(VIGILANCIA, 'vigilancia'), (LIMPEZA, 'limpeza')]:
    if not os.path.exists(path):
        sys.exit(f'planilha não encontrada: {path}')
    for i, row in enumerate(read_sheet(path), start=1):
        forn = str(row.get('FORNECEDOR') or row.get('FORNECEDOR ATUAL') or '').strip()
        cnpj = re.sub(r'\D', '', str(row.get('CNPJ') or '')).zfill(14)
        funcao = str(row.get('FUNCAO') or '').strip()
        uf = norm(row.get('ESTADO') or row.get('ESTADO '))[:2]
        cidade = clean_city(row.get('LOCALIDADE'), uf)
        if not valid_cnpj(cnpj):
            rejects.append((kind, i, f'CNPJ inválido: {cnpj}', f'{forn} · {cidade}/{uf} · {funcao}'))
            continue
        if not cidade or len(uf) != 2:
            rejects.append((kind, i, f'localidade incompleta: {cidade}/{uf}', f'{forn} · {funcao}'))
            continue
        if kind == 'vigilancia':
            armado = norm(row.get('ARMADO')) == 'SIM'
            cat = map_funcao_vigilancia(funcao, forn, armado)
            qty_posts = int(row.get('QTDE POSTO') or 1)
        else:
            armado = False
            cat = map_funcao_limpeza(funcao)
            qty_posts = 1
        qty_people = int(row.get('QTDE PESSOAS') or 0)
        if not cat:
            rejects.append((kind, i, f'função sem mapa: "{funcao}"', f'{forn} {cnpj}'))
            continue
        if qty_people <= 0:
            rejects.append((kind, i, 'qtde pessoas ausente', f'{forn} · {funcao}'))
            continue
        posts.append(dict(cnpj=cnpj, cat=cat, cidade=cidade, uf=uf, armado=armado,
                          qp=qty_posts, qpe=qty_people, label=funcao, forn=forn))

# linhas do mesmo slot (CNPJ+categoria+cidade+UF+função) somam postos e pessoas
merged = {}
for p in posts:
    k = (p['cnpj'], p['cat'], norm(p['cidade']), p['uf'], norm(p['label']))
    if k in merged:
        merged[k]['qp'] += p['qp']; merged[k]['qpe'] += p['qpe']
    else:
        merged[k] = dict(p)
posts = list(merged.values())

CAT_NOME = {CAT_VIG_ARMADA:'VIG.ARMADA', CAT_VIG_QUARTEIRIZADA:'VIG.QUARTEIRIZADA',
            CAT_PORTARIA:'PORTARIA', CAT_LIMPEZA:'LIMPEZA', CAT_LAVAGEM:'LAVAGEM'}
print(f"{len(posts)} postos · {sum(p['qp'] for p in posts)} vagas de posto · "
      f"{sum(p['qpe'] for p in posts)} pessoas · {len(rejects)} rejeitados · "
      f"modo {'APPLY' if APPLY else 'DRY-RUN'}\n")
for p in sorted(posts, key=lambda x: (x['cnpj'], x['cidade'], x['label'])):
    print(f"  {p['cnpj']} · {CAT_NOME[p['cat']]:18s} · {p['cidade']}/{p['uf']:2s} · "
          f"{'ARMADO' if p['armado'] else '  --  '} · {p['qp']}p/{p['qpe']}pe · {p['label']}")
if rejects:
    print('\nREJEITADOS (reportar ao cliente):')
    for r in rejects:
        print(f"  [{r[0]} linha {r[1]}] {r[2]} — {r[3]}")

if not APPLY:
    print('\nDry-run — rode com --apply para gravar.')
    sys.exit(0)

url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)
client_id = pg.run('select id from clients where cnpj=:c', c=CLIENT_CNPJ)[0][0]

ins = upd = 0
vistos = set()
for p in posts:
    sup = pg.run('select id from suppliers where cnpj=:c', c=p['cnpj'])
    r = pg.run("""
        insert into mobility_posts (client_id, category_id, supplier_cnpj, supplier_id,
                                    site_city, site_uf, armado, qty_posts, qty_people,
                                    funcao_label, source)
        values (:cl, :cat, :cnpj, :sup, :cid, :uf, :arm, :qp, :qpe, :lb, 'import')
        on conflict (client_id, supplier_cnpj, category_id, site_city, site_uf, coalesce(funcao_label,''))
        do update set armado = excluded.armado, qty_posts = excluded.qty_posts,
                      qty_people = excluded.qty_people, category_id = excluded.category_id,
                      supplier_id = coalesce(excluded.supplier_id, mobility_posts.supplier_id),
                      active = true
        returning id, (xmax = 0) as inserted
    """, cl=client_id, cat=p['cat'], cnpj=p['cnpj'], sup=sup[0][0] if sup else None,
         cid=p['cidade'], uf=p['uf'], arm=p['armado'], qp=p['qp'], qpe=p['qpe'], lb=p['label'])
    vistos.add(r[0][0])
    if r[0][1]: ins += 1
    else: upd += 1

# reconciliação: importados que saíram da planilha
orfaos = pg.run("""
    select p.id, p.supplier_cnpj, p.site_city, p.site_uf, coalesce(p.funcao_label,''),
           (select count(*) from mobility_people mp where mp.post_id = p.id),
           (select count(*) from documents d where d.mobility_post_id = p.id)
    from mobility_posts p
    where p.client_id = :cl and p.source = 'import' and p.active
      and not (p.id = any(:vis))
""", cl=client_id, vis=list(vistos))
inativados, preservados = 0, []
for oid, ocnpj, ocity, ouf, olabel, npeople, ndocs in orfaos:
    if npeople or ndocs:
        preservados.append((ocnpj, f'{ocity}/{ouf}', olabel, npeople, ndocs))
        continue
    pg.run('update mobility_posts set active = false where id = :i', i=oid)
    inativados += 1

print(f"\nGRAVADO: {ins} inseridos · {upd} atualizados · {inativados} inativados (fora da planilha)")
if preservados:
    print('PRESERVADOS (fora da planilha, mas com dados do fornecedor — conferir manualmente):')
    for x in preservados:
        print(f"  {x[0]} · {x[1]} · {x[2]} · {x[3]} pessoa(s), {x[4]} doc(s)")
