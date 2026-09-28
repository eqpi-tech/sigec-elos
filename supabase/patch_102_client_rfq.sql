-- patch_102_client_rfq.sql — RFQ do cliente de ponta a ponta (28/09)
-- Achados: o cliente não conseguia gravar a RFQ (INSERT só p/ comprador), nem
-- ler as próprias RFQs, nem criar/decidir as respostas (só SELECT) — tudo
-- falhava em silêncio; o menu listava as 11,9 mil categorias de todos os
-- clientes; e a política do fornecedor em rfq_responses não amarrava a
-- linha ao fornecedor (qualquer fornecedor lia/alterava tudo).
-- Solução no padrão do projeto (CLAUDE.md §6): RPCs SECURITY DEFINER que
-- validam quem chama; a gravação da RFQ fica na function client-rfq-create.
-- Alcance (decisão do Luiz): o cliente escolhe — 'own' = homologados no
-- processo DELE na categoria; 'elos' = + homologados de qualquer processo
-- operável em categoria de mesmo nome. Idempotente.

alter table rfqs add column if not exists scope text;
alter table rfqs drop constraint if exists rfqs_scope_check;
alter table rfqs add constraint rfqs_scope_check check (scope is null or scope in ('own','elos'));

-- ── segurança: fornecedor só enxerga/altera as PRÓPRIAS respostas ─────────
drop policy if exists rfqr_supplier on rfq_responses;
create policy rfqr_supplier on rfq_responses for all
  using (supplier_id in (select my_supplier_ids()))
  with check (supplier_id in (select my_supplier_ids()));

-- cliente lê as próprias RFQs (sem referência a rfq_responses: evita recursão de RLS)
drop policy if exists rfqs_client_select on rfqs;
create policy rfqs_client_select on rfqs for select
  using (client_id in (select ur.client_id from user_roles ur
                       where ur.user_id = (select auth.uid()) and ur.role = 'CLIENT'));

-- cliente de quem chama (um vínculo CLIENT por usuário)
create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from user_roles where user_id = auth.uid() and role = 'CLIENT' and client_id is not null limit 1
$$;

-- candidatos de uma RFQ (uso interno: service_role / funções abaixo)
create or replace function public.rfq_candidates(p_client uuid, p_category bigint, p_scope text)
returns table(supplier_id uuid, own boolean)
language sql stable security definer set search_path = public as $$
  with proprios as (
    select distinct sc.supplier_id
    from supplier_categories sc
    join seals s on s.supplier_id = sc.supplier_id and s.status = 'ACTIVE' and s.client_id = p_client
    where sc.category_id = p_category
  ), nome as (
    select lower(trim(name)) nm from categories where id = p_category
  ), elos as (
    select distinct sc.supplier_id
    from categories c join nome on lower(trim(c.name)) = nome.nm
    join supplier_categories sc on sc.category_id = c.id
    join seals s on s.supplier_id = sc.supplier_id and s.status = 'ACTIVE'
    left join clients cl on cl.id = s.client_id
    where p_scope = 'elos' and (s.client_id is null or cl.active)    -- só processo operável (§7.8)
  )
  select supplier_id, true from proprios
  union
  select e.supplier_id, false from elos e where e.supplier_id not in (select supplier_id from proprios)
$$;
revoke all on function public.rfq_candidates(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.rfq_candidates(uuid, bigint, text) to service_role;

-- contagem para a tela do cliente: { own, elos }
create or replace function public.client_rfq_counts(p_category bigint)
returns json language plpgsql stable security definer set search_path = public as $$
declare cid uuid := my_client_id();
begin
  if cid is null or not exists (select 1 from categories where id = p_category and client_id = cid) then
    return json_build_object('own', 0, 'elos', 0);
  end if;
  return json_build_object(
    'own',  (select count(*) from rfq_candidates(cid, p_category, 'own')),
    'elos', (select count(*) from rfq_candidates(cid, p_category, 'elos')));
end $$;
grant execute on function public.client_rfq_counts(bigint) to authenticated;

-- respostas de uma RFQ do cliente (nome/CNPJ/cidade — sem contatos)
create or replace function public.client_rfq_responses(p_rfq uuid)
returns table(id uuid, supplier_id uuid, razao_social text, cnpj text, city text, state text,
              status text, message text, price numeric, updated_at timestamptz, own boolean)
language sql stable security definer set search_path = public as $$
  select rr.id, rr.supplier_id, s.razao_social, s.cnpj, s.city, s.state,
         rr.status, rr.message, rr.price, rr.updated_at,
         exists (select 1 from seals se where se.supplier_id = rr.supplier_id and se.client_id = r.client_id and se.status = 'ACTIVE')
  from rfq_responses rr join rfqs r on r.id = rr.rfq_id join suppliers s on s.id = rr.supplier_id
  where rr.rfq_id = p_rfq and (r.client_id = my_client_id() or is_admin())
  order by (rr.message is not null or rr.price is not null) desc, s.razao_social
$$;
grant execute on function public.client_rfq_responses(uuid) to authenticated;

-- cliente aceita/recusa uma resposta recebida
create or replace function public.client_rfq_decide(p_response uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ACCEPTED','DECLINED') then raise exception 'status inválido'; end if;
  update rfq_responses rr set status = p_status, updated_at = now()
  from rfqs r
  where rr.id = p_response and r.id = rr.rfq_id and r.client_id = my_client_id()
    and (rr.message is not null or rr.price is not null);
  if not found then raise exception 'resposta não encontrada ou ainda sem proposta'; end if;
end $$;
grant execute on function public.client_rfq_decide(uuid, text) to authenticated;

-- caixa de entrada do fornecedor
create or replace function public.supplier_rfq_inbox()
returns table(response_id uuid, rfq_id uuid, title text, description text, deadline timestamptz,
              client_name text, category_name text, status text, message text, price numeric,
              created_at timestamptz, supplier_id uuid)
language sql stable security definer set search_path = public as $$
  select rr.id, r.id, r.title, r.description, r.deadline,
         coalesce(cl.nome_fantasia, cl.razao_social), c.name,
         rr.status, rr.message, rr.price, r.created_at, rr.supplier_id
  from rfq_responses rr
  join rfqs r on r.id = rr.rfq_id and r.requester_role = 'CLIENT'
  left join clients cl on cl.id = r.client_id
  left join categories c on c.id = r.category_id
  where rr.supplier_id in (select my_supplier_ids())
  order by r.created_at desc
$$;
grant execute on function public.supplier_rfq_inbox() to authenticated;

-- fornecedor lê (marca como lida) e envia a proposta
create or replace function public.supplier_rfq_respond(p_response uuid, p_message text, p_price numeric, p_only_read boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_only_read then
    update rfq_responses set status = 'READ', updated_at = now()
    where id = p_response and status = 'SENT' and supplier_id in (select my_supplier_ids());
    return;
  end if;
  if coalesce(trim(p_message), '') = '' and p_price is null then raise exception 'informe a proposta ou o valor'; end if;
  update rfq_responses rr set message = nullif(trim(p_message), ''), price = p_price,
         status = case when rr.status = 'SENT' then 'READ' else rr.status end, updated_at = now()
  from rfqs r
  where rr.id = p_response and r.id = rr.rfq_id and rr.supplier_id in (select my_supplier_ids())
    and rr.status in ('SENT','READ') and (r.deadline is null or r.deadline >= now() - interval '1 day');
  if not found then raise exception 'cotação encerrada, já decidida ou não encontrada'; end if;
end $$;
grant execute on function public.supplier_rfq_respond(uuid, text, numeric, boolean) to authenticated;
