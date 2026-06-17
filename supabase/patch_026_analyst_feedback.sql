-- patch_026: Melhorias solicitadas pela analista HOC→ELOS
-- Items: inscrição municipal/estadual, quadro societário, sanções manuais, cadastros arquivados

-- ── Item 8: Número de inscrição nos documentos ───────────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS inscription_number TEXT;

-- ── Item 7: Quadro societário extraído/complementado pelo analista ──────────
CREATE TABLE IF NOT EXISTS supplier_partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  tipo          TEXT CHECK (tipo IN ('pf','pj','estrangeiro')),
  cpf_cnpj      TEXT,
  nome          TEXT NOT NULL,
  cargo         TEXT,
  nacionalidade TEXT,
  participacao  NUMERIC(5,2),
  registered_by UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE supplier_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_admin_all" ON supplier_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "sp_supplier_read" ON supplier_partners FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role = 'SUPPLIER' AND ur.supplier_id = supplier_partners.supplier_id
  ));

-- ── Item 9: Sanções CEIS/CNEP registradas manualmente pelo analista ─────────
CREATE TABLE IF NOT EXISTS supplier_sanctions_manual (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  tipo          TEXT,
  data_final    DATE,
  orgao         TEXT,
  uf            CHAR(2),
  registered_by UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE supplier_sanctions_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssm_admin_all" ON supplier_sanctions_manual FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

-- ── Item 10: Arquivamento de cadastros ──────────────────────────────────────
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS archived_by    UUID REFERENCES auth.users(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS archive_reason TEXT;
