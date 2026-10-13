-- Base FICTÍCIA para as imagens dos manuais (13/10/2026) — SÓ STAGING.
-- Nenhum dado real: empresas, CNPJs (válidos, inexistentes), pessoas e e-mails
-- inventados. A matriz de documentos do cliente-exemplo é copiada da
-- configuração de um cliente real com outro nome e PREÇOS FICTÍCIOS.
-- Reexecutável (apaga e recria tudo do prefixo e1a00000-…). O
-- scripts/staging_sync.sh apaga esta base — rode de novo depois dele.
--   psql "$SUPABASE_DB_URL_PREVIEW" -v ON_ERROR_STOP=1 -1 -f scripts/manuais/dataset_staging.sql
-- Senha de todos os usuários-exemplo: ManualElos#2026 (só staging)

\set modelo_cliente '''VIXPAR'''
\set cid '''e1a00000-0000-4000-8000-000000000001'''

-- ── 0. limpeza ────────────────────────────────────────────────────────────
DELETE FROM ai_review_jobs        WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM auto_collect_jobs     WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM client_term_acceptances WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM questionnaire_answers WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM client_pre_registrations WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM supplier_interests    WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM rfq_responses         WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM rfqs                  WHERE client_id = :cid;
DELETE FROM invitations           WHERE client_id = :cid OR supplier_id::text LIKE 'e1a00000-%';
DELETE FROM documents             WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM seals                 WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM supplier_categories   WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM supplier_partners     WHERE supplier_id::text LIKE 'e1a00000-%';
DELETE FROM user_roles            WHERE user_id::text LIKE 'e1a00000-%';
DELETE FROM buyers                WHERE id::text LIKE 'e1a00000-%' OR user_id::text LIKE 'e1a00000-%';
DELETE FROM suppliers             WHERE id::text LIKE 'e1a00000-%';
DELETE FROM client_terms_items    WHERE client_id = :cid;
DELETE FROM questionnaire_questions WHERE questionnaire_id IN (SELECT id FROM questionnaires WHERE client_id = :cid);
DELETE FROM questionnaires        WHERE client_id = :cid;
DELETE FROM client_landing_pages  WHERE client_id = :cid;
DELETE FROM client_flow_categories WHERE flow_id IN (SELECT id FROM client_flows WHERE client_id = :cid);
DELETE FROM client_flows          WHERE client_id = :cid;
DELETE FROM category_documents    WHERE category_id BETWEEN 500101 AND 500199;
DELETE FROM categories            WHERE id BETWEEN 500101 AND 500199;
DELETE FROM clients               WHERE id = :cid;
DELETE FROM audit_log             WHERE user_id::text LIKE 'e1a00000-%';
DELETE FROM profiles              WHERE id::text LIKE 'e1a00000-%';
DELETE FROM auth.identities       WHERE user_id::text LIKE 'e1a00000-%';
DELETE FROM auth.users            WHERE id::text LIKE 'e1a00000-%';

-- ── 1. usuários de login ─────────────────────────────────────────────────
CREATE TEMP TABLE u(id uuid, email text, nome text, papel text);
INSERT INTO u VALUES
 ('e1a00000-0000-4000-8000-0000000000a1','ana.souza@mineradoraexemplo.com.br','Ana Souza','CLIENT'),
 ('e1a00000-0000-4000-8000-0000000000a2','rafael.mendes@mineradoraexemplo.com.br','Rafael Mendes','CLIENT'),
 ('e1a00000-0000-4000-8000-0000000000b1','carlos.lima@construtoramodelo.com.br','Carlos Lima','SUPPLIER'),
 ('e1a00000-0000-4000-8000-0000000000c1','beatriz.rocha@comercialexemplo.com.br','Beatriz Rocha','BUYER'),
 ('e1a00000-0000-4000-8000-0000000000d1','analista@eqpi-exemplo.com.br','Juliana Prado','ADMIN');
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('ManualElos#2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', nome),
  now() - interval '60 days', now(), now(), '', '', '', '', '', '', '', ''
