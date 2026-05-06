-- patch_009_assertiva.sql
-- Armazena resultados da Análise Restritiva (Assertiva Soluções)

CREATE TABLE IF NOT EXISTS assertiva_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID REFERENCES suppliers NOT NULL,
  cnpj          TEXT NOT NULL,
  report_data   JSONB NOT NULL,           -- JSON completo retornado pela API
  protocol      TEXT,                     -- protocolo da consulta (cabecalho.protocolo)
  score_classe  TEXT,                     -- classe A-F extraída para acesso rápido
  score_pontos  INTEGER,                  -- pontos numéricos extraídos
  generated_at  TIMESTAMPTZ DEFAULT now(),
  generated_by  UUID REFERENCES auth.users
);

ALTER TABLE assertiva_reports ENABLE ROW LEVEL SECURITY;

-- ADMIN: acesso total
CREATE POLICY "assertiva_admin" ON assertiva_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Fornecedor: somente o seu próprio relatório
CREATE POLICY "assertiva_supplier_own" ON assertiva_reports
  FOR SELECT USING (
    supplier_id IN (SELECT supplier_id FROM profiles WHERE id = auth.uid())
  );

-- Cliente: leitura dos relatórios de seus fornecedores
CREATE POLICY "assertiva_client_read" ON assertiva_reports
  FOR SELECT USING (
    supplier_id IN (
      SELECT i.supplier_id FROM invitations i
      WHERE i.client_id IN (
        SELECT client_id FROM user_roles WHERE user_id = auth.uid() AND role = 'CLIENT'
      )
      AND i.supplier_id IS NOT NULL
    )
  );

-- Índice para busca por supplier (mais recente primeiro)
CREATE INDEX IF NOT EXISTS assertiva_reports_supplier_idx ON assertiva_reports (supplier_id, generated_at DESC);
