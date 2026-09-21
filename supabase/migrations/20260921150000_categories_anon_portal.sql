-- patch_089_categories_anon_portal.sql — HOTFIX demo VIX (21/09)
-- O cadastro pelo portal público travava na etapa de categorias: a policy
-- anon só liberava categorias GLOBAIS (client_id IS NULL), e as matrizes
-- por cliente (VIX 500018+) ficavam invisíveis → seletor vazio. O portal
-- de convite é público por design e as categorias ativas não carregam
-- dado sensível (nome/árvore/CNAE) — anon passa a ler qualquer ativa.
drop policy if exists categories_read_anon on categories;
create policy categories_read_anon on categories
  for select to anon using (active = true);
