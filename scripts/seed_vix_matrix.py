#!/usr/bin/env python3
"""Seed da matriz de homologação VIX (VixPar) — 1º cliente ELOS não-HOC.
Fonte da verdade: VIX_MATRIZ_NIVEIS_CATEGORIAS_HANDOFF.md (§4).

Estruturas EXISTENTES do ELOS (patch_043) — nada novo de schema além do
patch_052 (flag dado_pessoal):
  client_flows (Nível 1/2/3) → client_flow_categories → categories(client_id)
  → category_documents → documents_catalog

Regras de segurança:
  · NADA do HOC é alterado: docs reutilizados ficam intocados; novos docs
    em ids >= 10000 (HOC vai até ~600, sync upserta só ids do HOC)
  · Categorias VIX em ids 500000+ (< 1M): fora da faixa que o sync diário
    considera (CAT_ID_OFFSET=1M) — sync nunca toca/desativa
  · Idempotente: upserts por id/chave fixa; pode rodar N vezes
"""
import os, re, secrets, json, urllib.request
import pg8000.native

VIX = {
    "razao_social": "VIX LOGISTICA S/A",
    "nome_fantasia": "VIXPAR",
    "cnpj": "32681371000172",
    "master_email": "vixpar@equipoinfo.com.br",
    "master_name": "VixPar (Master)",
}

# ── Catálogo: slug → id existente (REUSO, sem alteração) ──────────────────
REUSE = {
    "cartao_cnpj": 37, "crf_fgts": 7, "cndt": 8, "cnd_estadual": 16,
    "cnd_federal": 42, "contrato_social": 39, "certidao_falencia": 150,
    "registro_anp": 26, "alvara_funcionamento": 40, "ctf_ibama": 18,
    "licenca_operacao": 19, "art_aft": 67, "fds_fispq": 239, "pmoc": 157,
    "pcmso": 545, "pgr": 546, "autorizacao_funcionamento_pf": 166,
    "registro_conselho_rt": 65,
}

# ── Catálogo: novos (ids 10000+) — nome exibição corrigido ────────────────
# (slug, id, nome, responsibility, auto_collect, dado_pessoal)
# obtenção→responsibility: ROBO/FORM→interna · UPLOAD→fornecedor · VIX→cliente
NEW_DOCS = [
    ("sintegra",                       10001, "Sintegra", "interna", True,  False),
    ("lista_trabalho_escravo",         10002, '"Lista Suja" — Trabalho Escravo', "interna", True, False),
    ("relatorio_risco_financeiro",     10003, "Relatório de Risco Financeiro", "interna", False, False),
    ("cadastro_mtr",                   10004, "Cadastro no Sistema MTR do órgão correspondente (SINIR, FEAM, INEA, SIGOR, etc)", "fornecedor", False, False),
    ("destinacao_residuo",             10005, "Certificado ou Declaração de destinação final do resíduo", "fornecedor", False, False),
    ("calibracao_instrumento_medicao", 10006, "Certificado de calibração do Instrumento utilizado para medição", "fornecedor", False, False),
    ("inmetro_pneus",                  10007, "Certificado de Conformidade Inmetro para Pneus Novos Rodoviários", "fornecedor", False, False),
    ("comprovacao_experiencia",        10008, "Comprovação de experiência para desempenho da atividade contratada", "fornecedor", False, False),
    ("alvara_sanitario",               10009, "Alvará Sanitário Municipal", "fornecedor", False, False),
    ("registro_conselho_pj",           10010, "Registro da empresa no Conselho de Classe e constatação do profissional no Quadro Técnico (PJ)", "fornecedor", False, False),
    ("ordem_servico",                  10011, "Comprovante detalhado da execução dos serviços (ordem de serviço)", "fornecedor", False, False),
    ("cnh_manobristas",                10012, "CNH (manobristas)", "fornecedor", False, True),
    ("historico_manutencao",           10013, "Histórico de Manutenção ou Último Registro de Manutenção", "fornecedor", False, False),
    ("calibracao_instrumentos",        10014, "Certificado de Calibração dos Instrumentos", "fornecedor", False, False),
    ("laudo_getec",                    10015, "Laudo Técnico da GETEC (Formulário interno VixPar)", "cliente", False, False),
    ("aso",                            10016, "ASO — Atestado de Saúde Ocupacional", "fornecedor", False, True),
    ("registro_arma_pf",               10017, "Registro da Arma junto à Polícia Federal", "fornecedor", False, False),
    ("cnv",                            10018, "Carteira Nacional de Vigilante (CNV)", "fornecedor", False, True),
    ("curso_formacao",                 10019, "Curso de formação técnica ou Comprovação de experiência para desempenho da atividade", "fornecedor", False, False),
    ("questionario_compliance",        10020, "Questionário de Compliance", "interna", False, False),
    ("termo_conduta",                  10021, "Termo de Conduta", "interna", False, False),
    # §5.1 — não exigidos por nenhuma categoria, mas cadastrados no catálogo:
    ("certidao_acao_trabalhista_trt",  10022, "Certidão de Ação Trabalhista (TRT)", "fornecedor", False, False),
    ("certidao_debitos_min_trabalho",  10023, "Certidão de Débitos Trabalhistas (Ministério do Trabalho)", "fornecedor", False, False),
    ("laudo_estanqueidade",            10024, "Laudo de Estanqueidade", "fornecedor", False, False),
]
DOC = {**REUSE, **{s: i for s, i, *_ in NEW_DOCS}}

