-- patch_024_buyer_plans.sql
-- Adiciona controle de plano (Free/Pro) para compradores na tabela user_roles

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS buyer_plan          TEXT DEFAULT 'free'
  CHECK (buyer_plan IN ('free','pro'));
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS buyer_plan_expires_at TIMESTAMPTZ;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS buyer_stripe_sub_id   TEXT;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS buyer_stripe_customer_id TEXT;

-- Garantir que todos os BUYERs existentes comecem com 'free'
UPDATE user_roles SET buyer_plan = 'free' WHERE role = 'BUYER' AND buyer_plan IS NULL;
