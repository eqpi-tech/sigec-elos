-- patch_094_perf_indexes.sql — preparação rollout holding (24/09)
-- supplier_partners (161k linhas) não tinha índice em supplier_id: toda
-- leitura de sócios (cadastro, perfil, BC Report) fazia seq scan de 59MB
-- (3,9–4,5s medidos no pg_stat_statements; 3ms depois do índice).
-- Aplicado em produção com CREATE INDEX CONCURRENTLY em 24/09.
create index if not exists idx_supplier_partners_supplier
  on supplier_partners (supplier_id);