# ── Fluxos (Nível VixPar = Fluxo ELOS) ────────────────────────────────────
FLOWS = [
    ("Nível 1", "Básico — identidade fiscal, licença operacional e compliance"),
    ("Nível 2", "Intermediário — adiciona documentos técnicos/ambientais e risco financeiro"),
    ("Nível 3", "Crítico — mão de obra alocada: regularidade fiscal/trabalhista completa"),
]

# ── Checklists (§4 — fonte da verdade, verbatim) ──────────────────────────
CAT_BASE_ID = 500000  # raízes 500001/500002; categorias a partir de 500010
CHECKLISTS = [
    (1, "SERVICOS", "SERVIÇO DE CALIBRAÇÃO DE INSTRUMENTO DE MEDIÇÃO E CRONOTACÓGRAFO", ["cartao_cnpj","sintegra","calibracao_instrumento_medicao","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "LAVAGEM DE VEÍCULOS NA OPERAÇÃO", ["cartao_cnpj","sintegra","licenca_operacao","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "LANTERNAGEM, PINTURA E JATEAMENTO (PROVEDOR FIXO)", ["cartao_cnpj","sintegra","licenca_operacao","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "SERVIÇO DE MECÂNICA EM GERAL, COMPONENTES E SISTEMA DE INJEÇÃO", ["cartao_cnpj","sintegra","alvara_funcionamento","licenca_operacao","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "SERVIÇO DE RASTREAMENTO E MONITORAMENTO DE FROTA", ["cartao_cnpj","sintegra","alvara_funcionamento","laudo_getec","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "MANUTENÇÃO DE AR CONDICIONADO", ["cartao_cnpj","sintegra","alvara_funcionamento","pmoc","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "COMPRA EM AGREGADOS DE EMPRESA DE EXTRAÇÃO MINERAL (AREIA E BRITA)", ["cartao_cnpj","sintegra","ctf_ibama","licenca_operacao","questionario_compliance","termo_conduta"]),
    (1, "SERVICOS", "LOCAÇÃO DE FROTA PESADA E EQUIPAMENTO PARA OPERAÇÃO", ["cartao_cnpj","sintegra","alvara_funcionamento","historico_manutencao","questionario_compliance","termo_conduta"]),
    (2, "MATERIAL", "AQUISIÇÃO DE BATERIAS (DISTRIBUIDOR)", ["cartao_cnpj","sintegra","contrato_social","ctf_ibama","licenca_operacao","relatorio_risco_financeiro","cadastro_mtr","destinacao_residuo","questionario_compliance","termo_conduta"]),
    (2, "MATERIAL", "AQUISIÇÃO COMBUSTÍVEL (DISTRIBUIDOR/TRR)", ["cartao_cnpj","sintegra","contrato_social","registro_anp","ctf_ibama","licenca_operacao","relatorio_risco_financeiro","questionario_compliance","termo_conduta"]),
    (2, "MATERIAL", "AQUISIÇÃO DE PNEUS VIA FABRICANTE", ["cartao_cnpj","sintegra","contrato_social","ctf_ibama","licenca_operacao","relatorio_risco_financeiro","inmetro_pneus","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "USINAGEM, SOLDA, TRATAMENTO E REVESTIMENTO DE METAIS EM EQUIPAMENTOS", ["cartao_cnpj","sintegra","alvara_funcionamento","licenca_operacao","calibracao_instrumento_medicao","comprovacao_experiencia","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "SERVIÇO DE INSTALAÇÃO/TROCA DE ACESSÓRIOS EM VEÍCULOS", ["cartao_cnpj","sintegra","alvara_funcionamento","calibracao_instrumento_medicao","comprovacao_experiencia","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "MANUTENÇÃO DO ELEVADOR AUTOMOTIVO", ["cartao_cnpj","sintegra","calibracao_instrumento_medicao","art_aft","comprovacao_experiencia","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "REFORMADORA DE PNEUS", ["cartao_cnpj","sintegra","ctf_ibama","licenca_operacao","calibracao_instrumento_medicao","calibracao_instrumentos","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "CONTROLE DE PRAGAS (DESINSETIZAÇÃO/DESRATIZAÇÃO)", ["cartao_cnpj","sintegra","art_aft","alvara_sanitario","registro_conselho_rt","registro_conselho_pj","fds_fispq","ordem_servico","pcmso","pgr","questionario_compliance","termo_conduta"]),
    (2, "SERVICOS", "HIGIENIZAÇÃO DE CAIXAS D'ÁGUA", ["cartao_cnpj","sintegra","alvara_funcionamento","registro_conselho_rt","registro_conselho_pj","ordem_servico","questionario_compliance","termo_conduta"]),
    (3, "SERVICOS", "VIGILÂNCIA PATRIMONIAL ARMADA", ["cartao_cnpj","sintegra","crf_fgts","cndt","lista_trabalho_escravo","cnd_estadual","cnd_federal","contrato_social","certidao_falencia","aso","registro_arma_pf","autorizacao_funcionamento_pf","cnv","curso_formacao","pcmso","pgr","questionario_compliance","termo_conduta"]),
    (3, "SERVICOS", "VIGILÂNCIA PATRIMONIAL ARMADA QUARTEIRIZADA", ["cartao_cnpj","sintegra","crf_fgts","cndt","lista_trabalho_escravo","cnd_estadual","cnd_federal","contrato_social","aso","registro_arma_pf","autorizacao_funcionamento_pf","cnv","curso_formacao","pcmso","pgr","questionario_compliance","termo_conduta"]),
    (3, "SERVICOS", "PORTARIA", ["cartao_cnpj","sintegra","crf_fgts","cndt","lista_trabalho_escravo","cnd_estadual","cnd_federal","contrato_social","certidao_falencia","aso","curso_formacao","pcmso","pgr","questionario_compliance","termo_conduta"]),
    (3, "SERVICOS", "LIMPEZA PREDIAL E DE ÔNIBUS (PROVEDOR FIXO)", ["cartao_cnpj","sintegra","lista_trabalho_escravo","cnd_estadual","cnd_federal","certidao_falencia","aso","pcmso","pgr","questionario_compliance","termo_conduta"]),
    (3, "SERVICOS", "LAVAGEM DE VEÍCULOS (PROVEDOR FIXO)", ["cartao_cnpj","sintegra","lista_trabalho_escravo","cnd_estadual","cnd_federal","certidao_falencia","cnh_manobristas","aso","pcmso","pgr","questionario_compliance","termo_conduta"]),
]

# Validação prévia contra o §3 (antes de escrever qualquer coisa)
assert len(CHECKLISTS) == 22
assert sum(1 for c in CHECKLISTS if c[0] == 1) == 8
assert sum(1 for c in CHECKLISTS if c[0] == 2) == 9
assert sum(1 for c in CHECKLISTS if c[0] == 3) == 5
_by_name = {c[2]: c[3] for c in CHECKLISTS}
assert len(_by_name["VIGILÂNCIA PATRIMONIAL ARMADA"]) == 18
assert len(_by_name["CONTROLE DE PRAGAS (DESINSETIZAÇÃO/DESRATIZAÇÃO)"]) == 12
assert len(_by_name["SERVIÇO DE CALIBRAÇÃO DE INSTRUMENTO DE MEDIÇÃO E CRONOTACÓGRAFO"]) == 5
_used = {s for c in CHECKLISTS for s in c[3]}
assert _used <= set(DOC), f"slugs sem doc: {_used - set(DOC)}"
assert len(_used) == 39, len(_used)

def esc(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    env = {}
    with open(os.path.join(os.path.dirname(__file__), "..", ".env")) as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"')
    m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", env["SUPABASE_DB_URL"])
    c = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                                 database=m.group(5), password=m.group(2), ssl_context=True)

    # ── 1. Cliente VIX ────────────────────────────────────────────────────
    row = c.run(f"SELECT id::text FROM clients WHERE cnpj = {esc(VIX['cnpj'])}")
    if row:
        client_id = row[0][0]
        print(f"cliente já existe: {client_id}")
    else:
        client_id = c.run(f"""INSERT INTO clients (razao_social, nome_fantasia, cnpj)
            VALUES ({esc(VIX['razao_social'])}, {esc(VIX['nome_fantasia'])}, {esc(VIX['cnpj'])})
            RETURNING id::text""")[0][0]
        print(f"cliente criado: {client_id}")

    # ── 2. Novos documentos no catálogo (ids 10000+, HOC intocado) ────────
    for slug, did, nome, resp, auto, pessoal in NEW_DOCS:
        c.run(f"""INSERT INTO documents_catalog (id, name, responsibility, auto_collect, active, dado_pessoal)
            VALUES ({did}, {esc(nome)}, {esc(resp)}, {esc(auto)}, TRUE, {esc(pessoal)})
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
              responsibility = EXCLUDED.responsibility, dado_pessoal = EXCLUDED.dado_pessoal""")
    print(f"catálogo: {len(NEW_DOCS)} docs novos garantidos (+{len(REUSE)} reutilizados)")

    # ── 3. Raízes + categorias VIX (ids 500000+, fora do alcance do sync) ─
    roots = {"SERVICOS": CAT_BASE_ID + 1, "MATERIAL": CAT_BASE_ID + 2}
    for nome, cid in [("SERVIÇOS", roots["SERVICOS"]), ("MATERIAL", roots["MATERIAL"])]:
        c.run(f"""INSERT INTO categories (id, name, client_id, active)
            VALUES ({cid}, {esc(nome)}, {esc(client_id)}::uuid, TRUE)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = TRUE""")

    cat_ids = {}
    for i, (nivel, tipo, nome, _slugs) in enumerate(CHECKLISTS):
        cid = CAT_BASE_ID + 10 + i
        cat_ids[nome] = cid
        c.run(f"""INSERT INTO categories (id, name, parent_id, client_id, active)
            VALUES ({cid}, {esc(nome)}, {roots[tipo]}, {esc(client_id)}::uuid, TRUE)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
              parent_id = EXCLUDED.parent_id, active = TRUE""")
    print(f"categorias: 2 raízes + {len(cat_ids)}")

    # ── 4. Fluxos (Nível 1/2/3) + vínculo fluxo→categoria ────────────────
    flow_ids = {}
    for n, (nome, desc) in enumerate(FLOWS, start=1):
        row = c.run(f"SELECT id::text FROM client_flows WHERE client_id = {esc(client_id)}::uuid AND name = {esc(nome)}")
        if row:
            flow_ids[n] = row[0][0]
            c.run(f"UPDATE client_flows SET description = {esc(desc)}, active = TRUE WHERE id = {esc(flow_ids[n])}::uuid")
        else:
            flow_ids[n] = c.run(f"""INSERT INTO client_flows (client_id, name, description, active)
                VALUES ({esc(client_id)}::uuid, {esc(nome)}, {esc(desc)}, TRUE) RETURNING id::text""")[0][0]
    for nivel, _tipo, nome, _slugs in CHECKLISTS:
        c.run(f"""INSERT INTO client_flow_categories (flow_id, category_id)
            VALUES ({esc(flow_ids[nivel])}::uuid, {cat_ids[nome]})
            ON CONFLICT (flow_id, category_id) DO NOTHING""")
    print(f"fluxos: {len(flow_ids)} · vínculos fluxo→categoria: {len(CHECKLISTS)}")

    # ── 5. Matriz categoria×documento (checklists §4) ─────────────────────
    links = 0
    for _nivel, _tipo, nome, slugs in CHECKLISTS:
        for slug in slugs:
            c.run(f"""INSERT INTO category_documents (category_id, document_id, required, blocking)
                VALUES ({cat_ids[nome]}, {DOC[slug]}, TRUE, FALSE)
                ON CONFLICT (category_id, document_id) DO UPDATE SET required = TRUE""")
            links += 1
    print(f"matriz: {links} vínculos categoria×documento")

    # ── 6. Usuário master ────────────────────────────────────────────────
    exists = c.run(f"SELECT id::text FROM auth.users WHERE email = {esc(VIX['master_email'])}")
    password = None
    if exists:
        user_id = exists[0][0]
        print(f"usuário master já existe: {user_id}")
    else:
        password = secrets.token_urlsafe(9)
        req = urllib.request.Request(
            f"{env['SUPABASE_URL']}/auth/v1/admin/users",
            data=json.dumps({"email": VIX["master_email"], "password": password,
                             "email_confirm": True,
                             "user_metadata": {"name": VIX["master_name"], "role": "CLIENT"}}).encode(),
            headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
                     "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
                     "Content-Type": "application/json"}, method="POST")
        user_id = json.load(urllib.request.urlopen(req))["id"]
        print(f"usuário master criado: {user_id}")
    c.run(f"""INSERT INTO profiles (id, role, name) VALUES ({esc(user_id)}::uuid, 'CLIENT', {esc(VIX['master_name'])})
        ON CONFLICT (id) DO UPDATE SET role = 'CLIENT', name = EXCLUDED.name""")
    prof = c.run("SELECT id::text FROM access_profiles WHERE role_type = 'CLIENT' AND is_system LIMIT 1")
    prof_id = prof[0][0] if prof else None
    have_role = c.run(f"SELECT 1 FROM user_roles WHERE user_id = {esc(user_id)}::uuid AND role = 'CLIENT'")
    if not have_role:
        c.run(f"""INSERT INTO user_roles (user_id, role, client_id, is_primary, access_profile, access_profile_id)
            VALUES ({esc(user_id)}::uuid, 'CLIENT', {esc(client_id)}::uuid, TRUE, 'full',
                    {esc(prof_id)}{'::uuid' if prof_id else ''})""")
        print("papel CLIENT vinculado (Acesso Total)")
    c.run(f"UPDATE clients SET user_id = {esc(user_id)}::uuid WHERE id = {esc(client_id)}::uuid AND user_id IS NULL")

    # e-mail de credenciais (Resend) — só quando o usuário acabou de ser criado
    if password and env.get("RESEND_API_KEY"):
        html = f"""<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0">SIGEC-ELOS</h1><p style="color:#C7D2FE;margin:8px 0 0">Sua conta foi criada</p></div>
          <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
            <p>Olá, <strong>{VIX['nome_fantasia']}</strong>! Sua conta de <strong>Cliente</strong> na plataforma SIGEC-ELOS está pronta.</p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0">
              <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%">E-mail</td><td style="padding:10px;border:1px solid #e2e8f0">{VIX['master_email']}</td></tr>
              <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">Senha inicial</td><td style="padding:10px;border:1px solid #e2e8f0;font-family:monospace;color:#2E3192"><strong>{password}</strong></td></tr>
            </table>
            <div style="background:#FFF3E8;border:1px solid #F47E2F;border-radius:8px;padding:16px;margin-bottom:24px"><strong>⚠️ Altere a senha no primeiro acesso.</strong></div>
            <a href="https://elos.eqpitech.com.br/login" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Acessar Plataforma →</a>
          </div></div>"""
        req = urllib.request.Request("https://api.resend.com/emails",
            data=json.dumps({"from": env.get("EMAIL_FROM", "noreply@eqpitech.com.br"),
                             "to": [VIX["master_email"]],
                             "subject": "SIGEC-ELOS — Suas credenciais de acesso (VixPar)",
                             "html": html}).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {env['RESEND_API_KEY']}"}, method="POST")
        try:
            urllib.request.urlopen(req)
            print("credenciais enviadas por e-mail")
        except Exception as e:
            print(f"E-MAIL FALHOU ({e}) — senha gerada: {password}")

    # ── 7. Validação final (contagens do §3/§4) ───────────────────────────
    print("\n══ VALIDAÇÃO ══")
    n_cats = c.run(f"SELECT count(*) FROM categories WHERE client_id = {esc(client_id)}::uuid AND parent_id IS NOT NULL")[0][0]
    print(f"categorias VIX: {n_cats} (esperado 22)")
    for nome, esperado in [("VIGILÂNCIA PATRIMONIAL ARMADA", 18),
                           ("CONTROLE DE PRAGAS (DESINSETIZAÇÃO/DESRATIZAÇÃO)", 12),
                           ("SERVIÇO DE CALIBRAÇÃO DE INSTRUMENTO DE MEDIÇÃO E CRONOTACÓGRAFO", 5)]:
        n = c.run(f"SELECT count(*) FROM category_documents WHERE category_id = {cat_ids[nome]} AND required")[0][0]
        ok = "✅" if n == esperado else "❌"
        print(f"{ok} {nome[:50]}: {n} docs (esperado {esperado})")
    for nivel in (1, 2, 3):
        n = c.run(f"SELECT count(*) FROM client_flow_categories WHERE flow_id = {esc(flow_ids[nivel])}::uuid")[0][0]
        print(f"Fluxo Nível {nivel}: {n} categorias (esperado {[None,8,9,5][nivel]})")
    total_docs = c.run(f"""SELECT count(DISTINCT cd.document_id) FROM category_documents cd
        JOIN categories cat ON cat.id = cd.category_id
        WHERE cat.client_id = {esc(client_id)}::uuid AND cd.required""")[0][0]
    print(f"documentos distintos exigidos: {total_docs} (esperado 39)")
    c.close()


if __name__ == "__main__":
    main()
