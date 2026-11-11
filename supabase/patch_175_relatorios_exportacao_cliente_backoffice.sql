-- patch_175 — Relatórios para exportar e indicadores clicáveis, iguais no
-- cliente e no backoffice (11/11/2026, chamado #755248, pedido da VIX)
--  · report_client_id: o cliente vem do usuário logado; o ADMIN escolhe o cliente
--    (mesmo relatório, mesma estrutura, nos dois ambientes)
--  · client_exec_dashboard / client_documents_status: aceitam p_client_id (só
--    ADMIN); os cálculos não mudam. Questionários passam a trazer o id.
--  · report_terms_acceptance: aceite dos termos por fornecedor × termo
--  · report_questionnaire_answers: todas as respostas de um questionário —
--    no cliente, só perfis com o módulo Compliance (respostas sensíveis)
--  · client_exec_detail: a LISTA por trás de cada indicador dos Relatórios,
--    com o mesmo critério do número exibido
-- Fornecedores considerados (termos e questionário): processo ativo ou em
-- andamento com o cliente, não inativado por ele (decisão do Luiz, 11/11).

create or replace function public.report_client_id(p_client_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare cid uuid;
begin
  if p_client_id is not null and public.is_admin() then return p_client_id; end if;
  select ur.client_id into cid from user_roles ur
   where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null and coalesce(ur.is_active, true)
   limit 1;
  if cid is null then raise exception 'forbidden'; end if;
  return cid;
end $$;
revoke all on function public.report_client_id(uuid) from public;

-- ── visão executiva: mesma função, com o cliente opcional (ADMIN) ───────────
drop function if exists public.client_exec_dashboard(date, date);
CREATE OR REPLACE FUNCTION public.client_exec_dashboard(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cid uuid; r jsonb;
        -- período (15/10): sem datas = tudo; fim inclusivo
        d0 timestamptz := coalesce(p_from::timestamptz, '-infinity'::timestamptz);
        d1 timestamptz := coalesce((p_to + 1)::timestamptz, 'infinity'::timestamptz);
begin
  cid := public.report_client_id(p_client_id);   -- 11/11: backoffice escolhe o cliente (patch_175)

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
      from seals where client_id = cid and created_at >= d0 and created_at < d1),
    'fornecedores', (
      select jsonb_build_object(
        'total',     count(distinct supplier_id),
        'novos_30d', count(distinct supplier_id) filter (where created_at >= now() - interval '30 days'))
      from seals where client_id = cid and created_at >= d0 and created_at < d1),
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
      from invitations where client_id = cid and created_at >= d0 and created_at < d1),
    'rfq', (
      select jsonb_build_object(
        'total',       count(distinct q.id),
        'ultimas_30d', count(distinct q.id) filter (where q.created_at >= now() - interval '30 days'),
        'respostas',   count(rr.id))
      from rfqs q left join rfq_responses rr on rr.rfq_id = q.id
      where q.client_id = cid and q.created_at >= d0 and q.created_at < d1),
    'questionarios', coalesce((
      -- por questionário ativo: homologados que responderam × pendentes
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'titulo', t.title, 'respondidos', t.resp, 'nao_respondidos', t.tot - t.resp) order by t.title)
      from (
        select qn.id, qn.title,
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
          -- sem período: últimos 12 meses; com período: o período
          and coalesce(issued_at, created_at) >= case when p_from is null and p_to is null then now() - interval '12 months' else d0 end
          and coalesce(issued_at, created_at) < d1
        group by 1
      ) t), '[]'::jsonb)
  ) into r;
  return r || jsonb_build_object('periodo', jsonb_build_object('de', p_from, 'ate', p_to));
end $function$;
revoke all on function public.client_exec_dashboard(date, date, uuid) from public;
grant execute on function public.client_exec_dashboard(date, date, uuid) to authenticated;

