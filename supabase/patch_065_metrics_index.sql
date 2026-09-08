-- PATCH 065: índice p/ admin_metrics (dashboard zerava por timeout)
-- 'novos no mês' fazia seq scan em suppliers (9,9s) → RPC 12,8s > timeout
-- ~8s do PostgREST → getMetrics caía no fallback zerado.
CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers (created_at);
ANALYZE suppliers; ANALYZE seals;
