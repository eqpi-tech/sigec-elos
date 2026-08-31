-- PATCH 057: contagens EXATAS para métricas do backoffice (RPC)
-- count 'estimated' do PostgREST usava estatísticas defasadas do planner
-- (mostrava 37.196 fornecedores quando o real é ~55.8k). Uma função
-- SECURITY DEFINER conta exato em uma passada, sem custo de RLS.
CREATE OR REPLACE FUNCTION public.admin_metrics() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'suppliers_total',     (SELECT count(*) FROM suppliers),
    'suppliers_new_month', (SELECT count(*) FROM suppliers WHERE created_at >= date_trunc('month', now())),
    -- por status: processos (selos) e fornecedores distintos — os dois números
    'seals_by_status', (
      SELECT coalesce(jsonb_object_agg(status, jsonb_build_object('processos', n, 'fornecedores', d)), '{}'::jsonb)
      FROM (SELECT status, count(*) n, count(DISTINCT supplier_id) d FROM seals GROUP BY status) s)
  ) INTO result;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_metrics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
