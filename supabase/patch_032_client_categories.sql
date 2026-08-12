-- ============================================================
-- PATCH 032 — Categorias Híbridas (D2)
-- Decisão: árvore global preservada (marketplace) + categorias
-- custom por cliente, visíveis apenas no contexto daquele
-- cliente. Na migração HOC, as árvores dos clientes entram
-- com client_id preenchido — sem fragmentar o marketplace.
-- Executar no SQL Editor do Supabase Dashboard.
-- ============================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_client ON categories(client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN categories.client_id IS
  'NULL = categoria global (árvore ELOS, marketplace). Preenchido = categoria custom do cliente HOC, visível só no contexto dele';

-- Regras de visibilidade (aplicadas na camada de API):
--   marketplace / fornecedor espontâneo  → client_id IS NULL
--   fornecedor convidado por cliente     → global + custom do(s) cliente(s) que o convidaram
--   backoffice                           → tudo
