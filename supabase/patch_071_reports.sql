-- patch_071_reports.sql — área Relatórios do backoffice (17/09)
-- Duas RPCs SECURITY DEFINER (padrão admin_metrics): dados que o cliente
-- não alcança via RLS (auth.users) agregados server-side, guard is_admin().

-- 1) Funil da Campanha Primeiro Acesso ------------------------------------
-- Contas criadas pela campanha carregam raw_user_meta_data->>'campanha'.
create or replace function public.admin_campaign_funnel()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'total_contas',   count(*),
    'acessaram',      count(*) filter (where u.last_sign_in_at is not null),
    'acessaram_7d',   count(*) filter (where u.last_sign_in_at >= now() - interval '7 days'),
    'primeiro_envio', min(u.created_at)::date,
    'ultimo_envio',   max(u.created_at)::date
  ) into r
  from auth.users u
  where u.raw_user_meta_data->>'campanha' is not null;

  r := r || jsonb_build_object(
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d, 'criadas', c, 'acessaram', a) order by d)
      from (
        select created_at::date d, count(*) c,
               count(*) filter (where last_sign_in_at is not null) a
        from auth.users
        where raw_user_meta_data->>'campanha' is not null
        group by 1
      ) t), '[]'::jsonb),
    'fornecedores_alcancados', (
      select count(distinct ur.supplier_id)
      from user_roles ur
      join auth.users au on au.id = ur.user_id
      where au.raw_user_meta_data->>'campanha' is not null and ur.supplier_id is not null),
    'fornecedores_acessaram', (
      select count(distinct ur.supplier_id)
      from user_roles ur
      join auth.users au on au.id = ur.user_id
      where au.raw_user_meta_data->>'campanha' is not null
        and au.last_sign_in_at is not null and ur.supplier_id is not null)
  );
  return r;
end $$;

revoke all on function public.admin_campaign_funnel() from public;
grant execute on function public.admin_campaign_funnel() to authenticated;

-- 2) Dashboard executivo do projeto ---------------------------------------
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
    'selos_por_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select status, count(*) n from seals group by 1) s), '{}'::jsonb),
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

revoke all on function public.admin_exec_dashboard() from public;
grant execute on function public.admin_exec_dashboard() to authenticated;
