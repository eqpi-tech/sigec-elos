-- PATCH 067: busca de fornecedores do backoffice via RPC (sem RLS por linha)
-- ilike não é leakproof → sob RLS o planner NÃO PODE usar o índice trigram
-- (aplicaria o filtro antes da política) → seq scan 12s → timeout → tela
-- vazia. SECURITY DEFINER: is_admin() checado 1x, busca usa o índice (3ms).
CREATE OR REPLACE FUNCTION public.admin_search_suppliers(q text, show_inactive boolean DEFAULT false)
RETURNS TABLE(id uuid, razao_social text, cnpj text, city text, state text, status text, created_at timestamptz, archived_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE digits text := regexp_replace(coalesce(q,''), '\D', '', 'g');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.id, s.razao_social, s.cnpj, s.city, s.state, s.status, s.created_at, s.archived_at
  FROM suppliers s
  WHERE (show_inactive OR (coalesce(s.status,'') <> 'INACTIVE' AND s.archived_at IS NULL))
    AND (
      (length(digits) >= 8 AND s.cnpj ILIKE '%' || digits || '%')
      OR (length(digits) < 8 AND coalesce(trim(q),'') <> '' AND s.razao_social ILIKE '%' || trim(q) || '%')
      OR coalesce(trim(q),'') = ''
    )
  ORDER BY CASE WHEN coalesce(trim(q),'') = '' THEN NULL ELSE s.razao_social END ASC,
           s.created_at DESC
  LIMIT 200;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_search_suppliers(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_suppliers(text, boolean) TO authenticated;
