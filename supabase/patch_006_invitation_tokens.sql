-- ════════════════════════════════════════════════════════════════════════════
-- SIGEC-ELOS · Patch 006 — Tokens de convite + rastreamento de abertura
-- Execute no Supabase SQL Editor (após patch_005)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Adicionar token único e viewed_at à tabela invitations ─────────────
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS token     UUID UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Backfill: gera tokens para convites existentes que ficaram sem
UPDATE public.invitations
   SET token = gen_random_uuid()
 WHERE token IS NULL;

-- Índice para lookup rápido por token (usado no onboarding)
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);

-- ── 2. Confirma ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Patch 006 aplicado:';
  RAISE NOTICE '   invitations.token adicionado (UUID único por convite)';
  RAISE NOTICE '   invitations.viewed_at adicionado';
  RAISE NOTICE '   Tokens gerados para convites existentes';
END $$;
