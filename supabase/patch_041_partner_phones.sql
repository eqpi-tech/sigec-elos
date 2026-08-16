-- ============================================================
-- PATCH 041 — Telefone dos sócios (base legada EQPI)
-- supplier_partners.telefone: backfill via parquet PF por (CNPJ, CPF).
-- Exposição na ficha é SEMPRE via get-supplier-profile (server-side):
--   · CPF mascarado para todos (LGPD)
--   · telefone aberto p/ CLIENT e ADMIN; mascarado p/ BUYER (até existir
--     assinatura de comprador) e SUPPLIER
-- ============================================================

ALTER TABLE supplier_partners ADD COLUMN IF NOT EXISTS telefone TEXT;
