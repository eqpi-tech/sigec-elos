-- ============================================================
-- PATCH 038 — Perfis de Usuário por Módulos
-- O backoffice define perfis (conjuntos de módulos) para usuários
-- de CLIENTES e FORNECEDORES. Cada usuário vincula-se a um perfil;
-- no login a plataforma monta o menu/rotas conforme os módulos.
--
-- Módulos FORNECEDOR: dashboard, documentos, questionario, plano,
--   categorias, meus_dados, clientes_elos, equipe
-- Módulos CLIENTE: dashboard, fornecedores, convites, rfq,
--   questionarios, configuracoes, equipe
-- ============================================================

CREATE TABLE IF NOT EXISTS access_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  role_type  TEXT NOT NULL CHECK (role_type IN ('CLIENT','SUPPLIER')),
  modules    TEXT[] NOT NULL DEFAULT '{}',
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,   -- "Acesso Total" não pode ser editado/excluído
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_type, name)
);

ALTER TABLE access_profiles ENABLE ROW LEVEL SECURITY;

-- Leitura por qualquer autenticado (o login precisa montar o menu)
DROP POLICY IF EXISTS access_profiles_read ON access_profiles;
CREATE POLICY access_profiles_read ON access_profiles
  FOR SELECT TO authenticated USING (true);

-- Escrita apenas ADMIN
DROP POLICY IF EXISTS access_profiles_admin_write ON access_profiles;
CREATE POLICY access_profiles_admin_write ON access_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));

-- Vínculo do usuário ao perfil
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS access_profile_id UUID REFERENCES access_profiles(id) ON DELETE SET NULL;

-- ── Seed: "Acesso Total" por tipo + backfill dos usuários atuais ──
INSERT INTO access_profiles (name, role_type, modules, is_system) VALUES
  ('Acesso Total', 'SUPPLIER',
   ARRAY['dashboard','documentos','questionario','plano','categorias','meus_dados','clientes_elos','equipe'], TRUE),
  ('Acesso Total', 'CLIENT',
   ARRAY['dashboard','fornecedores','convites','rfq','questionarios','configuracoes','equipe'], TRUE)
ON CONFLICT (role_type, name) DO NOTHING;

UPDATE user_roles ur
SET access_profile_id = ap.id
FROM access_profiles ap
WHERE ap.is_system = TRUE
  AND ap.role_type = ur.role
  AND ur.role IN ('CLIENT','SUPPLIER')
  AND ur.access_profile_id IS NULL;
