-- patch_143 — Relatório do cliente com período (15/10/2026)
-- Pedido dos clientes: filtro por data de início e fim no Relatório. O período
-- filtra o que é MOVIMENTO — processos e fornecedores iniciados, convites,
-- cotações e homologações por mês. O que é FOTO do momento (documentos a
-- vencer/vencidos, questionários dos homologados) segue a situação atual.
-- Sem datas = comportamento anterior. A assinatura antiga (sem parâmetros)
-- sai; o navegador chama com ou sem as datas (os parâmetros têm default).

DROP FUNCTION IF EXISTS public.client_exec_dashboard();
CREATE OR REPLACE FUNCTION public.client_exec_dashboard(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
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
          -- sem período: últimos 12 meses; com período: o período
          and coalesce(issued_at, created_at) >= case when p_from is null and p_to is null then now() - interval '12 months' else d0 end
          and coalesce(issued_at, created_at) < d1
        group by 1
      ) t), '[]'::jsonb)
  ) into r;
  return r || jsonb_build_object('periodo', jsonb_build_object('de', p_from, 'ate', p_to));
end $function$;
GRANT EXECUTE ON FUNCTION public.client_exec_dashboard(date, date) TO authenticated;