-- ── status dos documentos: idem ─────────────────────────────────────────────
drop function if exists public.client_documents_status();
create or replace function public.client_documents_status(p_client_id uuid default null)
returns json language sql stable security definer set search_path = public as $$
  with me as (select public.report_client_id(p_client_id) as cid),
  s as (
    select s.id, s.supplier_id, s.status, s.flow_id, s.expires_at, s.rejection_reason, s.suspended_reason
    from seals s join me on s.client_id = me.cid
    where s.status in ('ACTIVE', 'PENDING', 'SUSPENDED') and s.client_suspended_at is null
  ),
  r as (select s.*, unnest(public.seal_required_doc_ids(s.id)) as doc_id from s)
  select coalesce(json_agg(json_build_object(
      'supplier_id', r.supplier_id, 'razao_social', sp.razao_social, 'cnpj', sp.cnpj,
      'seal_id', r.id, 'processo', r.status, 'flow_id', r.flow_id, 'processo_vence', r.expires_at::date,
      'doc_id', r.doc_id, 'documento', coalesce(d.label, dc.name), 'responsavel', dc.responsibility,
      'situacao', coalesce(d.status, 'MISSING'), 'vencimento', d.expires_at::date,
      'enviado_em', coalesce(d.submitted_at, d.created_at), 'analisado_em', d.reviewed_at,
      'motivo', case when d.status = 'REJECTED' then d.review_note end
    ) order by sp.razao_social, coalesce(d.label, dc.name)), '[]'::json)
  from r
  join suppliers sp on sp.id = r.supplier_id
  join documents_catalog dc on dc.id = r.doc_id
  left join documents d on d.supplier_id = r.supplier_id and d.type = r.doc_id::text
$$;
revoke all on function public.client_documents_status(uuid) from public;
grant execute on function public.client_documents_status(uuid) to authenticated;

-- ── aceite dos termos: uma linha por fornecedor × termo ativo ───────────────
create or replace function public.report_terms_acceptance(p_client_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; r jsonb;
begin
  cid := public.report_client_id(p_client_id);
  with forn as (
    select distinct on (s.supplier_id) s.supplier_id, s.status, s.flow_id
      from seals s
     where s.client_id = cid and s.status in ('ACTIVE','PENDING') and s.client_suspended_at is null
     order by s.supplier_id, s.created_at desc
  ),
  itens as (select id, title, version, required, sort from client_terms_items where client_id = cid and active),
  ac as (
    select distinct on (a.supplier_id, a.item_id) a.supplier_id, a.item_id, a.item_version, a.accepted_at, a.accepted_name, a.accepted_email
      from client_term_acceptances a where a.client_id = cid
     order by a.supplier_id, a.item_id, a.item_version desc, a.accepted_at desc
  ),
  acessou as (
    select distinct ur.supplier_id from user_roles ur join auth.users u on u.id = ur.user_id
     where ur.role = 'SUPPLIER' and u.last_sign_in_at is not null and ur.supplier_id in (select supplier_id from forn)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'supplier_id', f.supplier_id, 'razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'processo', f.status,
      'acessou', ace.supplier_id is not null,
      'item_id', i.id, 'termo', i.title, 'versao_atual', i.version, 'obrigatorio', i.required, 'ordem', i.sort,
      'versao_aceita', ac.item_version, 'aceito_em', ac.accepted_at, 'aceito_por', ac.accepted_name, 'aceito_email', ac.accepted_email
    ) order by sp.razao_social, i.sort, i.title), '[]'::jsonb) into r
  from forn f
  join suppliers sp on sp.id = f.supplier_id
  cross join itens i
  left join ac on ac.supplier_id = f.supplier_id and ac.item_id = i.id
  left join acessou ace on ace.supplier_id = f.supplier_id;
  return r;
end $$;
revoke all on function public.report_terms_acceptance(uuid) from public;
grant execute on function public.report_terms_acceptance(uuid) to authenticated;

