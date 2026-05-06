-- ════════════════════════════════════════════════════════════════════════════
-- SIGEC-ELOS · Patch 005 — Perfil CLIENTE (substituição do HOC)
-- Execute no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela clients ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cnpj          TEXT,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_self_all" ON public.clients
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
    )
  );

-- Trigger updated_at em clients
CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 2. Adicionar client_id ao user_roles ─────────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- ── 3. Ampliar CHECK de role para incluir CLIENT ──────────────────────────────
-- user_roles
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('SUPPLIER','BUYER','ADMIN','CLIENT'));

-- profiles (tabela legada — também precisa aceitar CLIENT)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('SUPPLIER','BUYER','ADMIN','CLIENT'));

-- ── 4. Enriquecer tabela invitations com campos do HOC ───────────────────────
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_fornecedor TEXT CHECK (tipo_fornecedor IN ('produto','servico','ambos')),
  ADD COLUMN IF NOT EXISTS subsidiado      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefone        TEXT,
  ADD COLUMN IF NOT EXISTS contato         TEXT,
  ADD COLUMN IF NOT EXISTS escopo          TEXT,
  ADD COLUMN IF NOT EXISTS invited_by_role TEXT DEFAULT 'BUYER'
    CHECK (invited_by_role IN ('BUYER','CLIENT','ADMIN'));

-- Índice para buscas por client_id
CREATE INDEX IF NOT EXISTS idx_invitations_client_id ON public.invitations(client_id);

-- ── 5. Atualizar RLS de invitations para incluir CLIENT ───────────────────────
-- Remove policy antiga (referenciava profiles, não user_roles)
DROP POLICY IF EXISTS "invitations_buyer_select" ON public.invitations;

-- Nova policy unificada: buyer vê as suas, client vê as suas, admin vê todas
CREATE POLICY "invitations_select"
  ON public.invitations FOR SELECT
  USING (
    -- Admin vê tudo
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
    )
    -- Buyer vê as que ele enviou
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.buyers b ON b.id = ur.buyer_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'BUYER'
        AND b.id = invitations.buyer_id
    )
    -- Client vê as que ele enviou
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'CLIENT'
        AND ur.client_id = invitations.client_id
    )
  );

-- ── 6. Histórico de documentos (preparação Fase 2) ───────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS history     JSONB DEFAULT '[]'::jsonb;

-- ── 7. Confirma ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Patch 005 aplicado:';
  RAISE NOTICE '   Tabela clients criada';
  RAISE NOTICE '   user_roles.client_id adicionado';
  RAISE NOTICE '   user_roles + profiles: role CLIENT permitido';
  RAISE NOTICE '   invitations: 6 colunas HOC adicionadas';
  RAISE NOTICE '   invitations: RLS atualizada para BUYER + CLIENT + ADMIN';
  RAISE NOTICE '   documents: reviewed_at + history adicionados';
END $$;
