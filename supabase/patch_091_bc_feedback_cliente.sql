-- patch_091_bc_feedback_cliente.sql — BC Report, feedback de cliente (23/09)
-- Novas fontes do Full: contratos com o Governo Federal (Transparência),
-- Dívida Ativa da União (PGFN Devedores) e Falência/Recuperação Judicial
-- (Banco Nacional TST — cobertura nacional). Entradas INERTES até o deploy
-- do código (plano = catálogo ∩ conectores implementados). TSE: ingestão
-- passa a aceitar MÚLTIPLOS zips (2022 + 2024).
insert into bc_config (key, value) values
  ('connector:gov_contratos',  '{"route":"free","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"Contratos com o Governo Federal","api":"contratos/cpf-cnpj"}'),
  ('connector:pgfn_devedores', '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.06,"enabled":true,"in_light":false,"in_full":true,"nome":"Divida Ativa da Uniao (PGFN Devedores)","api":"receita-federal/pgfn/devedores"}'),
  ('connector:falencia_rj',    '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.06,"enabled":true,"in_light":false,"in_full":true,"nome":"Falencia/Recuperacao Judicial (Banco Nacional TST)","api":"tribunal/tst/banco-falencias"}')
on conflict (key) do nothing;

update bc_config set value = value || '{"urls":["https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip","https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip"],"nota":"candidaturas 2022+2024; multiplos zips somam na mesma carga"}'::jsonb
 where key = 'ingest:tse';
