-- ============================================================
-- PATCH 036 — Intenção de Prestação de Serviços (convite reverso)
-- Fornecedor homologado (selo ACTIVE — HOC migrado ou ELOS) declara
-- interesse em prestar serviços para clientes ELOS. O cliente vê o
-- relatório "Fornecedores com intenção" e age (convite, RFQ, contato)
-- ou remove da lista.
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_interests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DISMISSED')),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, client_id)
);

ALTER TABLE supplier_interests ENABLE ROW LEVEL SECURITY;

-- Fornecedor gerencia as próprias intenções (criar, ver, retirar)
DROP POLICY IF EXISTS interests_supplier_all ON supplier_interests;
CREATE POLICY interests_supplier_all ON supplier_interests
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'SUPPLIER'
      AND ur.supplier_id = supplier_interests.supplier_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'SUPPLIER'
      AND ur.supplier_id = supplier_interests.supplier_id
  ));

-- Cliente lê e atualiza (dismiss) as intenções direcionadas a ele
DROP POLICY IF EXISTS interests_client_read ON supplier_interests;
CREATE POLICY interests_client_read ON supplier_interests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
      AND ur.client_id = supplier_interests.client_id
  ));

DROP POLICY IF EXISTS interests_client_update ON supplier_interests;
CREATE POLICY interests_client_update ON supplier_interests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
      AND ur.client_id = supplier_interests.client_id
  ));

-- ADMIN lê tudo
DROP POLICY IF EXISTS interests_admin_read ON supplier_interests;
CREATE POLICY interests_admin_read ON supplier_interests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
  ));