FROM u;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() FROM u;
-- perfil (o gatilho do cadastro cria como SUPPLIER; aqui o papel real) + tour já visto
UPDATE profiles p SET role = u.papel, name = u.nome, onboarding_state = '{"dismissed": true, "skipped": true, "done": {}}'
FROM u WHERE p.id = u.id;

-- ── 2. cliente-exemplo (cópia da matriz do cliente-modelo, preços fictícios) ─
INSERT INTO clients (id, user_id, cnpj, razao_social, nome_fantasia, sigla, active, homologation_payer)
VALUES (:cid, 'e1a00000-0000-4000-8000-0000000000a1', '11222333000181', 'MINERADORA EXEMPLO S.A.', 'Mineradora Exemplo', 'MEX', true, 'supplier');

INSERT INTO categories (id, name, parent_id, active, sort_order, is_custom, approved, is_active, client_id, codigo, name_en)
SELECT c.id + 100, c.name, CASE WHEN c.parent_id IS NULL THEN NULL ELSE c.parent_id + 100 END,
       c.active, c.sort_order, c.is_custom, c.approved, c.is_active, :cid, c.codigo, c.name_en
FROM categories c JOIN clients m ON m.id = c.client_id AND coalesce(m.nome_fantasia, m.razao_social) = :modelo_cliente
ORDER BY (c.parent_id IS NOT NULL), c.id;
INSERT INTO category_documents (category_id, document_id, required, blocking)
SELECT cd.category_id + 100, cd.document_id, cd.required, cd.blocking
FROM category_documents cd JOIN categories c ON c.id = cd.category_id
JOIN clients m ON m.id = c.client_id AND coalesce(m.nome_fantasia, m.razao_social) = :modelo_cliente;

CREATE TEMP TABLE fmap AS
SELECT f.id AS old_id, gen_random_uuid() AS new_id, f.name, f.is_default, f.active,
       CASE WHEN f.name ILIKE '%Nível 1%' OR f.name = 'Qualidade' THEN 150
            WHEN f.name ILIKE '%Nível 2%' THEN 250 ELSE 450 END AS subs
FROM client_flows f JOIN clients m ON m.id = f.client_id AND coalesce(m.nome_fantasia, m.razao_social) = :modelo_cliente;
INSERT INTO client_flows (id, client_id, name, description, active, price, price_subsidized, is_default)
SELECT new_id, :cid, name, NULL, active, 450, subs, is_default FROM fmap;
INSERT INTO client_flow_categories (flow_id, category_id)
SELECT m.new_id, fc.category_id + 100 FROM client_flow_categories fc JOIN fmap m ON m.old_id = fc.flow_id;

INSERT INTO client_landing_pages (client_id, slug, company_name, accent_color, secondary_color, description, contact_email, phone, website_url, is_active, badges)
VALUES (:cid, 'mineradora-exemplo', 'Mineradora Exemplo', '#0f766e', '#134e4a',
  'A Mineradora Exemplo homologa seus fornecedores pela plataforma SIGEC-ELOS. Cadastre sua empresa, envie a documentação e acompanhe a análise pela internet.',
  'suprimentos@mineradoraexemplo.com.br', '(31) 3000-0000', 'https://www.exemplo.com.br', true, '{"ISO 9001","ISO 14001"}');

INSERT INTO client_terms_items (client_id, title, kind, content, version, required, active, sort) VALUES
 (:cid, 'Código de Conduta de Fornecedores', 'TEXT', 'O fornecedor declara conhecer e cumprir o Código de Conduta de Fornecedores da Mineradora Exemplo, incluindo as regras de ética, integridade, segurança do trabalho, meio ambiente e respeito aos direitos humanos.', 1, true, true, 1),
 (:cid, 'Política de Segurança e Saúde no Trabalho', 'TEXT', 'O fornecedor se compromete a cumprir as normas de segurança e saúde no trabalho aplicáveis às atividades executadas nas unidades da Mineradora Exemplo.', 1, true, true, 2);

