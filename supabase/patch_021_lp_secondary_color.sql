-- patch_021_lp_secondary_color.sql
-- Adiciona cor secundária (fundos escuros) à client_landing_pages

ALTER TABLE public.client_landing_pages
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#1B2A4A';

DO $$
BEGIN
  RAISE NOTICE 'patch_021 aplicado: coluna secondary_color adicionada';
END $$;
