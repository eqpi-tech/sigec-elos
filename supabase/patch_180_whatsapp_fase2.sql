-- patch_180 — WhatsApp nos lembretes (Fase 2, 13/11/2026): mensagens, saída e permissões
-- Envio pelo Twilio (lib/whatsapp.js) só quando o modelo estiver APROVADO pela
-- Meta; status (entregue/lido/falha) e respostas chegam pelo whatsapp-webhook.

create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  direcao       text not null default 'saida' check (direcao in ('saida', 'entrada')),
  modelo        text,                 -- 'pendencias' | 'vencidos' (saída)
  numero        text not null,        -- só dígitos: 55 + DDD + 9 dígitos
  supplier_ids  uuid[] not null default '{}',
  seal_ids      uuid[] not null default '{}',
  variaveis     jsonb,
  corpo         text,                 -- texto recebido (entrada)
  twilio_sid    text unique,
  status        text,                 -- queued/sent/delivered/read/failed/undelivered/received
  erro_codigo   text,
  erro_msg      text,
  status_em     timestamptz
);
create index if not exists idx_wa_msg_numero on public.whatsapp_messages(numero, created_at desc);
create index if not exists idx_wa_msg_seals on public.whatsapp_messages using gin (seal_ids);
alter table public.whatsapp_messages enable row level security;
drop policy if exists wa_msg_admin on public.whatsapp_messages;
create policy wa_msg_admin on public.whatsapp_messages for select using ((select public.is_admin()));

-- "SAIR": tira o número de todos os avisos por WhatsApp (todas as empresas com
-- esse celular — informado, de convite ou da Receita). Devolve quantas empresas.
create or replace function public.whatsapp_optout(p_numero text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update suppliers s set whatsapp_optout_at = now()
   where s.whatsapp_optout_at is null
     and (public.celular_br(s.celular_avisos) = p_numero
          or public.celular_br(s.phone) = p_numero
          or s.id in (select i.supplier_id from invitations i where i.supplier_id is not null and public.celular_br(i.telefone) = p_numero));
  get diagnostics n = row_count;
  return n;
end $$;

-- as rotinas do servidor (service_role) precisam executar as funções da Fase 1
revoke all on function public.whatsapp_optout(text) from public, anon, authenticated;
grant execute on function public.whatsapp_optout(text) to service_role;
grant execute on function public.supplier_whatsapp_numero(uuid) to service_role;
grant execute on function public.supplier_sem_acao_desde(uuid, timestamptz) to service_role;
grant execute on function public.whatsapp_previa() to service_role;
