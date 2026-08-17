-- ============================================================
-- PATCH 043 — Fluxos de CATEGORIAS (modelo correto, paridade HOC)
--
-- Conceito (corrige patch_039, que ligava fluxo→documento direto):
--   · Matriz de Documentos: categoria → N documentos
--     (tabelas existentes: categories(client_id) + category_documents)
--   · Fluxo de Categorias: fluxo → N categorias (novo vínculo)
--     Um cliente pode ter vários fluxos; cada fluxo agrupa categorias;
--     os documentos exigidos derivam das categorias do fluxo.
--
-- client_document_flows (fluxo→doc) permanece só como legado/compat
-- (fallback terciário do runtime, ex.: Fluxo Padrão da Indico).
-- ============================================================

CREATE TABLE IF NOT EXISTS client_flow_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     UUID   NOT NULL REFERENCES client_flows(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, category_id)
);

ALTER TABLE client_flow_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfc_read ON client_flow_categories;
CREATE POLICY cfc_read ON client_flow_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cfc_admin_write ON client_flow_categories;
CREATE POLICY cfc_admin_write ON client_flow_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));

-- ── Migração: fluxos "Fluxo HOC (migrado)" passam a agrupar TODAS as
--    categorias do respectivo cliente (estado equivalente ao atual)
INSERT INTO client_flow_categories (flow_id, category_id)
SELECT cf.id, cat.id
FROM client_flows cf
JOIN categories cat ON cat.client_id = cf.client_id
WHERE cf.name = 'Fluxo HOC (migrado)'
ON CONFLICT (flow_id, category_id) DO NOTHING;
