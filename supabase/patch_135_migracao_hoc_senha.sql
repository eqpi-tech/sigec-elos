-- patch_135 — Link pessoal "Criar minha senha" da migração HOC → ELOS (13/10/2026)
-- O link de recuperação do Supabase dura no máximo ~1 dia; o comunicado 2
-- promete um link válido até a 1ª semana de uso (21/10 na onda A, 25/11 na B).
-- Token próprio, de uso único, guardado no contato da migração (patch_134).
-- Validado só pelo servidor (função migration-set-password, service_role).

ALTER TABLE public.hoc_migration_contacts ADD COLUMN IF NOT EXISTS senha_token        text UNIQUE;
ALTER TABLE public.hoc_migration_contacts ADD COLUMN IF NOT EXISTS senha_token_expira timestamptz;
ALTER TABLE public.hoc_migration_contacts ADD COLUMN IF NOT EXISTS senha_criada_em    timestamptz;  -- senha criada (pelo link ou cadastro próprio)
