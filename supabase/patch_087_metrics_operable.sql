-- patch_087_metrics_operable.sql — KPIs de homologação padronizados (20/09)
-- Discrepância reportada: Início 1.146 · Relatórios 1.393 "vigentes" · 976
-- com conta. Causa: selos de CLIENTES DESATIVADOS inflavam as contagens
-- (o HOC desativa o cliente e o selo fica ACTIVE) e os rótulos misturavam
-- selos (1 por cliente) com fornecedores distintos. Regra do negócio nº 8:
-- processo operável = cliente ativo (ou pseudo-cliente ELOS). As duas RPCs
-- passam a contar SÓ o operável; a definição fica igual nas duas telas.

create or replace function public.admin_metrics()
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'suppliers_total',     (SELECT count(*) FROM suppliers),
    'suppliers_new_month', (SELECT count(*) FROM suppliers WHERE created_at >= date_trunc('month', now())),
    -- por status: selos OPERÁVEIS (cliente ativo ou ELOS) e fornecedores distintos
    'seals_by_status', (
      SELECT coalesce(jsonb_object_agg(status, jsonb_build_object('processos', n, 'fornecedores', d)), '{}'::jsonb)
      FROM (
        SELECT s.status, count(*) n, count(DISTINCT s.supplier_id) d
        FROM seals s LEFT JOIN clients c ON c.id = s.client_id
        WHERE c.id IS NULL OR c.active IS NOT FALSE
        GROUP BY s.status) s)
  ) INTO result;
  RETURN result;
END $fn$;

create or replace function public.admin_exec_dashboard()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'fornecedores', jsonb_build_object(
      'total',       (select count(*) from suppliers),
      'migrados',    (select count(*) from suppliers where hoc_id is not null),
      'espontaneos', (select count(*) from suppliers where hoc_id is null),
      'com_conta',   (select count(distinct ur.supplier_id) from user_roles ur
                      where ur.role = 'SUPPLIER' and ur.supplier_id is not null)),
    -- selos operáveis (cliente ativo ou ELOS) + fornecedores distintos ACTIVE
    'selos_por_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select s.status, count(*) n from seals s
            left join clients c on c.id = s.client_id
            where c.id is null or c.active is not false
            group by 1) s), '{}'::jsonb),
    'homologados_fornecedores', (
      select count(distinct s.supplier_id) from seals s
      left join clients c on c.id = s.client_id
      where s.status = 'ACTIVE' and (c.id is null or c.active is not false)),
    'homologados_por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object('cliente', nome, 'n', n) order by n desc)
      from (
        select coalesce(cl.nome_fantasia, cl.razao_social, 'ELOS') nome, count(*) n
        from seals s
        left join clients cl on cl.id = s.client_id
        where s.status = 'ACTIVE' and (cl.id is null or cl.active is not false)
        group by 1 order by 2 desc limit 8
      ) t), '[]'::jsonb),
    'usuarios', (
      select jsonb_build_object(
        'total',      count(*),
        'ativos_30d', count(*) filter (where last_sign_in_at >= now() - interval '30 days'),
        'nunca_logaram', count(*) filter (where last_sign_in_at is null))
      from auth.users),
    'acessos_por_semana', coalesce((
      select jsonb_agg(jsonb_build_object('semana', w, 'n', n) order by w)
      from (
        select date_trunc('week', last_sign_in_at)::date w, count(*) n
        from auth.users
        where last_sign_in_at >= now() - interval '12 weeks'
        group by 1
      ) t), '[]'::jsonb),
    'documentos', (
      select jsonb_build_object(
        'total',     count(*),
        'aprovados', count(*) filter (where status in ('VALID','NOT_APPLICABLE')),
        'aguardando_analise', count(*) filter (where status = 'PENDING'),
        'vencidos',  count(*) filter (where status = 'EXPIRED'))
      from documents),
    'convites', (
      select jsonb_build_object(
        'total', count(*),
        'ultimos_30d', count(*) filter (where created_at >= now() - interval '30 days'))
      from invitations),
    'campanha', (
      select jsonb_build_object(
        'contas', count(*),
        'acessaram', count(*) filter (where last_sign_in_at is not null))
      from auth.users where raw_user_meta_data->>'campanha' is not null)
  ) into r;
  return r;
end $$;
