-- ── PATCH 004 — Tabela de Convites ────────────────────────────────────────
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.invitations (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id              UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
  supplier_id           UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  buyer_name            TEXT NOT NULL DEFAULT '',
  buyer_email           TEXT NOT NULL DEFAULT '',
  supplier_razao_social TEXT NOT NULL DEFAULT '',
  supplier_cnpj         TEXT NOT NULL DEFAULT '',
  supplier_email        TEXT,
  status                TEXT NOT NULL DEFAULT 'SENT',  -- SENT, VIEWED, REGISTERED
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- RLS: comprador vê apenas seus próprios convites
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_buyer_select"
  ON public.invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.buyer_id = invitations.buyer_id OR profiles.role = 'ADMIN')
    )
  );

-- Service role insere (via Netlify Function)
-- Nenhuma policy de INSERT necessária pois usamos service_role

-- Índice para busca por buyer
CREATE INDEX IF NOT EXISTS idx_invitations_buyer_id     ON public.invitations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invitations_supplier_id  ON public.invitations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at   ON public.invitations(created_at DESC);

SELECT 'Tabela invitations criada com sucesso' AS resultado;