INSERT INTO questionnaires (id, client_id, title, description, active)
VALUES ('e1a00000-0000-4000-8000-000000000301', :cid, 'Questionário de Compliance', 'Perguntas sobre integridade e relacionamento com o poder público.', true);
INSERT INTO questionnaire_questions (id, questionnaire_id, text, type, options, required, order_index, compliance_alert) VALUES
 ('e1a00000-0000-4000-8000-000000000311','e1a00000-0000-4000-8000-000000000301','A empresa possui programa de integridade (compliance) formalizado?','boolean',NULL,true,1,'{NÃO}'),
 ('e1a00000-0000-4000-8000-000000000312','e1a00000-0000-4000-8000-000000000301','Algum sócio ou diretor ocupa ou ocupou cargo público nos últimos 5 anos?','boolean',NULL,true,2,'{SIM}'),
 ('e1a00000-0000-4000-8000-000000000313','e1a00000-0000-4000-8000-000000000301','Qual o relacionamento da empresa com órgãos públicos?','select','["Não possui", "Participa de licitações", "Possui contratos com órgãos públicos", "Outros"]',true,3,NULL),
 ('e1a00000-0000-4000-8000-000000000314','e1a00000-0000-4000-8000-000000000301','A empresa possui canal de denúncias?','boolean',NULL,true,4,NULL),
 ('e1a00000-0000-4000-8000-000000000315','e1a00000-0000-4000-8000-000000000301','Descreva brevemente as principais medidas de segurança do trabalho adotadas.','text',NULL,false,5,NULL);

-- ── 3. fornecedores fictícios ─────────────────────────────────────────────
CREATE TEMP TABLE s(id uuid, cnpj text, razao text, fantasia text, cidade text, uf text, email text, contato text, fone text);
INSERT INTO s VALUES
 ('e1a00000-0000-4000-8000-000000000101','90234567000115','CONSTRUTORA MODELO LTDA','Construtora Modelo','Belo Horizonte','MG','carlos.lima@construtoramodelo.com.br','Carlos Lima','(31) 3111-1111'),
 ('e1a00000-0000-4000-8000-000000000102','90456789000182','SERVIÇOS ALFA LTDA','Serviços Alfa','Contagem','MG','contato@servicosalfa.com.br','Marina Alves','(31) 3222-2222'),
 ('e1a00000-0000-4000-8000-000000000103','90567890000100','BETA MANUTENÇÃO INDUSTRIAL LTDA','Beta Manutenção','Betim','MG','contato@betamanutencao.com.br','Paulo Freitas','(31) 3333-3333'),
 ('e1a00000-0000-4000-8000-000000000104','90678901000120','GAMA TRANSPORTES E LOGÍSTICA LTDA','Gama Transportes','Vitória','ES','contato@gamatransportes.com.br','Lúcia Ramos','(27) 3444-4444'),
 ('e1a00000-0000-4000-8000-000000000105','90789012000130','DELTA ENGENHARIA LTDA','Delta Engenharia','Ipatinga','MG','contato@deltaengenharia.com.br','Roberto Dias','(31) 3555-5555'),
 ('e1a00000-0000-4000-8000-000000000106','9A8BC765000106','EPSILON TECNOLOGIA LTDA','Epsilon Tecnologia','São Paulo','SP','contato@epsilontec.com.br','Fernanda Costa','(11) 3666-6666');
INSERT INTO suppliers (id, user_id, cnpj, razao_social, nome_fantasia, city, state, email, contact_name, phone, status,
  cnae_main, regime_tributario, data_abertura, capital_social, marketplace_optin, terms_accepted, terms_accepted_at,
  address)
SELECT s.id, CASE WHEN s.id = 'e1a00000-0000-4000-8000-000000000101' THEN 'e1a00000-0000-4000-8000-0000000000b1'::uuid END,
  s.cnpj, s.razao, s.fantasia, s.cidade, s.uf, s.email, s.contato, s.fone,
  CASE WHEN s.id IN ('e1a00000-0000-4000-8000-000000000101','e1a00000-0000-4000-8000-000000000102') THEN 'ACTIVE' ELSE 'PENDING' END,
  '4120400', 'Lucro Presumido', '2012-03-15', 500000, true, true, now() - interval '50 days',
  jsonb_build_object('logradouro','Rua Exemplo','numero','100','bairro','Centro','municipio',s.cidade,'uf',s.uf,'cep','30000000')
