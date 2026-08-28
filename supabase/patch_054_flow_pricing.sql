-- PATCH 054: preço por fluxo + fluxo padrão + convite/selo vinculados ao fluxo
-- Demanda VIX (28/08/2026): cada fluxo (nível) tem preço de homologação —
-- um para convite SUBSIDIADO e outro para NÃO subsidiado (relatório usa
-- invitations.subsidiado para saber qual aplicar). O fluxo viaja:
-- client_flows (preço/padrão) → invitations.flow_id → seals.flow_id.
ALTER TABLE client_flows ADD COLUMN IF NOT EXISTS price numeric(10,2);
ALTER TABLE client_flows ADD COLUMN IF NOT EXISTS price_subsidized numeric(10,2);
ALTER TABLE client_flows ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- No máximo UM fluxo padrão por cliente (destino dos espontâneos)
CREATE UNIQUE INDEX IF NOT EXISTS client_flows_one_default
  ON client_flows(client_id) WHERE is_default;

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES client_flows(id) ON DELETE SET NULL;
ALTER TABLE seals       ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES client_flows(id) ON DELETE SET NULL;
