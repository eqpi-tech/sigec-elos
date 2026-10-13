-- patch_131_cotacao_comprador.sql — cotação (RFQ) do Comprador Pro chega ao fornecedor (13/10)
-- Achados: o modal do marketplace gravava a RFQ do comprador direto em rfqs
-- (formato antigo: uma linha por fornecedor, buyer_id = id do USUÁRIO e não
-- de buyers → a política rfqs_insert recusava e nada era gravado); mesmo que
-- gravasse, a caixa do fornecedor (supplier_rfq_inbox, patch_102) só lê
-- rfq_responses de RFQs de CLIENTE — a cotação nunca chegava. Não havia
-- checagem de plano Pro no servidor.
-- Solução no padrão do patch_102 (CLAUDE.md §6): RPCs SECURITY DEFINER que
-- validam quem chama. A RFQ do comprador passa a ter o MESMO formato da do
-- cliente: 1 linha em rfqs (requester_role='BUYER', buyer_id) + 1 linha
-- 'SENT' em rfq_responses por fornecedor; o fornecedor responde pela mesma
-- supplier_rfq_respond e o comprador acompanha as respostas.
-- Comprador Pro vigente: user_roles BUYER com buyer_plan='pro' e
-- buyer_plan_expires_at no futuro OU assinatura Stripe ainda viva
-- (buyer_stripe_sub_id) — o stripe-webhook não estende a validade nas
-- renovações mensais; o cancelamento (subscription.deleted) volta para 'free'.
-- Mesma regra em netlify/functions/get-supplier-profile.js (contatos).
-- Idempotente. Não altera a RFQ do cliente.

-- ── comprador de quem chama ─────────────────────────────────────────────────
create or replace function public.my_buyer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select buyer_id from user_roles
      where user_id = auth.uid() and role = 'BUYER' and buyer_id is not null
        and coalesce(is_active, true) limit 1),
    (select id from buyers where user_id = auth.uid() limit 1))
$$;
grant execute on function public.my_buyer_id() to authenticated;

create or replace function public.my_buyer_is_pro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'BUYER' and coalesce(is_active, true)
      and buyer_plan = 'pro'
      and (buyer_plan_expires_at > now() or buyer_stripe_sub_id is not null))
$$;
grant execute on function public.my_buyer_is_pro() to authenticated;

-- ── gravação direta pelo navegador: não há mais (tudo pela RPC abaixo) ──────
drop policy if exists rfqs_insert on rfqs;

-- fornecedor: só LÊ as próprias linhas de rfq_responses; proposta/leitura vão
-- pela supplier_rfq_respond (SECURITY DEFINER). Antes (FOR ALL) ele podia
-- inserir uma linha para qualquer rfq_id e ler a RFQ de outro pela caixa.
drop policy if exists rfqr_supplier on rfq_responses;
create policy rfqr_supplier on rfq_responses for select
  using (supplier_id in (select my_supplier_ids()));