FROM s;
INSERT INTO supplier_partners (supplier_id, tipo, nome, cargo, cpf_cnpj)
SELECT id, 'pf', 'Sócio Exemplo da ' || fantasia, 'Sócio-Administrador', '12345678909' FROM s;

-- categorias: uma categoria de serviço do cliente-exemplo para cada fornecedor
CREATE TEMP TABLE cat AS
SELECT (SELECT c.id FROM categories c WHERE c.client_id = :cid AND c.parent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM client_flow_categories fc JOIN fmap m ON m.new_id = fc.flow_id
                      WHERE fc.category_id = c.id AND m.name ILIKE '%Suprimentos%Nível 1%')
        ORDER BY c.id LIMIT 1) AS cat_id,
       (SELECT new_id FROM fmap WHERE name ILIKE '%Suprimentos%Nível 1%' LIMIT 1) AS flow_id;
INSERT INTO supplier_categories (supplier_id, category_id) SELECT s.id, cat.cat_id FROM s, cat;

-- processos (selos)
INSERT INTO seals (id, supplier_id, client_id, flow_id, status, level, seal_type, seal_name, score, released_at, issued_at, expires_at, created_at, suspended_reason, rejection_reason, priority_requested_at, priority_note)
SELECT x.id::uuid, x.sid::uuid, :cid, cat.flow_id, x.st, 'Premium', 'homologado', NULL, x.score, x.rel, x.iss, x.exp, now() - (x.dias || ' days')::interval, x.mot, x.rej, x.prio, x.prio_note
FROM cat, (VALUES
  -- Construtora Modelo: homologada pela Mineradora (certificado) — doc vencendo em breve
  ('e1a41000-0000-4000-8000-000000000401','e1a00000-0000-4000-8000-000000000101','ACTIVE',  92, now()-interval '45 days', now()-interval '30 days', now()+interval '335 days', 50, NULL, NULL, NULL::timestamptz, NULL),
  ('e1a42000-0000-4000-8000-000000000402','e1a00000-0000-4000-8000-000000000102','ACTIVE', 100, now()-interval '80 days', now()-interval '70 days', now()+interval '295 days', 90, NULL, NULL, NULL, NULL),
  ('e1a43000-0000-4000-8000-000000000403','e1a00000-0000-4000-8000-000000000103','PENDING',  60, now()-interval '6 days', NULL, NULL, 10, NULL, NULL, now()-interval '1 day', 'Contrato com início previsto para o próximo mês'),
  ('e1a44000-0000-4000-8000-000000000404','e1a00000-0000-4000-8000-000000000104','PENDING',   0, NULL, NULL, NULL, 3, NULL, NULL, NULL, NULL),
  ('e1a45000-0000-4000-8000-000000000405','e1a00000-0000-4000-8000-000000000105','SUSPENDED', 40, now()-interval '40 days', NULL, NULL, 45,
     'Homologação reprovada automaticamente. Documentos com pendências: CND Tributos Federais. Corrija os documentos e solicite nova análise.',
     'Homologação reprovada automaticamente. Documentos com pendências: CND Tributos Federais. Corrija os documentos e solicite nova análise.', NULL, NULL)
) AS x(id, sid, st, score, rel, iss, exp, dias, mot, rej, prio, prio_note);
-- processo ELOS próprio (sem cliente) da Construtora Modelo, em análise — documentos em vários status
INSERT INTO seals (id, supplier_id, client_id, status, level, seal_type, seal_name, score, released_at, created_at)
VALUES ('e1a46000-0000-4000-8000-000000000406','e1a00000-0000-4000-8000-000000000101', NULL, 'PENDING', 'Premium', 'homologado', 'ELOS Homologado', 55, now()-interval '8 days', now()-interval '9 days');

