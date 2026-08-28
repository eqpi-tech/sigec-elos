
-- ============================================================
-- PATCH 051 — Homologação com Exceção (Carta de Exceção do cliente)
-- Regra: documento reprovado/faltante NÃO impede a homologação de uma
-- categoria ESPECÍFICA quando o CLIENTE anexa carta de exceção para ela.
-- O selo fica "Homologado com Exceção" (por categoria); outras categorias
-- podem seguir não homologadas. Paridade HOC: resultado "Aprovado Com Carta".
-- ============================================================

ALTER TABLE supplier_category_approvals ADD COLUMN IF NOT EXISTS client_id    UUID REFERENCES clients(id);
ALTER TABLE supplier_category_approvals ADD COLUMN IF NOT EXISTS letter_path  TEXT;
ALTER TABLE supplier_category_approvals ADD COLUMN IF NOT EXISTS letter_name  TEXT;
ALTER TABLE supplier_category_approvals ADD COLUMN IF NOT EXISTS client_note  TEXT;
ALTER TABLE supplier_category_approvals ADD COLUMN IF NOT EXISTS requested_by UUID;
CREATE UNIQUE INDEX IF NOT EXISTS sca_seal_category_unique
  ON supplier_category_approvals(seal_id, category_id);

ALTER TABLE seals ADD COLUMN IF NOT EXISTS exception      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS exception_note TEXT;

ALTER TABLE supplier_category_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sca_admin_all ON supplier_category_approvals;
CREATE POLICY sca_admin_all ON supplier_category_approvals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));
DROP POLICY IF EXISTS sca_client_own ON supplier_category_approvals;
CREATE POLICY sca_client_own ON supplier_category_approvals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = supplier_category_approvals.client_id));
DROP POLICY IF EXISTS sca_supplier_read ON supplier_category_approvals;
CREATE POLICY sca_supplier_read ON supplier_category_approvals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SUPPLIER' AND ur.supplier_id = supplier_category_approvals.supplier_id));

-- Backfill: 22 selos migrados do HOC com resultado "Aprovado Com Carta"
UPDATE seals SET exception = TRUE,
  exception_note = 'Aprovado Com Carta (migrado do HOC)'
WHERE hoc_resultado ILIKE '%carta%' AND exception = FALSE;