-- ── respostas de um questionário: fornecedor × pergunta ─────────────────────
create or replace function public.report_questionnaire_answers(p_questionnaire_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; qcid uuid; qtitle text; tem_perfil boolean; mods text[]; r jsonb;
begin
  select client_id, title into qcid, qtitle from questionnaires where id = p_questionnaire_id;
  if qcid is null then raise exception 'not found'; end if;
  if public.is_admin() then
    cid := qcid;
  else
    select ur.client_id, ur.access_profile_id is not null, ap.modules into cid, tem_perfil, mods
      from user_roles ur left join access_profiles ap on ap.id = ur.access_profile_id
     where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null and coalesce(ur.is_active, true)
     limit 1;
    if cid is null or cid <> qcid then raise exception 'forbidden'; end if;
    -- mesma regra de hasModule: sem perfil = acesso total; senão '*' ou 'compliance'
    if tem_perfil and mods is not null and not ('*' = any(mods) or 'compliance' = any(mods)) then
      raise exception 'forbidden';
    end if;
  end if;
  with forn as (
    select distinct on (s.supplier_id) s.supplier_id, s.status, s.flow_id
      from seals s
     where s.client_id = cid and s.status in ('ACTIVE','PENDING') and s.client_suspended_at is null
     order by s.supplier_id, s.created_at desc
  ),
  qs as (select id, text, type, required, order_index, compliance_alert from questionnaire_questions where questionnaire_id = p_questionnaire_id),
  ans as (
    select distinct on (a.supplier_id, a.question_id) a.supplier_id, a.question_id, a.answer_boolean, a.answer_text, a.answered_at, a.replicated_from
      from questionnaire_answers a join qs on qs.id = a.question_id
     where a.supplier_id in (select supplier_id from forn)
     order by a.supplier_id, a.question_id, a.answered_at desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'supplier_id', f.supplier_id, 'razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'processo', f.status,
      'questionario', qtitle, 'question_id', q.id, 'ordem', q.order_index, 'pergunta', q.text, 'obrigatoria', q.required,
      'respondida', a.question_id is not null,
      'resposta', case when q.type = 'boolean' then case a.answer_boolean when true then 'Sim' when false then 'Não' end else a.answer_text end,
      'respondido_em', a.answered_at, 'replicada', a.replicated_from is not null,
      'alerta', q.compliance_alert is not null and a.question_id is not null and (
         (q.type = 'boolean' and
           ((a.answer_boolean is true  and exists (select 1 from unnest(q.compliance_alert) v where upper(v) in ('SIM','TRUE')))
         or (a.answer_boolean is false and exists (select 1 from unnest(q.compliance_alert) v where upper(v) in ('NÃO','NAO','FALSE')))))
         or (q.type <> 'boolean' and a.answer_text is not null
           and exists (select 1 from unnest(q.compliance_alert) v where position(lower(v) in lower(a.answer_text)) > 0)))
    ) order by sp.razao_social, q.order_index), '[]'::jsonb) into r
  from forn f
  join suppliers sp on sp.id = f.supplier_id
  cross join qs q
  left join ans a on a.supplier_id = f.supplier_id and a.question_id = q.id;
  return r;
end $$;
revoke all on function public.report_questionnaire_answers(uuid) from public;
grant execute on function public.report_questionnaire_answers(uuid) to authenticated;

