-- patch_176 — ⚠️ de pendências do fornecedor na busca (12/11/2026, pedido VIX):
-- cliente (Fornecedores › Meus fornecedores) e backoffice (Busca de processos)
-- veem, sem abrir o processo, se faltam documentos e/ou o questionário.
-- Mesmo critério da entrada na fila do analista (seal_ready_for_analysis,
-- patch_145): só processos em andamento (PENDING), documentos que não são do
-- cliente nem obtidos só pela EQPI, perguntas obrigatórias dos questionários
-- ativos do cliente e a mobilização (pessoas e documentos de PF).

-- contagem das pendências de UM processo
create or replace function public.seal_pending_counts(p_seal uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; req int[]; v_cnpj text; n_docs int := 0; n_quest int := 0; n_pess int := 0; n_mob int := 0;
begin
  select * into s from seals where id = p_seal;
  if not found then return null; end if;
  req := public.seal_required_doc_ids(p_seal);
  select count(*) into n_docs
    from unnest(req) rid join documents_catalog dc on dc.id = rid
   where coalesce(dc.responsibility, 'fornecedor') <> 'cliente'
     and not public.doc_so_eqpi(dc.id)
     and not exists (select 1 from documents d where d.supplier_id = s.supplier_id and d.type = rid::text
                       and public.doc_sent_ok(d.status, d.expires_at));
  if s.client_id is not null then
    select count(*) into n_quest
      from questionnaire_questions qq join questionnaires qn on qn.id = qq.questionnaire_id
     where qn.client_id = s.client_id and qn.active is not false and qq.required
       and not exists (select 1 from questionnaire_answers qa where qa.question_id = qq.id and qa.supplier_id = s.supplier_id);
    select cnpj into v_cnpj from suppliers where id = s.supplier_id;
    -- pessoas que faltam cadastrar nos postos
    select coalesce(sum(greatest(p.qty_people - (select count(*) from mobility_people mp
                                                  where mp.post_id = p.id and mp.active and mp.supplier_id = s.supplier_id), 0)), 0)
      into n_pess
      from mobility_posts p where p.active and p.client_id = s.client_id and p.supplier_cnpj = v_cnpj;
    -- documentos de mobilização (posto e pessoa) não enviados
    select count(*) into n_mob
      from mobility_posts p
      join category_mobility_documents m on m.category_id = p.category_id and m.required
      left join mobility_people mp on m.escopo = 'pessoa' and mp.post_id = p.id and mp.active and mp.supplier_id = s.supplier_id
     where p.active and p.client_id = s.client_id and p.supplier_cnpj = v_cnpj
       and (m.escopo = 'posto' and (m.document_id <> 10017 or p.armado) or m.escopo = 'pessoa' and mp.id is not null)
       and not exists (select 1 from documents d where d.supplier_id = s.supplier_id
                         and d.type = case when m.escopo = 'posto' then 'mob:' || m.document_id || ':s:' || p.id
                                           else 'mob:' || m.document_id || ':p:' || mp.id end
                         and public.doc_sent_ok(d.status, d.expires_at));
  end if;
  return jsonb_build_object('docs', n_docs, 'quest', n_quest, 'pessoas', n_pess, 'mob', n_mob);
end $$;
revoke all on function public.seal_pending_counts(uuid) from public;

-- pendências dos fornecedores da tela: { supplier_id: { docs, quest, pessoas, mob, processos: [...] } }
-- Cliente: só o processo dele (o parâmetro p_client_id é ignorado). ADMIN: todos
-- os clientes, ou só o filtrado (p_client_id).
create or replace function public.pending_flags(p_supplier_ids uuid[], p_client_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; adm boolean := public.is_admin(); r jsonb;
begin
  if adm then cid := p_client_id; else cid := public.report_client_id(null); end if;
  with s as (
    select s.id, s.supplier_id, s.client_id, coalesce(c.nome_fantasia, c.razao_social, 'ELOS') cliente,
           public.seal_pending_counts(s.id) p
      from seals s left join clients c on c.id = s.client_id
     where s.supplier_id = any(p_supplier_ids) and s.status = 'PENDING' and s.client_suspended_at is null
       and (cid is null or s.client_id = cid)
       and (adm or s.client_id = cid)
  ), por as (
    select supplier_id,
           sum((p->>'docs')::int) docs, sum((p->>'quest')::int) quest, sum((p->>'pessoas')::int) pessoas, sum((p->>'mob')::int) mob,
           jsonb_agg(jsonb_build_object('cliente', cliente, 'docs', (p->>'docs')::int, 'quest', (p->>'quest')::int,
                                        'pessoas', (p->>'pessoas')::int, 'mob', (p->>'mob')::int) order by cliente) processos
      from s group by supplier_id
  )
  select coalesce(jsonb_object_agg(supplier_id, jsonb_build_object('docs', docs, 'quest', quest, 'pessoas', pessoas, 'mob', mob, 'processos', processos)), '{}'::jsonb)
    into r from por;
  return r;
end $$;
revoke all on function public.pending_flags(uuid[], uuid) from public;
grant execute on function public.pending_flags(uuid[], uuid) to authenticated;