-- ── comprador Pro envia a cotação para os fornecedores selecionados ─────────
-- retorna { rfq_id, fornecedores }
create or replace function public.buyer_rfq_send(p_supplier_ids uuid[], p_title text,
                                                 p_description text, p_deadline date default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  bid uuid := my_buyer_id();
  rid uuid;
  n   int;
  ttl text := coalesce(nullif(trim(p_title), ''), 'Solicitação de cotação');
begin
  if bid is null then raise exception 'Apenas compradores enviam esta cotação'; end if;
  if not my_buyer_is_pro() then raise exception 'Cotações são exclusivas do plano Comprador Pro'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Descreva o que você precisa'; end if;
  if p_deadline is not null and p_deadline < current_date then raise exception 'O prazo não pode estar no passado'; end if;
  select count(distinct x) into n from unnest(p_supplier_ids) x;
  if n = 0 then raise exception 'Selecione ao menos um fornecedor'; end if;
  if n > 200 then raise exception 'Máximo de 200 fornecedores por cotação'; end if;

  insert into rfqs (buyer_id, requester_role, title, category, description, message, deadline, status)
  values (bid, 'BUYER', left(ttl, 200), left(ttl, 200), trim(p_description), trim(p_description),
          p_deadline::timestamptz, 'SENT')
  returning id into rid;

  insert into rfq_responses (rfq_id, supplier_id, status)
  select rid, s.id, 'SENT' from suppliers s
  where s.id in (select distinct x from unnest(p_supplier_ids) x)
  on conflict (rfq_id, supplier_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nenhum fornecedor válido selecionado'; end if;

  return json_build_object('rfq_id', rid, 'fornecedores', n);
end $$;
revoke all on function public.buyer_rfq_send(uuid[], text, text, date) from public, anon;
grant execute on function public.buyer_rfq_send(uuid[], text, text, date) to authenticated;

-- ── cotações do comprador (com contagem de respostas) ───────────────────────
create or replace function public.buyer_rfq_list()
returns table(id uuid, title text, description text, deadline timestamptz, created_at timestamptz,
              fornecedores int, lidas int, propostas int)
language sql stable security definer set search_path = public as $$
  select r.id, coalesce(r.title, r.category), coalesce(r.description, r.message), r.deadline, r.created_at,
         count(rr.id)::int,
         count(rr.id) filter (where rr.status <> 'SENT')::int,
         count(rr.id) filter (where rr.message is not null or rr.price is not null)::int
  from rfqs r left join rfq_responses rr on rr.rfq_id = r.id
  where r.requester_role = 'BUYER' and r.buyer_id = my_buyer_id()
  group by r.id
  order by r.created_at desc
$$;
grant execute on function public.buyer_rfq_list() to authenticated;

-- respostas de uma cotação do comprador (nome/CNPJ/cidade — contatos ficam
-- no perfil do fornecedor, que aplica a regra de máscara no servidor)
create or replace function public.buyer_rfq_responses(p_rfq uuid)
returns table(id uuid, supplier_id uuid, razao_social text, cnpj text, city text, state text,
              status text, message text, price numeric, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rr.id, rr.supplier_id, s.razao_social, s.cnpj, s.city, s.state,
         rr.status, rr.message, rr.price, rr.updated_at
  from rfq_responses rr join rfqs r on r.id = rr.rfq_id join suppliers s on s.id = rr.supplier_id
  where rr.rfq_id = p_rfq and r.requester_role = 'BUYER'
    and (r.buyer_id = my_buyer_id() or is_admin())
  order by (rr.message is not null or rr.price is not null) desc, s.razao_social
$$;
grant execute on function public.buyer_rfq_responses(uuid) to authenticated;

-- ── caixa do fornecedor: RFQs de cliente E de comprador ─────────────────────
-- client_name = empresa solicitante (cliente ou comprador); requester_role
-- diz qual. Muda o tipo de retorno → drop + create.
drop function if exists public.supplier_rfq_inbox();
create function public.supplier_rfq_inbox()
returns table(response_id uuid, rfq_id uuid, title text, description text, deadline timestamptz,
              client_name text, category_name text, status text, message text, price numeric,
              created_at timestamptz, supplier_id uuid, requester_role text)
language sql stable security definer set search_path = public as $$
  select rr.id, r.id, coalesce(r.title, r.category), coalesce(r.description, r.message), r.deadline,
         case when r.requester_role = 'BUYER' then b.razao_social
              else coalesce(cl.nome_fantasia, cl.razao_social) end,
         coalesce(c.name, case when r.requester_role = 'BUYER' then 'Marketplace' end),
         rr.status, rr.message, rr.price, r.created_at, rr.supplier_id, r.requester_role
  from rfq_responses rr
  join rfqs r on r.id = rr.rfq_id and r.requester_role in ('CLIENT', 'BUYER')
  left join clients cl on cl.id = r.client_id
  left join buyers b on b.id = r.buyer_id
  left join categories c on c.id = r.category_id
  where rr.supplier_id in (select my_supplier_ids())
  order by r.created_at desc
$$;
grant execute on function public.supplier_rfq_inbox() to authenticated;
