-- patch_072_client_dashboard.sql — Relatórios do CLIENTE (17/09)
-- RPC security definer: dashboard executivo com o ESCOPO do cliente logado
-- (client_id resolvido de user_roles — nunca vem do chamador). Agregações
-- server-side evitam as armadilhas de RLS/perf das tabelas grandes.

create or replace function public.client_exec_dashboard()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare cid uuid; r jsonb;
begin
  select ur.client_id into cid
  from user_roles ur
  where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null
  limit 1;
  if cid is null then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'processos', (
      select jsonb_build_object(
        'em_homologacao', count(*) filter (where status = 'PENDING'),
        'homologados',    count(*) filter (where status = 'ACTIVE'),
        'suspensos',      count(*) filter (where status = 'SUSPENDED'),
        'vencidos',       count(*) filter (where status = 'EXPIRED'
                            or (status = 'ACTIVE' and expires_at < now())),
        'a_vencer_60d',   count(*) filter (where status = 'ACTIVE'
                            and expires_at between now() and now() + interval '60 days'))
      from seals where client_id = cid),
    'fornecedores', (
      select jsonb_build_object(
        'total',     count(distinct supplier_id),
        'novos_30d', count(distinct supplier_id) filter (where created_at >= now() - interval '30 days'))
      from seals where client_id = cid),
    'documentos', (
      with meus as (select distinct supplier_id from seals
                    where client_id = cid and status in ('ACTIVE','PENDING'))
      select jsonb_build_object(
        'vencidos',     count(*) filter (where d.status = 'EXPIRED'
                          or (d.expires_at < now() and d.status in ('VALID','EXPIRING'))),
        'a_vencer_30d', count(*) filter (where d.status in ('VALID','EXPIRING')
                          and d.expires_at between now() and now() + interval '30 days'),
        'em_analise',   count(*) filter (where d.status = 'PENDING'))
      from documents d join meus m on m.supplier_id = d.supplier_id),
    'convites', (
      select jsonb_build_object(
        'total',       count(*),
        'enviados',    count(*) filter (where status = 'SENT'),
        'visualizados',count(*) filter (where status = 'VIEWED'),
        'cadastrados', count(*) filter (where status = 'REGISTERED'),
        'ultimos_30d', count(*) filter (where created_at >= now() - interval '30 days'))
      from invitations where client_id = cid),
    'rfq', (
      select jsonb_build_object(
        'total',       count(distinct q.id),
        'ultimas_30d', count(distinct q.id) filter (where q.created_at >= now() - interval '30 days'),
        'respostas',   count(rr.id))
      from rfqs q left join rfq_responses rr on rr.rfq_id = q.id
      where q.client_id = cid),
    'questionarios', coalesce((
      -- por questionário ativo: homologados que responderam × pendentes
      select jsonb_agg(jsonb_build_object(
        'titulo', t.title, 'respondidos', t.resp, 'nao_respondidos', t.tot - t.resp) order by t.title)
      from (
        select qn.title,
          (select count(distinct s.supplier_id) from seals s
            where s.client_id = cid and s.status = 'ACTIVE') tot,
          (select count(distinct qa.supplier_id)
             from questionnaire_answers qa
             join questionnaire_questions qq on qq.id = qa.question_id
             join seals s on s.supplier_id = qa.supplier_id
                        and s.client_id = cid and s.status = 'ACTIVE'
             where qq.questionnaire_id = qn.id) resp
        from questionnaires qn
        where qn.client_id = cid and qn.active is not false
      ) t), '[]'::jsonb),
    'homologacoes_por_mes', coalesce((
      select jsonb_agg(jsonb_build_object('mes', mes, 'n', n) order by mes)
      from (
        select date_trunc('month', coalesce(issued_at, created_at))::date mes, count(*) n
        from seals
        where client_id = cid and status = 'ACTIVE'
          and coalesce(issued_at, created_at) >= now() - interval '12 months'
        group by 1
      ) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.client_exec_dashboard() from public;
grant execute on function public.client_exec_dashboard() to authenticated;

-- Módulo novo 'relatorios' visível para os perfis CLIENT já configurados
-- (perfis com lista explícita não veriam o menu novo; o editor pode remover)
update access_profiles
set modules = array_append(modules, 'relatorios')
where role_type = 'CLIENT'
  and modules is not null
  and not ('relatorios' = any(modules));
