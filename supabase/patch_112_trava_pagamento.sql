-- patch_112_trava_pagamento.sql — trava de pagamento (01/10/2026).
--
-- Mudança conceitual em relação ao HOC: no ELOS o fornecedor só usa o
-- sistema (envia documentos, entra na fila de análise, recebe selo) depois do
-- pagamento CONFIRMADO. Cartão/PIX confirmam na hora; boleto só na
-- compensação (webhook async_payment_succeeded). Subsidiado (o cliente paga)
-- é liberado no cadastro. Processos do HOC já entram pagos/subsidiados.
--
-- "Processo liberado" = seals.released_at preenchido. Regras:
--  - HOC (hoc_process_id) e selo ACTIVE: sempre liberados (gatilho abaixo);
--  - pagamento confirmado: o webhook do Stripe libera os processos do fornecedor;
--  - subsidiado: create-supplier / create-checkout liberam na hora.
-- Travas:
--  1. selo NÃO pode virar ACTIVE sem processo liberado (gatilho — vale para
--     auto-finalização, botão do backoffice, qualquer caminho);
--  2. fornecedor sem processo liberado não grava documentos (RLS restritiva);
--  3. a fila de análise só traz fornecedor com processo liberado.
-- Na numeração: 108–111 estão reservados pelos patches do staging.

-- ── 1. coluna + carga inicial ─────────────────────────────────────────────
alter table seals add column if not exists released_at timestamptz;

-- carga: tudo que já existe fica liberado, EXCETO processo ELOS pendente sem
-- pagamento nem subsídio (os casos que a trava existe para segurar)
update seals s set released_at = coalesce(s.issued_at, s.created_at, now())
 where s.released_at is null
   and (   s.hoc_process_id is not null
        or s.status <> 'PENDING'
        or exists (select 1 from plans p where p.supplier_id = s.supplier_id and p.status in ('ACTIVE','PAST_DUE'))
        or exists (select 1 from invitations i
                   where i.subsidiado and (i.supplier_id = s.supplier_id
                         or regexp_replace(coalesce(i.supplier_cnpj,''),'\D','','g') = (select regexp_replace(cnpj,'\D','','g') from suppliers where id = s.supplier_id))
                     and (s.client_id is null or i.client_id = s.client_id)));

-- ── 2. gatilho: HOC/ACTIVE liberam; selo sem liberação não é emitido ─────
create or replace function public.trg_seal_payment_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.released_at is null and new.hoc_process_id is not null then
    new.released_at := coalesce(new.created_at, now());          -- HOC já vem pago/subsidiado
  end if;
  -- subsidiado (o cliente paga): processo do cliente nasce liberado, venha
  -- de onde vier (cadastro, convite em lote, ajuste do backoffice)
  if new.released_at is null and new.client_id is not null and exists (
       select 1 from invitations i
       where i.client_id = new.client_id and i.subsidiado
         and i.status not in ('CANCELLED','SUPERSEDED')
         and (i.supplier_id = new.supplier_id
              or regexp_replace(coalesce(i.supplier_cnpj,''),'\D','','g')
                 = (select regexp_replace(cnpj,'\D','','g') from suppliers where id = new.supplier_id))) then
    new.released_at := now();
  end if;
  if new.status = 'ACTIVE' and new.released_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'ACTIVE') then
    raise exception 'Processo sem pagamento confirmado: o selo não pode ser emitido'
      using errcode = 'P0001', hint = 'payment_lock';
  end if;
  return new;
end $$;

drop trigger if exists trg_seal_payment_lock on seals;
create trigger trg_seal_payment_lock before insert or update of status, released_at, hoc_process_id on seals
  for each row execute function public.trg_seal_payment_lock();

-- convite que vira subsidiado (ou é vinculado ao fornecedor já subsidiado)
-- libera o processo daquele cliente na hora
create or replace function public.trg_invitation_subsidy_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subsidiado and new.supplier_id is not null and new.client_id is not null
     and new.status not in ('CANCELLED','SUPERSEDED') then
    update seals set released_at = now()
     where supplier_id = new.supplier_id and client_id = new.client_id and released_at is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_invitation_subsidy_release on invitations;
create trigger trg_invitation_subsidy_release after insert or update of subsidiado, supplier_id, status on invitations
  for each row execute function public.trg_invitation_subsidy_release();

-- ── 3. fornecedor liberado? (algum processo liberado) ────────────────────
create or replace function public.supplier_access_released(p_supplier uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from seals where supplier_id = p_supplier and released_at is not null)
$$;
grant execute on function public.supplier_access_released(uuid) to authenticated;

-- ── 4. documentos: fornecedor sem processo liberado não grava ────────────
-- política RESTRITIVA (AND com as demais): admin e funções (service_role)
-- continuam podendo; o próprio fornecedor/equipe só após a liberação
drop policy if exists documents_payment_lock_ins on documents;
create policy documents_payment_lock_ins on documents as restrictive for insert to authenticated
  with check ((select is_admin()) or supplier_access_released(supplier_id));
drop policy if exists documents_payment_lock_upd on documents;
create policy documents_payment_lock_upd on documents as restrictive for update to authenticated
  using ((select is_admin()) or supplier_access_released(supplier_id))
  with check ((select is_admin()) or supplier_access_released(supplier_id));

-- ── 5. fila de análise: só fornecedor com processo liberado ──────────────
create or replace function public.analysable_supplier_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct s.supplier_id
  from seals s left join clients c on c.id = s.client_id
  where s.status in ('ACTIVE','PENDING')
    and s.released_at is not null
    and (s.client_id is null or coalesce(c.active, true))
$$;
