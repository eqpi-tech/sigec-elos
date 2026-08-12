-- ============================================================
-- PATCH 031 — Configuração mínima do Catálogo de Documentos (D1)
-- Decisão: mínimo viável — apenas responsabilidade de envio e
-- prazo de análise. Flags do HOC não utilizadas (conferência
-- dupla, centralizado por matriz) não são portadas.
-- Executar no SQL Editor do Supabase Dashboard.
-- ============================================================

ALTER TABLE documents_catalog
  ADD COLUMN IF NOT EXISTS responsibility TEXT NOT NULL DEFAULT 'fornecedor'
  CHECK (responsibility IN ('interna','fornecedor','cliente'));

ALTER TABLE documents_catalog
  ADD COLUMN IF NOT EXISTS analysis_sla_days INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN documents_catalog.responsibility IS
  'Quem fornece o documento: interna (auto-coleta EQPI), fornecedor (upload) ou cliente';
COMMENT ON COLUMN documents_catalog.analysis_sla_days IS
  'Prazo em dias corridos entre o envio e a data limite de análise (farol)';

-- Documentos auto-coletados são responsabilidade interna
UPDATE documents_catalog SET responsibility = 'interna' WHERE auto_collect = true;
