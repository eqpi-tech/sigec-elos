-- PATCH 060: busca por categoria enxerga fornecedores migrados do HOC
-- Problema: o marketplace filtra pela árvore GLOBAL, mas 99,9% dos vínculos
-- (87,9k) apontam para as CÓPIAS POR CLIENTE das categorias (ids 1M+) —
-- a busca só achava 4 fornecedores. A RPC expande as categorias
-- selecionadas para as equivalentes de cliente (match por nome normalizado)
-- e devolve os fornecedores, sem estourar limite de URL do PostgREST.
CREATE OR REPLACE FUNCTION public.marketplace_category_suppliers(cat_ids bigint[])
RETURNS TABLE(supplier_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH sel AS (
    SELECT DISTINCT lower(trim(name)) AS nm FROM categories WHERE id = ANY(cat_ids)
  ), expanded AS (
    SELECT id FROM categories WHERE id = ANY(cat_ids)
    UNION
    SELECT c.id FROM categories c JOIN sel ON lower(trim(c.name)) = sel.nm
    WHERE c.client_id IS NOT NULL
  )
  SELECT DISTINCT sc.supplier_id
  FROM supplier_categories sc
  WHERE sc.category_id IN (SELECT id FROM expanded);
$fn$;
REVOKE ALL ON FUNCTION public.marketplace_category_suppliers(bigint[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marketplace_category_suppliers(bigint[]) TO authenticated, service_role;
