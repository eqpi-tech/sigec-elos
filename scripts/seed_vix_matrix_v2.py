#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed v2 da matriz VIX (VixPar) — fonte: ~/Downloads/EQP- Categorias VIX final.xlsx
(3 abas: Suprimentos 3 níveis · Medicina 2 níveis · Qualidade 1 nível = 6 fluxos).

Substitui a estrutura do seed v1 (só Suprimentos, fluxos 'Nível 1/2/3'):
  · renomeia os 3 fluxos existentes p/ 'Suprimentos – Nível N' (ids/preços preservados)
  · cria 'Medicina – Nível 1/2' e 'Qualidade' (preços NULL até definição comercial)
  · cria as 5 categorias novas (500032+) e os docs novos do catálogo (10025+)
  · REGRAVA a matriz categoria×documento das 27 categorias conforme a planilha
    (required=TRUE, blocking=TRUE — docs VIX são todos desclassificatórios)

Segurança (mesmas regras do v1):
  · categorias VIX em 500000+ (sync diário só toca >= 1M) · docs novos >= 10000
  · idempotente · nada do HOC é alterado

Uso: PYTHONPATH=<pylibs> arch -x86_64 python3 scripts/seed_vix_matrix_v2.py [--apply]
     (o JSON da planilha vem de vix_matriz.json gerado pelo parser node — ver --json)
