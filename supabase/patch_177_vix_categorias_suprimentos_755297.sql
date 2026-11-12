-- patch_177 — VIXPAR: categorias de Suprimentos (chamado #755297, 12/11/2026)
-- Planilha "EQP- Categorias SUPRIMENTOS" enviada pela VIX, aprovada pelo Luiz:
--  1) CND Tributos Federais e Dívida Ativa da União (42 — coletada pela EQPI,
--     Rota A pgfn_cnd) passa a ser exigida nas 23 categorias de Suprimentos;
--  2) Contrato Social (39) em Controle de Pragas e Higienização de Caixas d'Água;
--  3) 4 categorias novas (aba INCLUSÃO) e 2 documentos novos no catálogo.
-- Organismo Certificador segue no fluxo Qualidade (decisão do Luiz).
-- Questionário de Compliance, Termo de Conduta e Políticas VIXPAR da planilha
-- já são cobrados pelo questionário e pelos termos de aceite — não viram documento.
-- Faixas do ELOS: categorias 500000+, catálogo 10000+ (a sync do HOC não mexe).
-- Idempotente: reaplicar não duplica nada.

-- ── documentos novos no catálogo ──────────────────────────────────────────
insert into documents_catalog (id, name, auto_collect, active, responsibility, analysis_sla_days, dado_pessoal, validation_mode, validation_rule) values
 (10045, 'Cadastro no órgão regulador ambiental de competência estadual (IDAF – no ES / IEF – em MG e outros)', false, true, 'fornecedor', 5, false, 'manual',
  E'REGRAS (VixPar — chamado #755297, Aquisição de madeira nativa):\na) Identificar o órgão ambiental estadual competente (IDAF no ES, IEF em MG ou o órgão do estado da empresa) e o número do cadastro/registro.\nb) Verificar se o cadastro está ativo/regular para a atividade de comércio de madeira nativa.\nTITULARIDADE (CNPJ): do cadastro.\nVALIDADE: do documento (quando houver) ou 1 ano da data de emissão quando não houver validade.'),
 (10046, 'DOF (IBAMA) e Nota Fiscal — comprovação da origem legal e rastreabilidade da madeira nativa', false, true, 'fornecedor', 5, false, 'manual',
  E'REGRAS (VixPar — chamado #755297, Aquisição de madeira nativa):\na) DOF (Documento de Origem Florestal) emitido no sistema do IBAMA, com número, produto/espécie e volume.\nb) Nota Fiscal correspondente ao DOF (mesma operação: número, produto e volume compatíveis).\nc) Origem legal e rastreabilidade da madeira nativa identificáveis no DOF.\nTITULARIDADE (CNPJ): do cadastro (como emitente ou destinatário do DOF/NF).\nVALIDADE: do documento (quando houver) ou 1 ano da data de emissão quando não houver validade.')
on conflict (id) do nothing;

-- ── categorias novas (aba INCLUSÃO) ──────────────────────────────────────
insert into categories (id, name, parent_id, active, is_active, client_id) values
 (500056, 'ANÁLISES LABORATORIAIS AMBIENTAIS (EFLUENTE, SOLO E ÁGUA)',              500001, true, true, '78802f94-6dec-4554-af60-71a2b72e3903'),
 (500057, 'TRANSPORTE E DESTINAÇÃO FINAL DE RESÍDUOS CLASSE 1 (PERIGOSO)',          500001, true, true, '78802f94-6dec-4554-af60-71a2b72e3903'),
 (500058, 'TRANSPORTE E DESTINAÇÃO FINAL DE RESÍDUOS CLASSE 2 (NÃO PERIGOSO)',      500001, true, true, '78802f94-6dec-4554-af60-71a2b72e3903'),
 (500059, 'AQUISIÇÃO DE MADEIRA NATIVA',                                            500001, true, true, '78802f94-6dec-4554-af60-71a2b72e3903')
on conflict (id) do nothing;

-- nível (fluxo) de cada categoria nova
insert into client_flow_categories (flow_id, category_id)
select f.id, v.cat from (values (500056, 'Suprimentos – Nível 1'), (500057, 'Suprimentos – Nível 2'),
                                (500058, 'Suprimentos – Nível 2'), (500059, 'Suprimentos – Nível 2')) v(cat, fluxo)
join client_flows f on f.client_id = '78802f94-6dec-4554-af60-71a2b72e3903' and f.name = v.fluxo
where not exists (select 1 from client_flow_categories x where x.flow_id = f.id and x.category_id = v.cat);

-- ── documentos exigidos ───────────────────────────────────────────────────
insert into category_documents (category_id, document_id, required)
select v.cat, v.doc, true from (values
  -- categorias novas
  (500056, 37), (500056, 10002), (500056, 42), (500056, 10006),
  (500057, 37), (500057, 10002), (500057, 42), (500057, 10004), (500057, 18), (500057, 19), (500057, 26), (500057, 58),
  (500058, 37), (500058, 10002), (500058, 42), (500058, 10004), (500058, 18), (500058, 19),
  (500059, 37), (500059, 10002), (500059, 42), (500059, 18), (500059, 19), (500059, 10046), (500059, 10045),
  -- CND Federal nas 23 categorias de Suprimentos existentes
  (500010, 42), (500011, 42), (500012, 42), (500013, 42), (500014, 42), (500015, 42), (500016, 42), (500017, 42), (500054, 42),
  (500018, 42), (500019, 42), (500020, 42), (500021, 42), (500022, 42), (500023, 42), (500024, 42), (500025, 42), (500026, 42),
  (500027, 42), (500028, 42), (500029, 42), (500030, 42), (500031, 42),
  -- Contrato Social em Controle de Pragas e Higienização de Caixas d'Água
  (500025, 39), (500026, 39)
) v(cat, doc)
where exists (select 1 from categories c where c.id = v.cat)
  and not exists (select 1 from category_documents x where x.category_id = v.cat and x.document_id = v.doc);
