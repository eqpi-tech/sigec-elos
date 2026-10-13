-- patch_133 — Comprador Pro: decisão das propostas e regra de vigência (13/10/2026)
-- 1. buyer_rfq_decide: o comprador aceita ou recusa a proposta de um
--    fornecedor na própria cotação (mesma regra da client_rfq_decide).
-- 2. my_buyer_is_pro volta à regra simples — plano 'pro' dentro da validade
--    (3 dias de tolerância para atraso do webhook): o stripe-webhook passou a
--    estender buyer_plan_expires_at a cada fatura paga (renovação mensal/anual).
--    Em 13/10 havia 0 compradores Pro em produção.

create or replace function public.my_buyer_is_pro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'BUYER' and coalesce(is_active, true)
      and buyer_plan = 'pro'
      and buyer_plan_expires_at > now() - interval '3 days')
$$;
grant execute on function public.my_buyer_is_pro() to authenticated;

create or replace function public.buyer_rfq_decide(p_response uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ACCEPTED', 'DECLINED') then raise exception 'status inválido'; end if;
  update rfq_responses rr set status = p_status, updated_at = now()
  from rfqs r
  where rr.id = p_response and r.id = rr.rfq_id
    and r.requester_role = 'BUYER' and r.buyer_id = my_buyer_id()
    and (rr.message is not null or rr.price is not null);
  if not found then raise exception 'resposta não encontrada ou ainda sem proposta'; end if;
end $$;
revoke all on function public.buyer_rfq_decide(uuid, text) from public;
grant execute on function public.buyer_rfq_decide(uuid, text) to authenticated;
