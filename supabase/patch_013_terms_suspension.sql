-- patch_013_terms_suspension.sql
-- Termos de uso personalizados por cliente + suspensão de selo pelo cliente

-- ── 1. Termos de uso na tabela clients ──────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS terms_content    TEXT,
  ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ;

-- ── 2. Rastrear aceitação dos termos nas invitations ────────────────────────
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- ── 3. Suspensão de selo pelo cliente (independente do backoffice) ───────────
-- Permite que o cliente suspenda o fornecedor no contexto do seu processo,
-- sem afetar outros selos do fornecedor (ex: com outros clientes)
ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS client_suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_suspended_reason TEXT;

-- ── 4. Índice para busca rápida de termos por cliente ───────────────────────
CREATE INDEX IF NOT EXISTS idx_seals_client_id ON public.seals (client_id);
CREATE INDEX IF NOT EXISTS idx_seals_supplier_status ON public.seals (supplier_id, status);

DO $$
BEGIN
  RAISE NOTICE 'patch_013 aplicado:';
  RAISE NOTICE '   clients: terms_content + terms_updated_at';
  RAISE NOTICE '   invitations: terms_accepted_at';
  RAISE NOTICE '   seals: client_suspended_at + client_suspended_reason';
END $$;