-- documentos exigidos pela categoria (todos aprovados para os homologados)
INSERT INTO documents (supplier_id, type, label, source, status, issued_at, expires_at, submitted_at, reviewed_at, created_at, storage_path)
SELECT s.id, cd.document_id::text, dc.name, 'MANUAL',
  CASE WHEN s.id IN ('e1a00000-0000-4000-8000-000000000101','e1a00000-0000-4000-8000-000000000102') THEN 'VALID'
       WHEN s.id = 'e1a00000-0000-4000-8000-000000000103' THEN 'PENDING'
       WHEN s.id = 'e1a00000-0000-4000-8000-000000000105' THEN 'VALID'
       ELSE 'MISSING' END,
  now()-interval '40 days', now()+interval '300 days', now()-interval '40 days', now()-interval '35 days', now()-interval '40 days',
  CASE WHEN s.id IN ('e1a00000-0000-4000-8000-000000000104','e1a00000-0000-4000-8000-000000000106') THEN NULL
       ELSE 'manuais-exemplo/' || s.id || '/' || cd.document_id || '.pdf' END
FROM s CROSS JOIN cat JOIN category_documents cd ON cd.category_id = cat.cat_id JOIN documents_catalog dc ON dc.id = cd.document_id
WHERE s.id <> 'e1a00000-0000-4000-8000-000000000106';
-- Construtora: um documento vence em breve (renovação) — o primeiro da lista
UPDATE documents SET expires_at = now() + interval '5 days', status = 'EXPIRING'
WHERE id = (SELECT id FROM documents WHERE supplier_id = 'e1a00000-0000-4000-8000-000000000101' ORDER BY type LIMIT 1);
-- documentos do fluxo padrão ELOS (Construtora): vários status
INSERT INTO documents (supplier_id, type, label, source, status, issued_at, expires_at, submitted_at, review_note, metadata) VALUES
 ('e1a00000-0000-4000-8000-000000000101','37','Cartão de Inscrição no CNPJ','AUTO','VALID', now()-interval '8 days', now()+interval '357 days', now()-interval '8 days', NULL, '{"auto_collect": true, "source": "BrasilAPI"}'),
 ('e1a00000-0000-4000-8000-000000000101','62','Comprovante de Deferimento Simples Nacional','AUTO','VALID', now()-interval '8 days', now()+interval '357 days', now()-interval '8 days', NULL, '{"auto_collect": true}'),
 ('e1a00000-0000-4000-8000-000000000101','7','Certidão de Regularidade do FGTS','AUTO','PENDING', now()-interval '2 days', now()+interval '28 days', now()-interval '2 days', NULL,
   '{"route": "A", "consulta": {"fonte": "fgts_crf", "sugestao": "aprovar", "resultado": "nada_consta", "motivo": "FGTS: empregador REGULAR (CRF vigente)", "validade_fonte": "2026-11-10"}}'),
 ('e1a00000-0000-4000-8000-000000000101','8','CNDT Certidão Negativa de Débitos Trabalhistas','AUTO','PENDING', now()-interval '2 days', now()+interval '178 days', now()-interval '2 days', NULL,
   '{"route": "A", "consulta": {"fonte": "cndt", "sugestao": "aprovar", "resultado": "nada_consta", "motivo": "CNDT: negativa — sem débitos trabalhistas"}}'),
 ('e1a00000-0000-4000-8000-000000000101','42','CND Tributos Federais e Dívida Ativa da União','MANUAL','REJECTED', now()-interval '90 days', now()-interval '3 days', now()-interval '5 days', 'Certidão vencida — envie a certidão atualizada.', NULL),
 ('e1a00000-0000-4000-8000-000000000101','61','Analise CNAES','AUTO','PENDING', NULL, NULL, now()-interval '8 days', NULL, '{"auto_collect": true}')
ON CONFLICT (supplier_id, type) DO NOTHING;
-- Delta (reprovada): CND Federal reprovada
INSERT INTO documents (supplier_id, type, label, source, status, submitted_at, review_note)
VALUES ('e1a00000-0000-4000-8000-000000000105','42','CND Tributos Federais e Dívida Ativa da União','MANUAL','REJECTED', now()-interval '20 days', 'Certidão positiva — débitos em aberto.')
ON CONFLICT (supplier_id, type) DO UPDATE SET status = 'REJECTED', review_note = excluded.review_note;

