-- patch_025_supplier_searchable_fields.sql
-- Adiciona colunas para filtros avançados no marketplace do Comprador

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS capital_social   NUMERIC(18,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS simples_nacional BOOLEAN;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS latitude         NUMERIC(10,7);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS longitude        NUMERIC(10,7);

-- Backfill a partir da consulta CNPJ mais recente por fornecedor
-- Os dados ficam em cnpj_consultations.cnpj_data (JSONB), não na tabela suppliers

UPDATE suppliers s
SET capital_social = (
  SELECT (cc.cnpj_data->>'capital_social')::numeric
  FROM cnpj_consultations cc
  WHERE cc.supplier_id = s.id
    AND cc.cnpj_data->>'capital_social' IS NOT NULL
  ORDER BY cc.consulted_at DESC
  LIMIT 1
)
WHERE s.capital_social IS NULL;

UPDATE suppliers s
SET simples_nacional = (
  SELECT CASE
    WHEN (cc.cnpj_data->>'opcao_pelo_simples') = 'true'
         AND (cc.cnpj_data->>'data_exclusao_do_simples') IS NULL THEN true
    WHEN (cc.cnpj_data->>'opcao_pelo_simples') = 'false' THEN false
    ELSE NULL
  END
  FROM cnpj_consultations cc
  WHERE cc.supplier_id = s.id
    AND cc.cnpj_data->>'opcao_pelo_simples' IS NOT NULL
  ORDER BY cc.consulted_at DESC
  LIMIT 1
)
WHERE s.simples_nacional IS NULL;
