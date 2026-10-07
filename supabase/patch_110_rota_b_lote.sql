-- patch_110_rota_b_lote.sql — Rota B pelo modo lote da API (50% do preço).
-- O processador envia os arquivos da fila num lote e recolhe o resultado nas
-- rodadas seguintes; o job fica 'running' com o batch_id enquanto espera.
-- Aplicar PRIMEIRO no staging (depende do patch_109).
alter table ai_review_jobs add column if not exists batch_id     text,
                           add column if not exists submitted_at timestamptz;
create index if not exists idx_ai_review_jobs_batch
  on ai_review_jobs (batch_id) where status = 'running';