"""
import re, sys, json, unicodedata
import pg8000.native

APPLY = '--apply' in sys.argv
JSON_PATH = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else 'vix_matriz.json'
VIX_CNPJ = '32681371000172'

def norm(s):
    s = unicodedata.normalize('NFD', str(s).lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

# ── Cabeçalho da planilha → id do catálogo (validado manualmente 16/09) ────
MAP = {
  'Cartão CNPJ': 37, 'Sintegra': 10001, 'Análise de Cnaes': 61,
  'Certidão de Regularidade do FGTS': 7,
  'CND Tributos Municipais ou Mobiliários': 6,
  'CNDT Certidão Negativa de Débitos Trabalhistas': 8,
  'Certidão de Ação Trabalhista em Tramitação – TRT': 10022,
  'Certidão de Débitos Trabalhistas da Secretaria de Trabalho (Ministério do Trabalho e Previdência)': 10023,
  '"Lista suja" - trabalho escravo': 10002,
  'Comprovante de Conta Bancária (cópia de cartão ou folha do cheque ou extratos e atestado/declaração do banco)': 148,
  'CND Tributos Estaduais': 16,
  'CND Tributos Federal e à Dívida Ativa da União': 42,
  'Cadastro Ceis': 12, 'Inscrição Estadual': 15, 'Inscrição Municipal': 38,
  'Contrato Social': 39,
  'Certidão Negativa de Falência (concordata, recuperação judicial ou extra judicial)': 150,
  'Autorização Agência Nacional de Petróleo - Registro ANP': 26,
  'Alvará de Funcionamento': 40,
  'Certificado de Regularidade - IBAMA (CTF)': 18,
  'Licença de Operação': 19,
  'Certificado da Polícia Federal': 71,
  'AVCB (Auto de Vistoria do Corpo de Bombeiros) ou CLCB Certificado de Licença do Corpo de Bombeiros': 29,
  'Balanço + DRE (com assinatura do contador)': 79,
  'Relatório Assertiva': 578,
  'Cadastro no Sistema MTR do órgão correspondente (SINIR, FEAM, INEA, SIGOR, etc)': 10004,
  'Certificado ou Declaração de destinação final do resíduo': 10005,
  'Certificado de calibração do Instrumento utilizado para medição': 10006,
  'Anotação de Responsabildiade Técnica (ART) ou Anotação de Função Técnica (AFT)': 67,
  'Laudo de Estanqueidade': 10024,
  'Certificado de Conformidade Inmetro para Pneus Novos Rodoviários': 10007,
  'Comprovação de experiência para desempenho da atividade contratada': 10008,
  'Alvará Sanitário Municipal': 10009,
  'Alvará Sanitário Municipal ou documento equivalente': 10009,
  'Registro no Conselho de Classe do Responsável Técnico': 65,
  'Registro no Conselho de Classe do Responsavel Técnico': 65,
  'Registro da empresa no Conselho de Classe e constatação do profissional no Quadro Técnico, quando tratar-se de contratação de PJ': 10010,
  'Ficha com Dados de Segurança (FDS/FISPQ)': 239,
  'Comprovante detalhado da execução dos serviços (ordem de serviço)': 10011,
  'PMOC - Plano de Manutenção, Operação e Controle do Arcondicionado assinado pelo responsável técnico': 157,
  'CNH (manobristas)': 10012,
  'Hitórico de Manutenção ou Último Registro de Manutenção': 10013,
  'Certificado de Calibração dos Instrumentos': 10014,
  'Laudo Técnico da GETEC (Formulário interno VixPar) (pode ser inserido pela VIX)': 10015,
  'ASO - Atestado de Saúde Ocupacional': 10016,
  'Registro da Arma junto a Polícia Federal': 10017,
  'Autorização de funcionamento concedida pelo Departamento de Polícia Federal ou pela Secretaria de Segurança Pública de Estado': 166,
  'Carteira Nacional de Vigilante (CNV)': 10018,
  'Curso de formação técnica ou Comprovação de experiência para desempenho da atividade': 10019,
  # 545/546 (e não 191/252): são os usados pelo seed v1 e carregam as
  # regras de validação da VIX gravadas no catálogo
  'PCMSO': 545, 'PGR': 546,
  'Questionário de Compliance': 10020, 'Termo de Conduta': 10021,
}
# Docs NOVOS (Medicina/Qualidade) — (id, nome curto, dado_pessoal, validation_rule|None)
ACRED_FULL = ('ACREDITAÇÃO CAP-FDT (Acreditação forense para exames toxicológicos de larga janela de '
  'detecção do Colégio Americano de Patologia) OU ACREDITAÇÃO INMETRO conforme ABNT NBR ISO/IEC 17025, '
  'com requisitos que incluam integralmente as "Diretrizes sobre o Exame de Drogas em Cabelos e Pelos: '
  'Coleta e Análise" da Sociedade Brasileira de Toxicologia, além de requisitos adicionais de toxicologia '
  'forense reconhecidos internacionalmente.')
RBC_FULL = ('Estar ligado à RBC OU possuir padrões rastreáveis a Organismos Nacionais e/ou Internacionais '
  '(INMETRO), com a Acreditação do fornecedor que realiza a calibração dos padrões.')
NEW_DOCS = [
  (10025, 'Acreditação CAP-FDT ou Acreditação INMETRO (ISO/IEC 17025 — toxicologia forense)', False, ACRED_FULL),
  (10026, 'Vínculo à RBC ou padrões rastreáveis (INMETRO) com acreditação da calibração', False, RBC_FULL),
  (10027, 'Certificado de Calibração com cálculo de incerteza da medição', False, None),
  (10028, 'Rastreabilidade do certificado de calibração do esfigmomanômetro', False, None),
  (10029, 'Certificado de regularidade de Inscrição de Pessoa Jurídica', False, None),
  (10030, 'Certificado Esfigmomanômetro', False, None),
  (10031, 'Rastreabilidade Esfigmomanômetro', False, None),
  (10032, 'Certificado da Cabine Audiométrica', False, None),
  (10033, 'Rastreabilidade Cabine Audiométrica', False, None),
  (10034, 'Certificado do Audiômetro', False, None),
  (10035, 'Rastreabilidade do Audiômetro', False, None),
  (10036, 'Declaração Fonoaudiólogo', True, None),
  (10037, 'Contrato social e última alteração contratual', False, None),
  (10038, 'Certidão negativa de dívida ativa federal', False, None),
  (10039, 'Certidão negativa de dívida ativa estadual', False, None),
  (10040, 'Certidão negativa de dívida ativa municipal', False, None),
  (10041, 'Proposta técnica', False, None),
  (10042, 'Carteira do conselho de fonoaudiologia do profissional que realiza as audiometrias', True, None),
  (10043, 'Certificado de responsabilidade técnica do médico responsável pela clínica', True, None),
  (10044, 'Alvará sanitário do laboratório', False, None),
]
NEW_BY_HDR = {
  'ACREDITAÇÃO CAP-FDT - (Acreditação forense para exames toxicológicos de larga janela de detecção do Colégio Americano de Patologia )- OU ACREDITAÇÃO INMETRO DE ACORDO COM A NORMA ABNT NBR ISO/IEC 17025 (com requisitos específicos que incluam integralmente as "Diretrizes sobre o Exame de Drogas em Cabelos e Pelos: Coleta e Análise" da Sociedade Brasileira de Toxicologia, além de requisitos adicionais de toxicologia forense reconhecidos internacionalmente.)': 10025,
  'Estar ligado a RBC OU possuir padrões rastreáveis à Organismos Nacionais e/ou Internacionais (INMETRO) com a Acreditação do fornecedor que realiza calibração dos padrões': 10026,
  'Certificado de Calibração com cálculo de incerteza da medição': 10027,
  'Rastreabilidade do certificado de calibração do esfigmomanometro': 10028,
  'Certificado de regularidade de Inscrição de Pessoa Jurídica': 10029,
  'Certificado Esfigmomanômetro': 10030,
  'Rastreabilidade Esfigmomanômetro': 10031,
  'Certificado da Cabine Audiométrica': 10032,
  'Rastreabilidade Cabine Audiométrica': 10033,
  'Certificado do Audiômetro': 10034,
  'Rastreabilidade do Audiômetro': 10035,
  'Declaração Fonoaudiólogo': 10036,
  'Contrato social e última alteração contratual': 10037,
  'Certidão negativa de dívida ativa federal': 10038,
  'Certidão negativa de dívida ativa estadual': 10039,
  'Certidão negativa de dívida ativa municipal': 10040,
  'Proposta técnica': 10041,
  'Carteira do conselho de fonoaudiologia do proffisional que realizar as audiometrias': 10042,
  'Certificado de responsabilidade técnica do médico responsavel pela clinica': 10043,
  'Alvará sanitário do laboratório': 10044,
}
HDR2ID = {norm(k): v for k, v in {**MAP, **NEW_BY_HDR}.items()}

# ── Fluxos alvo: (aba, nível) → (nome, descrição) ─────────────────────────
FLOW_DEF = {
  ('Suprimentos', 1): ('Suprimentos – Nível 1', 'Suprimentos básico — identidade fiscal e compliance'),
  ('Suprimentos', 2): ('Suprimentos – Nível 2', 'Suprimentos intermediário — documentos técnicos/ambientais e risco financeiro'),
  ('Suprimentos', 3): ('Suprimentos – Nível 3', 'Suprimentos crítico — mão de obra alocada: regularidade fiscal/trabalhista completa'),
  ('Medicina',    1): ('Medicina – Nível 1',    'Medicina ocupacional — calibração e toxicológico'),
  ('Medicina',    2): ('Medicina – Nível 2',    'Medicina ocupacional — clínicas credenciadas e em credenciamento'),
  ('Qualidade',   1): ('Qualidade',             'Qualidade — organismo certificador credenciado'),
}
RENAME = {'Nível 1': 'Suprimentos – Nível 1', 'Nível 2': 'Suprimentos – Nível 2', 'Nível 3': 'Suprimentos – Nível 3'}
# 500032–500034 são da EQPI (fluxos ELOS)! Novas categorias começam em 500050
# (com folga), sempre acima do max atual da faixa 500k
NEW_CAT_BASE = 500050
# typos da planilha → nome como está no banco (evita categoria duplicada)
CAT_ALIAS = {'manutecao de ar condicionado': 'manutencao de ar condicionado'}

# ═══════════════════════════════════════════════════════════════════════════
data = json.load(open(JSON_PATH))
url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)

client_id = pg.run("select id from clients where cnpj=:c", c=VIX_CNPJ)[0][0]
print(f"cliente VIX: {client_id} · modo: {'APPLY' if APPLY else 'DRY-RUN'}\n")

# 0) sanity: todo cabeçalho marcado tem id?
missing = set()
for aba in data.values():
    for c in aba['cats']:
        for h in c['docs']:
            if norm(h) not in HDR2ID: missing.add(h)
if missing:
    print("✗ cabeçalhos sem mapeamento:"); [print("  ", h) for h in missing]; sys.exit(1)

# 1) docs novos no catálogo
for did, nome, pessoal, rule in NEW_DOCS:
    print(f"catálogo +{did}: {nome[:60]}")
    if APPLY:
        pg.run("""insert into documents_catalog (id, name, responsibility, auto_collect, active, dado_pessoal, validation_rule)
                  values (:i, :n, 'fornecedor', false, true, :p, :r)
                  on conflict (id) do update set name=excluded.name, dado_pessoal=excluded.dado_pessoal,
                    validation_rule=coalesce(excluded.validation_rule, documents_catalog.validation_rule)""",
               i=did, n=nome, p=pessoal, r=rule)

# 2) categorias: existentes por nome normalizado; novas a partir de 500032
db_cats = {norm(n): (i, n) for i, n in pg.run(
    "select id, name from categories where client_id=:c and id >= 500010", c=client_id)}
roots = dict(pg.run("select name, id from categories where client_id=:c and id in (500001,500002)", c=client_id))
root_by_grupo = {'SERVIÇOS': roots.get('SERVIÇOS'), 'SERVICOS': roots.get('SERVIÇOS'), 'MATERIAL': roots.get('MATERIAL')}
max_500k = pg.run("select coalesce(max(id), 500000) from categories where id between 500000 and 999999")[0][0]
next_id = max(NEW_CAT_BASE, max_500k + 1)
cat_ids = {}   # (aba, nome planilha) → category id
for aba_nome, aba in data.items():
    for c in aba['cats']:
        key = norm(c['nome'])
        key = CAT_ALIAS.get(key, key)
        if key in db_cats:
            cat_ids[(aba_nome, c['nome'])] = db_cats[key][0]
        else:
            cat_ids[(aba_nome, c['nome'])] = next_id
            parent = root_by_grupo.get(c['grupo'].upper()) or roots.get('SERVIÇOS')
            print(f"categoria +{next_id}: [{aba_nome}] {c['nome']}")
            if APPLY:
                pg.run("""insert into categories (id, name, parent_id, client_id, active)
                          values (:i, :n, :p, :c, true)
                          on conflict (id) do update set name=excluded.name, active=true""",
                       i=next_id, n=c['nome'], p=parent, c=str(client_id))
            next_id += 1

# 3) fluxos: renomeia os 3 e garante os 6
DESC_BY_NAME = {nome: desc for nome, desc in FLOW_DEF.values()}
flows = {n: str(i) for i, n in pg.run("select id, name from client_flows where client_id=:c", c=client_id)}
for old, new in RENAME.items():
    if old in flows and new not in flows:
        print(f"fluxo renomeado: '{old}' → '{new}'")
        if APPLY:
            pg.run("update client_flows set name=:n, description=:d where id=:i::uuid",
                   n=new, d=DESC_BY_NAME[new], i=flows[old])
        flows[new] = flows.pop(old)
for (aba, nivel), (nome, desc) in FLOW_DEF.items():
    if nome not in flows:
        print(f"fluxo +: '{nome}'")
        if APPLY:
            fid = pg.run("""insert into client_flows (client_id, name, description, active)
                            values (:c, :n, :d, true) returning id::text""",
                         c=str(client_id), n=nome, d=desc)[0][0]
            flows[nome] = fid
        else:
            flows[nome] = f'(novo:{nome})'
    elif APPLY:
        pg.run("update client_flows set description=:d, active=true where id=:i::uuid", d=desc, i=flows[nome])

# 4) vínculos fluxo→categoria (regrava por fluxo)
flow_cats = {}
for aba_nome, aba in data.items():
    for c in aba['cats']:
        nome_fluxo = FLOW_DEF[(aba_nome, c['nivel'])][0]
        flow_cats.setdefault(nome_fluxo, []).append(cat_ids[(aba_nome, c['nome'])])
for nome_fluxo, ids in flow_cats.items():
    print(f"fluxo '{nome_fluxo}': {len(ids)} categorias")
    if APPLY:
        fid = flows[nome_fluxo]
        pg.run("delete from client_flow_categories where flow_id=:f::uuid", f=fid)
        for cid_ in ids:
            pg.run("""insert into client_flow_categories (flow_id, category_id) values (:f::uuid, :c)
                      on conflict (flow_id, category_id) do nothing""", f=fid, c=cid_)

# 5) matriz categoria×documento (regrava; required=TRUE, blocking=TRUE)
print("\n== matriz (diff por categoria) ==")
tot_add = tot_del = 0
for aba_nome, aba in data.items():
    for c in aba['cats']:
        cid_ = cat_ids[(aba_nome, c['nome'])]
        target = sorted({HDR2ID[norm(h)] for h in c['docs']})
        current = sorted(r[0] for r in pg.run(
            "select document_id from category_documents where category_id=:c", c=cid_))
        add = [d for d in target if d not in current]
        rem = [d for d in current if d not in target]
        tot_add += len(add); tot_del += len(rem)
        if add or rem:
            print(f"  {cid_} {c['nome'][:48]}: +{add if add else ''} -{rem if rem else ''}")
        if APPLY:
            if rem:
                pg.run(f"delete from category_documents where category_id=:c and document_id in ({','.join(map(str, rem))})", c=cid_)
            for d in target:
                pg.run("""insert into category_documents (category_id, document_id, required, blocking)
                          values (:c, :d, true, true)
                          on conflict (category_id, document_id) do update set required=true, blocking=true""",
                       c=cid_, d=d)

print(f"\nvínculos: +{tot_add} · -{tot_del} · categorias: {len(cat_ids)} · fluxos: {len(flow_cats)}")
if APPLY:
    pg.run("""insert into audit_log (action, entity_type, entity_id, metadata)
              values ('VIX_MATRIX_V2_SEED', 'client', :c, :m::jsonb)""",
           c=str(client_id),
           m=json.dumps({"fonte": "EQP- Categorias VIX final.xlsx", "fluxos": list(flow_cats),
                         "adds": tot_add, "dels": tot_del}, ensure_ascii=False))
    print("audit gravado.")
