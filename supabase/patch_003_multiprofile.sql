-- ════════════════════════════════════════════════════════════════════════════
-- SIGEC-ELOS · Patch 003 — Multi-perfil, impeditivos, aceite de termos
-- Execute no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela de user_roles (1 usuário → N perfis) ───────────────────────────
-- Substitui a coluna role única em profiles por uma tabela many-to-many
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('SUPPLIER','BUYER','ADMIN')),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  buyer_id    UUID REFERENCES public.buyers(id)    ON DELETE SET NULL,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)   -- um usuário só pode ter cada role uma vez
);

-- Migra dados existentes de profiles → user_roles
INSERT INTO public.user_roles (user_id, role, supplier_id, buyer_id, is_primary)
SELECT id, role, supplier_id, buyer_id, TRUE
FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- ── 2. Aceite de termos de uso ─────────────────────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS terms_accepted      BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_sharing_accepted BOOLEAN DEFAULT FALSE;

-- ── 3. Flag de impeditivo nos documentos da categoria ─────────────────────
-- (a coluna 'required' já existe — adicionamos 'blocking')
ALTER TABLE public.category_documents
  ADD COLUMN IF NOT EXISTS blocking BOOLEAN DEFAULT FALSE;

-- Documentos impeditivos padrão (os mais críticos):
-- 37 = Cartão CNPJ, 7 = CRF FGTS, 42 = CND Federal, 8 = CNDT
UPDATE public.category_documents
SET blocking = TRUE
WHERE document_id IN (37, 7, 42, 8)
  AND required = TRUE;

-- ── 4. Notificação de resultado da homologação ───────────────────────────────
ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- ── 5. Categoria customizada (proposta pelo fornecedor) ─────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_custom    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proposed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved     BOOLEAN DEFAULT FALSE;

-- ── 6. RLS para user_roles ───────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_own" ON public.user_roles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin" ON public.user_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur2
            WHERE ur2.user_id = auth.uid() AND ur2.role = 'ADMIN')
  );

-- Anon pode ler (necessário para login multi-perfil)
CREATE POLICY "user_roles_read_anon" ON public.user_roles
  FOR SELECT USING (TRUE);

-- ── 7. Confirma ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Patch 003 aplicado:';
  RAISE NOTICE '   user_roles: %', (SELECT COUNT(*) FROM public.user_roles);
  RAISE NOTICE '   category_documents com blocking=TRUE: %',
    (SELECT COUNT(*) FROM public.category_documents WHERE blocking = TRUE);
END $$;
