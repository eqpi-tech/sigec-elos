-- ============================================================
-- PATCH 039 — Lembretes de convite + Fluxos de Homologação nomeados
--
-- 1) Convites de cliente sem cadastro: lembrete por e-mail a cada
--    3 dias, por até 15 dias (cron diário).
-- 2) Cada cliente pode ter VÁRIOS fluxos de homologação nomeados
--    (ex.: VIX com 3 fluxos, um por categoria de fornecedor).
--    Migra o legado: fluxo manual da Indico (deduplicado) e um
--    "Fluxo HOC (migrado)" por cliente com os documentos derivados
--    das categorias importadas.
-- ============================================================

-- ── 1. Lembretes de convite ─────────────────────────────────
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS reminder_count  INTEGER NOT NULL DEFAULT 0;

-- ── 2. Fluxos nomeados por cliente ──────────────────────────
CREATE TABLE IF NOT EXISTS client_flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

ALTER TABLE client_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_flows_read ON client_flows;
CREATE POLICY client_flows_read ON client_flows
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_flows_admin_write ON client_flows;
CREATE POLICY client_flows_admin_write ON client_flows
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));

-- Cliente gerencia os próprios fluxos (uso futuro nas Configurações)
DROP POLICY IF EXISTS client_flows_own ON client_flows;
CREATE POLICY client_flows_own ON client_flows
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = client_flows.client_id))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = client_flows.client_id));

-- Vínculo dos documentos ao fluxo
-- category_id era do modelo antigo (doc por categoria) — vira opcional
ALTER TABLE client_document_flows ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE client_document_flows ADD COLUMN IF NOT EXISTS flow_id  UUID REFERENCES client_flows(id) ON DELETE CASCADE;
ALTER TABLE client_document_flows ADD COLUMN IF NOT EXISTS blocking BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS client_document_flows_flow_catalog_unique
  ON client_document_flows(flow_id, catalog_id) WHERE flow_id IS NOT NULL;

-- ── 3. Migração do legado ───────────────────────────────────
-- 3a. Fluxo manual existente (Indico, 17k linhas duplicadas por
--     categoria) → "Fluxo Padrão" deduplicado
INSERT INTO client_flows (client_id, name, description)
SELECT DISTINCT f.client_id, 'Fluxo Padrão', 'Migrado da configuração anterior do ELOS'
FROM client_document_flows f WHERE f.flow_id IS NULL
ON CONFLICT (client_id, name) DO NOTHING;

INSERT INTO client_document_flows (client_id, flow_id, catalog_id, required)
SELECT f.client_id, cf.id, f.catalog_id, BOOL_OR(COALESCE(f.required, TRUE))
FROM client_document_flows f
JOIN client_flows cf ON cf.client_id = f.client_id AND cf.name = 'Fluxo Padrão'
WHERE f.flow_id IS NULL
GROUP BY f.client_id, cf.id, f.catalog_id
ON CONFLICT DO NOTHING;

DELETE FROM client_document_flows WHERE flow_id IS NULL;

-- 3b. "Fluxo HOC (migrado)" por cliente: documentos derivados das
--     categorias importadas (desclassificatório → blocking)
INSERT INTO client_flows (client_id, name, description)
SELECT DISTINCT cat.client_id, 'Fluxo HOC (migrado)', 'Documentos derivados das categorias importadas do HOC'
FROM categories cat WHERE cat.client_id IS NOT NULL
ON CONFLICT (client_id, name) DO NOTHING;

INSERT INTO client_document_flows (client_id, flow_id, catalog_id, required, blocking)
SELECT cat.client_id, cf.id, cd.document_id, TRUE, BOOL_OR(COALESCE(cd.blocking, FALSE))
FROM categories cat
JOIN category_documents cd ON cd.category_id = cat.id
JOIN client_flows cf ON cf.client_id = cat.client_id AND cf.name = 'Fluxo HOC (migrado)'
WHERE cat.client_id IS NOT NULL
GROUP BY cat.client_id, cf.id, cd.document_id
ON CONFLICT DO NOTHING;
