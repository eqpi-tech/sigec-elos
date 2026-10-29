-- patch_166 — "Acompanhar" fornecedor: o usuário do cliente escolhe de quem quer
-- receber e-mail sobre o andamento (29/10/2026, pedido VIX — área de Medicina).
-- E-mail NA HORA (decisão do Luiz, sem resumo diário): os gatilhos abaixo põem o
-- evento numa fila e netlify/functions/client-notify.js (a cada 5 min) envia a
-- quem acompanha. A chave é o CNPJ: dá para acompanhar desde o convite, antes do
-- cadastro. Eventos: cadastro concluído, entrada em análise, homologado,
-- reprovado/suspenso. Convite do HOC e processo do HOC de cliente ainda não
-- migrado NÃO geram evento (a sincronia noturna não pode disparar e-mails).
create table if not exists client_supplier_watch (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  client_id  uuid not null references clients(id),
  cnpj       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id, cnpj)
);
alter table client_supplier_watch enable row level security;
drop policy if exists csw_own on client_supplier_watch;
create policy csw_own on client_supplier_watch for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'CLIENT'
      and ur.client_id = client_supplier_watch.client_id and coalesce(ur.is_active, true)));

create table if not exists client_notify_outbox (
  id           bigint generated always as identity primary key,
  client_id    uuid not null,
  cnpj         text not null,
  supplier_id  uuid,
  seal_id      uuid,
  evento       text not null check (evento in ('CADASTRO','EM_ANALISE','HOMOLOGADO','REPROVADO')),
  detalhe      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_cno_pendentes on client_notify_outbox (id) where processed_at is null;
alter table client_notify_outbox enable row level security;    -- só service_role

-- processo do HOC de cliente ainda não migrado: o HOC é dono — sem e-mail daqui
create or replace function public.notify_elegivel(p_client uuid, p_hoc_process integer)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is not null and (p_hoc_process is null
    or exists (select 1 from clients c where c.id = p_client and c.hoc_migrated_at is not null))
$$;

create or replace function public.trg_seal_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnpj text; v_ev text;
begin
  if not public.notify_elegivel(new.client_id, new.hoc_process_id) then return new; end if;
  if tg_op = 'UPDATE' and new.queued_at is not null and old.queued_at is null and new.status = 'PENDING' then v_ev := 'EM_ANALISE';
  elsif new.status = 'ACTIVE' and (tg_op = 'INSERT' or old.status is distinct from 'ACTIVE') then v_ev := 'HOMOLOGADO';
  elsif new.status = 'SUSPENDED' and tg_op = 'UPDATE' and old.status is distinct from 'SUSPENDED' then v_ev := 'REPROVADO';
  end if;
  if v_ev is null then return new; end if;
  select cnpj into v_cnpj from suppliers where id = new.supplier_id;
  if v_cnpj is null or not exists (select 1 from client_supplier_watch w where w.client_id = new.client_id and w.cnpj = v_cnpj) then return new; end if;
  insert into client_notify_outbox (client_id, cnpj, supplier_id, seal_id, evento, detalhe)
  values (new.client_id, v_cnpj, new.supplier_id, new.id, v_ev,
          jsonb_build_object('motivo', coalesce(new.rejection_reason, new.suspended_reason), 'excecao', new.exception));
  return new;
end $$;
drop trigger if exists trg_seal_notify on seals;
create trigger trg_seal_notify after insert or update of status, queued_at on seals
  for each row execute function public.trg_seal_notify();

create or replace function public.trg_invitation_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnpj text;
begin
  if new.hoc_id is not null or new.client_id is null or new.status <> 'REGISTERED' or old.status = 'REGISTERED' then return new; end if;
  v_cnpj := coalesce((select cnpj from suppliers where id = new.supplier_id), public.normalize_cnpj(new.supplier_cnpj));
  if v_cnpj is null or not exists (select 1 from client_supplier_watch w where w.client_id = new.client_id and w.cnpj = v_cnpj) then return new; end if;
  insert into client_notify_outbox (client_id, cnpj, supplier_id, evento, detalhe)
  values (new.client_id, v_cnpj, new.supplier_id, 'CADASTRO', jsonb_build_object('invitation_id', new.id));
  return new;
end $$;
drop trigger if exists trg_invitation_notify on invitations;
create trigger trg_invitation_notify after update of status on invitations
  for each row execute function public.trg_invitation_notify();
