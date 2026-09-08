-- PATCH 063: estado do onboarding guiado por usuário
-- {done: {stepId: true}, skipped: bool} — persistido p/ passos concluídos
-- não voltarem em outro navegador/dispositivo.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;
