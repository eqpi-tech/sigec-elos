-- PATCH 062: índices de performance (busca de fornecedores 8,3s → ms)
-- Diagnóstico 02/09: ilike sem trigram varria 55,8k suppliers;
-- supplier_categories sem índice por categoria varria 87,9k vínculos.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Busca por nome/CNPJ (ilike '%x%') — GIN de trigramas
CREATE INDEX IF NOT EXISTS idx_suppliers_razao_trgm ON suppliers USING gin (razao_social gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj_trgm  ON suppliers USING gin (cnpj gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_status     ON suppliers (status);
CREATE INDEX IF NOT EXISTS idx_suppliers_state      ON suppliers (state);

-- Filtro por categoria (marketplace) — o unique existente só cobre por fornecedor
CREATE INDEX IF NOT EXISTS idx_supplier_categories_category ON supplier_categories (category_id);

-- RPC marketplace_category_suppliers: match de nome cliente↔global
CREATE INDEX IF NOT EXISTS idx_categories_norm_name ON categories (lower(trim(name))) WHERE client_id IS NOT NULL;

-- Funil de selos da busca (varre todos os ACTIVE a cada consulta)
CREATE INDEX IF NOT EXISTS idx_seals_active_funnel ON seals (supplier_id, seal_type, client_id) WHERE status = 'ACTIVE';

ANALYZE suppliers; ANALYZE supplier_categories; ANALYZE categories; ANALYZE seals; ANALYZE documents;