-- ── a lista por trás de cada indicador da visão executiva ───────────────────
-- p_kind: fornecedores | homologados | em_homologacao | suspensos | vencidos |
--   a_vencer_60d | docs_vencidos | docs_a_vencer_30d | docs_em_analise |
--   convites | convites_visualizados | convites_cadastrados |
--   quest_respondidos | quest_nao_respondidos (com p_questionnaire_id)
create or replace function public.client_exec_detail(p_kind text, p_from date default null, p_to date default null,
                                                     p_client_id uuid default null, p_questionnaire_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; r jsonb;
        d0 timestamptz := coalesce(p_from::timestamptz, '-infinity'::timestamptz);
        d1 timestamptz := coalesce((p_to + 1)::timestamptz, 'infinity'::timestamptz);
begin
  cid := public.report_client_id(p_client_id);

  if p_kind in ('fornecedores','homologados','em_homologacao','suspensos','vencidos','a_vencer_60d') then
    with s as (
      select s.* from seals s
       where s.client_id = cid and s.created_at >= d0 and s.created_at < d1
         and case p_kind
               when 'homologados'    then s.status = 'ACTIVE'
               when 'em_homologacao' then s.status = 'PENDING'
               when 'suspensos'      then s.status = 'SUSPENDED'
               when 'vencidos'       then s.status = 'EXPIRED' or (s.status = 'ACTIVE' and s.expires_at < now())
               when 'a_vencer_60d'   then s.status = 'ACTIVE' and s.expires_at between now() and now() + interval '60 days'
               else true end
    ), s2 as (
      -- "fornecedores" conta fornecedores distintos: o processo mais recente de cada um
      select * from s where p_kind <> 'fornecedores'
      union all
      select * from (select distinct on (supplier_id) * from s where p_kind = 'fornecedores' order by supplier_id, created_at desc) x
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'processo', s2.status,
        'vencido', s2.status = 'EXPIRED' or (s2.status = 'ACTIVE' and s2.expires_at < now()),
        'inativado', s2.client_suspended_at is not null, 'flow_id', s2.flow_id,
        'subsidiado', coalesce((select i.subsidiado from invitations i where i.client_id = cid and i.supplier_id = s2.supplier_id
                                 and i.hoc_id is null order by i.created_at desc limit 1), s2.hoc_subsidized, false),
        'iniciado_em', s2.created_at, 'homologado_em', case when s2.status = 'ACTIVE' then s2.issued_at end,
        'validade', s2.expires_at, 'cidade', sp.city, 'uf', sp.state
      ) order by sp.razao_social), '[]'::jsonb) into r
    from s2 join suppliers sp on sp.id = s2.supplier_id;

  elsif p_kind in ('docs_vencidos','docs_a_vencer_30d','docs_em_analise') then
    with meus as (select distinct supplier_id from seals where client_id = cid and status in ('ACTIVE','PENDING'))
    select coalesce(jsonb_agg(jsonb_build_object(
        'razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'documento', coalesce(d.label, dc.name),
        'situacao', d.status, 'vencimento', d.expires_at::date, 'enviado_em', coalesce(d.submitted_at, d.created_at)
      ) order by sp.razao_social, coalesce(d.label, dc.name)), '[]'::jsonb) into r
    from documents d join meus m on m.supplier_id = d.supplier_id
    join suppliers sp on sp.id = d.supplier_id
    left join documents_catalog dc on dc.id::text = d.type
    where case p_kind
            when 'docs_vencidos'     then d.status = 'EXPIRED' or (d.expires_at < now() and d.status in ('VALID','EXPIRING'))
            when 'docs_a_vencer_30d' then d.status in ('VALID','EXPIRING') and d.expires_at between now() and now() + interval '30 days'
            else d.status = 'PENDING' end;

  elsif p_kind in ('convites','convites_visualizados','convites_cadastrados') then
    select coalesce(jsonb_agg(jsonb_build_object(
        'razao_social', i.supplier_razao_social, 'cnpj', i.supplier_cnpj, 'email', i.supplier_email,
        'situacao', i.status, 'flow_id', i.flow_id, 'subsidiado', i.subsidiado, 'enviado_em', i.created_at,
        'lembretes', coalesce(i.reminder_count, 0), 'hoc', i.hoc_id is not null
      ) order by i.created_at desc), '[]'::jsonb) into r
    from invitations i
    where i.client_id = cid and i.created_at >= d0 and i.created_at < d1
      and case p_kind
            when 'convites_visualizados' then i.status in ('VIEWED','REGISTERED')
            when 'convites_cadastrados'  then i.status = 'REGISTERED'
            else true end;

  elsif p_kind in ('quest_respondidos','quest_nao_respondidos') then
    if not exists (select 1 from questionnaires where id = p_questionnaire_id and client_id = cid) then raise exception 'forbidden'; end if;
    with hom as (select distinct supplier_id from seals where client_id = cid and status = 'ACTIVE'),
    resp as (select distinct qa.supplier_id from questionnaire_answers qa
               join questionnaire_questions qq on qq.id = qa.question_id
              where qq.questionnaire_id = p_questionnaire_id)
    select coalesce(jsonb_agg(jsonb_build_object('razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'cidade', sp.city, 'uf', sp.state)
           order by sp.razao_social), '[]'::jsonb) into r
    from hom h join suppliers sp on sp.id = h.supplier_id
    where (p_kind = 'quest_respondidos') = (h.supplier_id in (select supplier_id from resp));
  else
    raise exception 'tipo de detalhe desconhecido: %', p_kind;
  end if;
  return r;
end $$;
revoke all on function public.client_exec_detail(text, date, date, uuid, uuid) from public;
grant execute on function public.client_exec_detail(text, date, date, uuid, uuid) to authenticated;
