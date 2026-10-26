-- patch_160 — Troca para subsidiado AGENDADA quando há boleto em aberto (26/10/2026)
--
-- A Stripe não cancela boleto emitido (fica pagável até vencer, ~3 dias) e
-- boleto pago não tem estorno. Decisão do Luiz: com boleto do ELOS em aberto,
-- o pedido do cliente fica AGENDADO — vence sem pagamento → a troca vale sozinha
-- (webhook async_payment_failed ou conciliação diária); o fornecedor pagou → vale
-- o pagamento dele, o pedido é anulado e o cliente não é cobrado.
alter table invitations
  add column if not exists subsidy_requested_at   timestamptz,
  add column if not exists subsidy_requested_by   uuid,
  add column if not exists subsidy_stripe_session text,
  add column if not exists subsidy_boleto_due     timestamptz,
  add column if not exists subsidy_voided_at      timestamptz;
create index if not exists idx_invitations_subsidy_session
  on invitations (subsidy_stripe_session) where subsidy_stripe_session is not null;
comment on column invitations.subsidy_requested_at is
  'patch_160: o cliente pediu para subsidiar com boleto do ELOS em aberto — aplica quando o boleto vence sem pagamento';
