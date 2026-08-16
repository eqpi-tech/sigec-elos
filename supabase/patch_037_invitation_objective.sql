-- ============================================================
-- PATCH 037 — Objetivo do convite (contato vs homologação)
-- O cliente/comprador escolhe entre "fazer contato" (apresentação)
-- e "solicitar homologação" (processo completo). O e-mail e o
-- fluxo variam conforme o objetivo.
-- ============================================================
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS objetivo TEXT NOT NULL DEFAULT 'homologacao'
  CHECK (objetivo IN ('contato','homologacao'));