-- pré-análise por IA (Rota B) num documento da Beta (em análise)
INSERT INTO ai_review_jobs (supplier_id, document_id, doc_type, storage_path, status, verdict, confidence, input_mode, model, cost_brl, finished_at, result)
SELECT d.supplier_id, d.id, d.type, d.storage_path, 'done', 'aprovar', 0.92, 'pdf', 'claude-sonnet-5', 0.05, now()-interval '1 day',
  '{"legivel": true, "veredito": "aprovar", "resumo": "Documento legível, CNPJ e razão social conferem, dentro da validade.", "checklist": [{"item": "CNPJ do documento igual ao do cadastro", "atende": true}, {"item": "Documento dentro da validade", "atende": true}]}'
FROM documents d WHERE d.supplier_id = 'e1a00000-0000-4000-8000-000000000103' ORDER BY d.type LIMIT 1;

-- questionário: Construtora e Alfa responderam; Beta respondeu metade
INSERT INTO questionnaire_answers (question_id, supplier_id, answer_boolean, answer_text, answered_at)
SELECT q.id, s.sid::uuid,
  CASE q.order_index WHEN 1 THEN true WHEN 2 THEN false WHEN 4 THEN true END,
  CASE q.order_index WHEN 3 THEN 'Não possui' WHEN 5 THEN 'Integração de segurança, uso obrigatório de EPI e inspeções semanais.' END,
  now() - interval '20 days'
FROM questionnaire_questions q,
     (VALUES ('e1a00000-0000-4000-8000-000000000101'), ('e1a00000-0000-4000-8000-000000000102'), ('e1a00000-0000-4000-8000-000000000105')) s(sid)
WHERE q.questionnaire_id = 'e1a00000-0000-4000-8000-000000000301';
INSERT INTO questionnaire_answers (question_id, supplier_id, answer_boolean, answered_at)
SELECT q.id, 'e1a00000-0000-4000-8000-000000000103', true, now() - interval '2 days'
FROM questionnaire_questions q WHERE q.questionnaire_id = 'e1a00000-0000-4000-8000-000000000301' AND q.order_index IN (1, 4);

-- convites do cliente-exemplo
INSERT INTO invitations (client_id, supplier_id, supplier_razao_social, supplier_cnpj, supplier_email, contato, status, invited_by_role, subsidiado, tipo_fornecedor, escopo, flow_id, created_at, viewed_at, token, objetivo)
SELECT :cid, x.sid::uuid, x.razao, x.cnpj, x.email, x.contato, x.st, 'CLIENT', x.sub, 'servico', 'Manutenção industrial', cat.flow_id,
       now() - (x.dias || ' days')::interval, CASE WHEN x.st IN ('VIEWED','REGISTERED') THEN now() - ((x.dias - 1) || ' days')::interval END,
       CASE WHEN x.st IN ('SENT','VIEWED') THEN gen_random_uuid() END, 'homologacao'
FROM cat, (VALUES
  ('e1a00000-0000-4000-8000-000000000101','CONSTRUTORA MODELO LTDA','90234567000115','carlos.lima@construtoramodelo.com.br','Carlos Lima','REGISTERED', false, 52),
  ('e1a00000-0000-4000-8000-000000000102','SERVIÇOS ALFA LTDA','90456789000182','contato@servicosalfa.com.br','Marina Alves','REGISTERED', true, 92),
  ('e1a00000-0000-4000-8000-000000000103','BETA MANUTENÇÃO INDUSTRIAL LTDA','90567890000100','contato@betamanutencao.com.br','Paulo Freitas','REGISTERED', true, 12),
  ('e1a00000-0000-4000-8000-000000000104','GAMA TRANSPORTES E LOGÍSTICA LTDA','90678901000120','contato@gamatransportes.com.br','Lúcia Ramos','REGISTERED', false, 4),
  ('e1a00000-0000-4000-8000-000000000105','DELTA ENGENHARIA LTDA','90789012000130','contato@deltaengenharia.com.br','Roberto Dias','REGISTERED', false, 46),
  (NULL,'ÔMEGA SERVIÇOS GERAIS LTDA','90901234000140','contato@omegaservicos.com.br','Sérgio Nunes','VIEWED', false, 5),
  (NULL,'SIGMA ELÉTRICA LTDA','90123456000196','contato@sigmaeletrica.com.br','Patrícia Melo','SENT', true, 2)
) AS x(sid, razao, cnpj, email, contato, st, sub, dias);

