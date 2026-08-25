
-- PATCH 048: plans_type_check aceita os tipos reais do checkout
-- (verificado_mensal/anual, homologado_anual) — o CHECK antigo derrubava
-- SILENCIOSAMENTE a ativação de plano de toda assinatura nova via webhook
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_type_check;
ALTER TABLE plans ADD CONSTRAINT plans_type_check CHECK (type IN
  ('verificado','homologado','verificado_anual','verificado_mensal','homologado_anual','comprador_pro_anual','comprador_pro_mensal'));
