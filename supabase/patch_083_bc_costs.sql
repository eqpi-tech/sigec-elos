-- patch_083_bc_costs.sql — BC Report, Estágio 10 (20/09)
-- Admin → Custos (handoff §10): total mensal por rota, custo médio por
-- relatório e COGS por CNPJ consultado. SECURITY DEFINER + is_admin(),
-- seguindo o padrão estabelecido do projeto (RLS client-side não escala).

create or replace function bc_admin_costs(p_meses int default 6)
returns jsonb
language sql stable security definer set search_path = public as $$
select case when not (select public.is_admin()) then jsonb_build_object('error','forbidden')
else jsonb_build_object(
  -- custo mensal por rota (Assertiva × Infosimples × grátis)
  'por_mes_rota', (
    select coalesce(jsonb_agg(t order by t.mes desc), '[]'::jsonb) from (
      select to_char(date_trunc('month', sr.created_at), 'YYYY-MM') as mes,
             sr.route as rota,
             round(sum(sr.cost_brl)::numeric, 2) as custo,
             count(*) as consultas,
             count(*) filter (where sr.reused_from is not null) as reusos
      from source_results sr
      where sr.created_at >= date_trunc('month', now()) - (p_meses || ' months')::interval
      group by 1, 2
    ) t
  ),
  -- relatórios por mês/tipo: quantidade, custo médio e total, preço médio
  'por_mes_tipo', (
    select coalesce(jsonb_agg(t order by t.mes desc), '[]'::jsonb) from (
      select to_char(date_trunc('month', rr.created_at), 'YYYY-MM') as mes,
             rr.tipo,
             count(*) as relatorios,
             count(*) filter (where rr.status in ('done','done_partial')) as concluidos,
             round(avg(rr.cost_brl)::numeric, 2) as custo_medio,
             round(sum(rr.cost_brl)::numeric, 2) as custo_total,
             round(avg(rr.price_brl)::numeric, 2) as preco_medio
      from report_requests rr
      where rr.created_at >= date_trunc('month', now()) - (p_meses || ' months')::interval
      group by 1, 2
    ) t
  ),
  -- COGS por CNPJ consultado (top 20 no período) — L4
  'top_cnpjs', (
    select coalesce(jsonb_agg(t order by t.custo desc), '[]'::jsonb) from (
      select rr.cnpj,
             max(coalesce(s.razao_social, '')) as razao_social,
             count(*) as relatorios,
             round(sum(rr.cost_brl)::numeric, 2) as custo,
             round(sum(rr.price_brl)::numeric, 2) as receita
      from report_requests rr
      left join suppliers s on s.cnpj = rr.cnpj
      where rr.created_at >= date_trunc('month', now()) - (p_meses || ' months')::interval
      group by rr.cnpj
      order by 4 desc limit 20
    ) t
  ),
  -- certidões com validade OFICIAL vencendo em até 15 dias (monitoramento)
  'certidoes_vencendo', (
    select coalesce(jsonb_agg(t order by t.valido_ate), '[]'::jsonb) from (
      select distinct on (sr.cnpj, sr.connector)
             sr.cnpj, sr.connector,
             to_char(sr.valid_until, 'YYYY-MM-DD') as valido_ate
      from source_results sr
      where sr.status = 'ok' and sr.route = 'infosimples'
        and sr.valid_until between now() and now() + interval '15 days'
      order by sr.cnpj, sr.connector, sr.created_at desc
    ) t
  )
) end
$$;

grant execute on function bc_admin_costs(int) to authenticated;