-- pré-cadastro (Epsilon, CNPJ alfanumérico) e interesse declarado
INSERT INTO client_pre_registrations (client_id, supplier_id, status, source, created_at)
VALUES (:cid, 'e1a00000-0000-4000-8000-000000000106', 'ACTIVE', 'PORTAL', now() - interval '3 days');
INSERT INTO supplier_interests (supplier_id, client_id, message, status, created_at)
VALUES ('e1a00000-0000-4000-8000-000000000102', :cid, 'Atendemos a região metropolitana com equipe própria de manutenção.', 'PENDING', now() - interval '6 days')
ON CONFLICT DO NOTHING;

-- ── 4. vínculos de acesso ─────────────────────────────────────────────────
INSERT INTO buyers (id, user_id, cnpj, razao_social) VALUES
 ('e1a00000-0000-4000-8000-000000000201','e1a00000-0000-4000-8000-0000000000c1','90345678000107','COMERCIAL EXEMPLO LTDA'),
 ('e1a00000-0000-4000-8000-000000000202','e1a00000-0000-4000-8000-0000000000b1','90234567000115','CONSTRUTORA MODELO LTDA');
INSERT INTO user_roles (user_id, role, client_id, supplier_id, buyer_id, is_primary, is_active, access_profile_id) VALUES
 ('e1a00000-0000-4000-8000-0000000000a1','CLIENT', :cid, NULL, NULL, true, true, (SELECT id FROM access_profiles WHERE is_system AND role_type='CLIENT' LIMIT 1)),
 ('e1a00000-0000-4000-8000-0000000000a2','CLIENT', :cid, NULL, NULL, true, true, (SELECT id FROM access_profiles WHERE is_system AND role_type='CLIENT' LIMIT 1)),
 ('e1a00000-0000-4000-8000-0000000000b1','SUPPLIER', NULL, 'e1a00000-0000-4000-8000-000000000101', NULL, true, true, (SELECT id FROM access_profiles WHERE is_system AND role_type='SUPPLIER' LIMIT 1)),
 ('e1a00000-0000-4000-8000-0000000000b1','BUYER', NULL, NULL, 'e1a00000-0000-4000-8000-000000000202', false, true, NULL),
 ('e1a00000-0000-4000-8000-0000000000c1','BUYER', NULL, NULL, 'e1a00000-0000-4000-8000-000000000201', true, true, NULL),
 ('e1a00000-0000-4000-8000-0000000000d1','ADMIN', NULL, NULL, NULL, true, true, NULL);
UPDATE profiles SET supplier_id = 'e1a00000-0000-4000-8000-000000000101' WHERE id = 'e1a00000-0000-4000-8000-0000000000b1';
UPDATE profiles SET buyer_id = 'e1a00000-0000-4000-8000-000000000201' WHERE id = 'e1a00000-0000-4000-8000-0000000000c1';

SELECT (SELECT count(*) FROM categories WHERE client_id = :cid) categorias,
       (SELECT count(*) FROM client_flows WHERE client_id = :cid) fluxos,
       (SELECT count(*) FROM seals WHERE supplier_id::text LIKE 'e1a00000-%') processos,
       (SELECT count(*) FROM documents WHERE supplier_id::text LIKE 'e1a00000-%') documentos,
       (SELECT count(*) FROM invitations WHERE client_id = :cid) convites,
       (SELECT count(*) FROM auth.users WHERE id::text LIKE 'e1a00000-%') usuarios;
