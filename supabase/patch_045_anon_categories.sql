-- ============================================================
-- PATCH 045 — Onboarding: anônimo lê a árvore GLOBAL de categorias
-- Bug: a etapa "Categorias" do cadastro roda ANTES da criação da conta,
-- e categories_read exigia authenticated → "Nenhuma categoria encontrada"
-- e o cadastro travava. Anônimo passa a ler SOMENTE categorias globais
-- ativas (client_id IS NULL); as árvores por cliente seguem restritas
-- a usuários autenticados.
-- ============================================================

DROP POLICY IF EXISTS categories_read_anon ON categories;
CREATE POLICY categories_read_anon ON categories
  FOR SELECT TO anon
  USING (client_id IS NULL AND active = true);
