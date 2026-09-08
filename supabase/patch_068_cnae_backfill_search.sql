-- PATCH 068: CNAE principal preenchido + busca por CNAE com/sem pontuação
UPDATE suppliers SET cnae_main = cnae_list[1]
 WHERE (cnae_main IS NULL OR cnae_main = '') AND array_length(cnae_list,1) >= 1;

CREATE OR REPLACE FUNCTION public.arr_digits(text[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT regexp_replace(array_to_string(coalesce($1, '{}'), ','), '[^0-9,]', '', 'g')
$fn$;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cnae_main_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(cnae_main,''), '[^0-9]', '', 'g')) STORED;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cnae_all_digits text
  GENERATED ALWAYS AS (public.arr_digits(cnae_list)) STORED;
CREATE INDEX IF NOT EXISTS idx_suppliers_cnae_main_trgm ON suppliers USING gin (cnae_main_digits gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_cnae_all_trgm  ON suppliers USING gin (cnae_all_digits gin_trgm_ops);
ANALYZE suppliers;
