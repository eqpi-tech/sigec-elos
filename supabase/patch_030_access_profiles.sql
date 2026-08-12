-- ============================================================
-- PATCH 030 — Perfis de Acesso Granulares
-- Adiciona `access_profile` em user_roles:
--   full     → acesso completo do papel (padrão, comportamento atual)
--   analyst  → ADMIN: opera análises (fila, documentos, processos)
--              mas não gerencia usuários, clientes ou comunicados
--   readonly → CLIENT: visualiza o painel mas não convida, edita
--              termos/portal nem inativa fornecedores
-- Executar no SQL Editor do Supabase Dashboard.
-- ============================================================

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS access_profile TEXT NOT NULL DEFAULT 'full'
  CHECK (access_profile IN ('full','analyst','readonly'));

COMMENT ON COLUMN user_roles.access_profile IS
  'full = acesso completo | analyst = ADMIN restrito a análises | readonly = CLIENT somente leitura';
