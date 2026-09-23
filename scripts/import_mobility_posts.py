#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa postos de mobilidade (SPEC_MOBILIDADE.md §8) das planilhas:
  ~/Downloads/Relatório Vigilância Patrimonial.xlsx
  ~/Downloads/Relatório Limpeza Predial e Veicular.xlsx

Só linhas do contratante informado em --contratante (aceita grafia com/sem
acento). Vigilância tem Armado/Qtde Posto/Qtde Pessoas; Limpeza não tem
(cada linha = 1 posto, armado=false). Função → categoria do cliente
(mapa DECIDIDO 23/09: SUPERVISOR vigilância → PORTARIA; FRENTISTA/MANOBRISTA
→ LAVAGEM DE VEÍCULOS). Linhas rejeitadas saem em relatório — nada silencioso.

Idempotente: upsert pelo índice único uq_mobility_posts_slot; source='import'.

Uso: PYTHONPATH=<pylibs> arch -x86_64 python3 scripts/import_mobility_posts.py \
       --contratante "VIX LOGISTICA" [--apply]
"""
import os, re, sys, unicodedata
import pg8000.native
import openpyxl

APPLY = '--apply' in sys.argv
CONTRATANTE = sys.argv[sys.argv.index('--contratante') + 1] if '--contratante' in sys.argv else None
if not CONTRATANTE:
    sys.exit('uso: --contratante "NOME DO CONTRATANTE" [--apply]')

CLIENT_CNPJ = '32681371000172'   # cliente dono dos postos na plataforma

VIGILANCIA = os.path.expanduser('~/Downloads/Relatório Vigilância Patrimonial.xlsx')
LIMPEZA    = os.path.expanduser('~/Downloads/Relatório Limpeza Predial e Veicular.xlsx')

# Função (normalizada, por prefixo) → categoria (decidido 23/09)
CAT_VIGILANCIA_ARMADA = 500027
CAT_PORTARIA          = 500029
CAT_LIMPEZA           = 500030
CAT_LAVAGEM           = 500031

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').upper())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()

def map_funcao_vigilancia(funcao):
    f = norm(funcao)
    if f.startswith('VIGILANTE'): return CAT_VIGILANCIA_ARMADA
    if f.startswith('PORTEIRO') or f.startswith('SUPERVISOR'): return CAT_PORTARIA
    return None

def map_funcao_limpeza(funcao):
    f = norm(funcao)
    if 'MANOBRISTA' in f: return CAT_LAVAGEM   # FRENTISTA/MANOBRISTA, LAVADOR MANOBRISTA
    if f.startswith(('ASG', 'LAVADOR', 'OPERADOR DE ETA', 'SUPERVISOR')): return CAT_LIMPEZA
    return None

def valid_cnpj(d):
    if len(d) != 14 or d == d[0] * 14: return False
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
alvo = norm(CONTRATANTE)

for path, kind in [(VIGILANCIA, 'vigilancia'), (LIMPEZA, 'limpeza')]:
    for i, row in enumerate(read_sheet(path), start=1):
        contr = norm(row.get('EMPRESA CONTRATANTE'))
        if alvo not in contr:
            continue
        cnpj = re.sub(r'\D', '', str(row.get('CNPJ') or '')).zfill(14)
        funcao = str(row.get('FUNCAO') or '').strip()
        cidade = str(row.get('LOCALIDADE') or '').strip()
        uf = norm(row.get('ESTADO'))[:2]
        if not valid_cnpj(cnpj):
            rejects.append((kind, i, f'CNPJ inválido: {cnpj}', row.get('FORNECEDOR') or row.get('FORNECEDOR ATUAL')))
            continue
        if not cidade or len(uf) != 2:
            rejects.append((kind, i, f'localidade incompleta: {cidade}/{uf}', funcao)); continue
        if kind == 'vigilancia':
            cat = map_funcao_vigilancia(funcao)
            armado = norm(row.get('ARMADO')) == 'SIM'
            qty_posts = int(row.get('QTDE POSTO') or 1)
            qty_people = int(row.get('QTDE PESSOAS') or 0)
        else:
            cat = map_funcao_limpeza(funcao)
            armado = False
            qty_posts = 1
            qty_people = int(row.get('QTDE PESSOAS') or 0)
        if not cat:
            rejects.append((kind, i, f'função sem mapa: "{funcao}"', cnpj)); continue
        if qty_people <= 0:
            rejects.append((kind, i, 'qtde pessoas ausente', funcao)); continue
        posts.append(dict(cnpj=cnpj, cat=cat, cidade=cidade.title(), uf=uf,
                          armado=armado, qp=qty_posts, qpe=qty_people, label=funcao))

# linhas idênticas (mesmo slot) somam pessoas/postos
merged = {}
for p in posts:
    k = (p['cnpj'], p['cat'], norm(p['cidade']), p['uf'], norm(p['label']))
    if k in merged:
        merged[k]['qp'] += p['qp']; merged[k]['qpe'] += p['qpe']
    else:
        merged[k] = dict(p)
posts = list(merged.values())

print(f"contratante alvo: {CONTRATANTE} · {len(posts)} postos ({sum(p['qpe'] for p in posts)} pessoas) · {len(rejects)} rejeitados · modo {'APPLY' if APPLY else 'DRY-RUN'}\n")
for p in sorted(posts, key=lambda x: (x['cnpj'], x['cidade'])):
    print(f"  {p['cnpj']} · cat {p['cat']} · {p['cidade']}/{p['uf']} · {'ARMADO' if p['armado'] else 'sem arma'} · {p['qp']} posto(s)/{p['qpe']} pessoa(s) · {p['label']}")
if rejects:
    print('\nREJEITADOS (corrigir na planilha ou cadastrar manualmente):')
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
for p in posts:
    sup = pg.run('select id from suppliers where cnpj=:c', c=p['cnpj'])
    r = pg.run("""
        insert into mobility_posts (client_id, category_id, supplier_cnpj, supplier_id,
                                    site_city, site_uf, armado, qty_posts, qty_people,
                                    funcao_label, source)
        values (:cl, :cat, :cnpj, :sup, :cid, :uf, :arm, :qp, :qpe, :lb, 'import')
        on conflict (client_id, supplier_cnpj, category_id, site_city, site_uf, coalesce(funcao_label,''))
        do update set armado = excluded.armado, qty_posts = excluded.qty_posts,
                      qty_people = excluded.qty_people, active = true
        returning (xmax = 0) as inserted
    """, cl=client_id, cat=p['cat'], cnpj=p['cnpj'], sup=sup[0][0] if sup else None,
         cid=p['cidade'], uf=p['uf'], arm=p['armado'], qp=p['qp'], qpe=p['qpe'], lb=p['label'])
    if r[0][0]: ins += 1
    else: upd += 1

print(f"\nGRAVADO: {ins} inseridos · {upd} atualizados")
