-- patch_122 — Financeiro: custos da automação (07/10/2026)
--
-- Duas abas novas ao lado de "Custos BC": Captura de documentos (Rota A —
-- auto_collect_jobs) e IA (Rota B — ai_review_jobs). SECURITY DEFINER guardada
-- por is_admin(), mesmo padrão de bc_admin_costs; a aba exige 'acao:custos'.
-- Mês de referência = conclusão da tarefa (finished_at; senão created_at).

CREATE OR REPLACE FUNCTION public.admin_automation_costs(p_meses integer DEFAULT 6)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE desde timestamptz := date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1);
        mes_atual text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN json_build_object(
    'mes_atual', mes_atual,
    'captura', (
      WITH j AS (
        SELECT a.*, to_char(coalesce(a.finished_at, a.created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM') mes,
               coalesce(cl.nome_fantasia, cl.razao_social, 'ELOS (sem cliente)') cliente
        FROM auto_collect_jobs a
        LEFT JOIN seals s ON s.id = a.seal_id
        LEFT JOIN clients cl ON cl.id = s.client_id
        WHERE coalesce(a.finished_at, a.created_at) >= desde)
      SELECT json_build_object(
        'kpi_mes', (SELECT json_build_object(
            'custo', coalesce(sum(cost_brl), 0),
            'pagas', count(*) FILTER (WHERE cost_brl > 0),
            'obtidas', count(*) FILTER (WHERE status = 'done' AND last_error IS NULL),
            'sem_custo', count(*) FILTER (WHERE status = 'done' AND last_error IS NOT NULL),
            'manual', count(*) FILTER (WHERE status = 'fallback'),
            'aguardando', count(*) FILTER (WHERE status IN ('queued','running','retry')))
          FROM j WHERE mes = mes_atual),
        'por_mes_fonte', (SELECT coalesce(json_agg(r ORDER BY r.mes DESC, r.custo DESC), '[]') FROM (
            SELECT mes, coalesce(fonte, '—') fonte, count(*) consultas,
                   count(*) FILTER (WHERE cost_brl > 0) pagas,
                   count(*) FILTER (WHERE status = 'done' AND last_error IS NULL) obtidas,
                   count(*) FILTER (WHERE status = 'fallback') manual,
                   coalesce(sum(cost_brl), 0) custo
            FROM j GROUP BY 1, 2) r),
        'por_cliente', (SELECT coalesce(json_agg(r ORDER BY r.mes DESC, r.custo DESC), '[]') FROM (
            SELECT mes, cliente, count(DISTINCT seal_id) processos, count(*) consultas,
                   coalesce(sum(cost_brl), 0) custo
            FROM j GROUP BY 1, 2) r))),
    'ia', (
      WITH j AS (
        SELECT a.*, to_char(coalesce(a.finished_at, a.created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM') mes
        FROM ai_review_jobs a
        WHERE coalesce(a.finished_at, a.created_at) >= desde)
      SELECT json_build_object(
        'kpi_mes', (SELECT json_build_object(
            'custo', coalesce(sum(cost_brl), 0),
            'analises', count(*) FILTER (WHERE status = 'done'),
            'aguardando', count(*) FILTER (WHERE status IN ('queued','running','retry')),
            'decididas', count(*) FILTER (WHERE analyst_decision IS NOT NULL AND verdict IN ('aprovar','reprovar')),
            'concordou', count(*) FILTER (WHERE (verdict = 'aprovar' AND analyst_decision = 'VALID')
                                            OR (verdict = 'reprovar' AND analyst_decision = 'REJECTED')))
          FROM j WHERE mes = mes_atual),
        'hoje', (SELECT coalesce(sum(cost_brl), 0) FROM ai_review_jobs
                 WHERE finished_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
        'por_mes', (SELECT coalesce(json_agg(r ORDER BY r.mes DESC), '[]') FROM (
            SELECT mes, count(*) FILTER (WHERE status = 'done') analises,
                   count(*) FILTER (WHERE verdict = 'aprovar') aprovar,
                   count(*) FILTER (WHERE verdict = 'reprovar') reprovar,
                   count(*) FILTER (WHERE verdict = 'revisar') revisar,
                   count(*) FILTER (WHERE analyst_decision IS NOT NULL AND verdict IN ('aprovar','reprovar')) decididas,
                   count(*) FILTER (WHERE (verdict = 'aprovar' AND analyst_decision = 'VALID')
                                       OR (verdict = 'reprovar' AND analyst_decision = 'REJECTED')) concordou,
                   coalesce(sum(cost_brl), 0) custo,
                   coalesce(round(avg(cost_brl) FILTER (WHERE status = 'done'), 4), 0) custo_medio
            FROM j GROUP BY 1) r),
        'por_fornecedor', (SELECT coalesce(json_agg(r ORDER BY r.custo DESC), '[]') FROM (
            SELECT sp.cnpj, sp.razao_social, count(*) analises, coalesce(sum(j.cost_brl), 0) custo
            FROM j JOIN suppliers sp ON sp.id = j.supplier_id
            GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 20) r)))
  );
END $fn$;
REVOKE ALL ON FUNCTION public.admin_automation_costs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_automation_costs(integer) TO authenticated;
