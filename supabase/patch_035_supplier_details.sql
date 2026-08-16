-- ============================================================
-- PATCH 035 — Dados completos do fornecedor/cliente (migração sem perda)
-- Fase `details` do migrate_hoc_v2.py:
--   estruturado → supplier_partners, supplier_bank_accounts,
--                 supplier_financials, cnae_list, colunas novas
--   integral    → hoc_extra JSONB (endereços, contatos, anexos,
--                 escopos por contratante, mensagens, termos,
--                 dados bancários históricos, balanços brutos)
-- ============================================================

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS inscricao_estadual  TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS data_abertura       DATE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tipo_empresa        TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email_financeiro    TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS hoc_extra           JSONB;

ALTER TABLE public.clients   ADD COLUMN IF NOT EXISTS hoc_extra           JSONB;

-- Respostas do questionário HOC do processo (JSONB [{questao, resposta}])
ALTER TABLE public.seals     ADD COLUMN IF NOT EXISTS hoc_questionario    JSONB;

-- supplier_partners/bank_accounts: origem da migração
ALTER TABLE public.supplier_partners      ADD COLUMN IF NOT EXISTS hoc_id INTEGER;
ALTER TABLE public.supplier_bank_accounts ADD COLUMN IF NOT EXISTS hoc_id INTEGER;
-- SEM cláusula parcial: on_conflict do PostgREST não infere índice parcial
-- (unique pleno permite múltiplos NULLs no Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS supplier_partners_hoc_unique
  ON public.supplier_partners(hoc_id);
