-- PATCH 056: preços ELOS configuráveis (app_settings) + backfill de fluxos
-- Antes hardcoded no código (Onboarding/BuyerPlan/create-checkout).
-- ATENÇÃO: os valores exibidos devem refletir os preços dos produtos no
-- Stripe (as assinaturas cobram pelo price ID; aqui é exibição + one-time).
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_read ON app_settings;
CREATE POLICY app_settings_read ON app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS app_settings_admin_write ON app_settings;
CREATE POLICY app_settings_admin_write ON app_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));

INSERT INTO app_settings (key, value) VALUES ('elos_prices', '{
  "verificado_mensal": 29,
  "verificado_anual": 199,
  "homologado_anual": 690,
  "comprador_pro_mensal": 199,
  "comprador_pro_anual": 1990
}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Fluxos ainda sem NENHUM preço (fora da tabela enviada em 28/08) →
-- preço do ELOS Homologado nas duas modalidades
UPDATE client_flows SET price = 690, price_subsidized = 690
 WHERE price IS NULL AND price_subsidized IS NULL;
