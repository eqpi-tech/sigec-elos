-- ============================================================
-- PATCH 040 — Enriquecimento com bases legadas EQPI (PF/PJ do S3)
-- Colunas de auditoria: todo registro tocado pelo enriquecimento
-- recebe enriched_from='legado_eqpi' + enriched_at.
-- Rollback dos sócios: DELETE FROM supplier_partners WHERE enriched_from='legado_eqpi'
-- Rollback dos contatos: backup CSV local gerado antes do UPDATE
-- ============================================================

ALTER TABLE suppliers         ADD COLUMN IF NOT EXISTS enriched_from TEXT;
ALTER TABLE suppliers         ADD COLUMN IF NOT EXISTS enriched_at   TIMESTAMPTZ;
ALTER TABLE supplier_partners ADD COLUMN IF NOT EXISTS enriched_from TEXT;
ALTER TABLE supplier_partners ADD COLUMN IF NOT EXISTS enriched_at   TIMESTAMPTZ;
