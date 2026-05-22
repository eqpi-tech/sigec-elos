-- patch_019_client_landing_pages.sql
-- Landing pages públicas personalizáveis por cliente

CREATE TABLE IF NOT EXISTS public.client_landing_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  slug         VARCHAR(100) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,

  -- Personalizáveis pelo cliente
  logo_url        TEXT,
  hero_image_url  TEXT,
  accent_color    VARCHAR(7) DEFAULT '#F47E2F',
  description     TEXT,
  compliance_url  TEXT,
  website_url     TEXT,
  linkedin_url    TEXT,
  contact_email   TEXT,
  badges          TEXT[] DEFAULT '{}',

  -- Controle
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_lp_slug ON public.client_landing_pages(slug);

ALTER TABLE public.client_landing_pages ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas de LPs ativas
CREATE POLICY "lp_public_read" ON public.client_landing_pages
  FOR SELECT
  USING (is_active = true);

-- Admin pode tudo
CREATE POLICY "lp_admin_all" ON public.client_landing_pages
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Dono (CLIENT) pode INSERT/UPDATE/DELETE na sua própria LP
CREATE POLICY "lp_owner_write" ON public.client_landing_pages
  FOR ALL
  USING (
    client_id IN (
      SELECT client_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'CLIENT'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE TRIGGER client_landing_pages_updated_at
  BEFORE UPDATE ON public.client_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'patch_019 aplicado: tabela client_landing_pages criada';
END $$;
