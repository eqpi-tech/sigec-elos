-- patch_173 — Chamado #755244: inativar o cadastro da FR MADEIRAS RIO SUL LTDA
-- O quê:  selo do cliente PENDING -> SUSPENDED e fornecedor PENDING -> INACTIVE, com motivo e auditoria
--         (mesma regra do adminApi.suspendSupplier, só para este fornecedor).
-- Por quê: a analista pediu "inativar esse cadastro" depois do patch_172, que deixou o selo em
--         PENDING sem liberação — nessa situação o lembrete diário (pending-docs-reminders) mandaria
--         e-mails de cobrança de pagamento ao fornecedor a partir de 13/11.
--         A tela Homologados não serve: só lista selo ACTIVE/SUSPENDED e, para SUSPENDED, oferece
--         "Reativar", que põe o selo em ACTIVE (homologado).
-- Escopo: UM selo e UM fornecedor, por id. Nada é apagado; convite continua CANCELLED.
--         rejection_reason fica vazio de propósito: é inativação, não reprovação.
-- Notificação: SUSPENDED dispararia o evento "REPROVADO" de trg_seal_notify só se o cliente
--         acompanhasse este CNPJ (client_supplier_watch). Conferido em 11/11: não acompanha (0 linhas).
-- Reexecutar não faz nada (guardas por status). Roda numa transação; divergência aborta tudo.
-- Aplicar no SQL editor do Supabase (produção) só após aprovação do gestor.

begin;

select set_config('app.system_write', '1', true);

do $$
declare
  v_seal   constant uuid := '01e27b20-af15-48b2-a5ff-9d2096257361';
  v_sup    constant uuid := '918b6cc3-5c02-43a4-b575-183b9b41ea9e';
  v_client constant uuid := '78802f94-6dec-4554-af60-71a2b72e3903';
  v_motivo constant text := 'Chamado #755244: cadastro inativado a pedido (convite enviado por engano).';
  n int;
begin
  -- 1) selo: PENDING (não liberado) -> SUSPENDED, mesmo efeito do suspendSupplier
  update seals
     set status = 'SUSPENDED', suspended_reason = v_motivo
   where id = v_seal and supplier_id = v_sup and client_id = v_client
     and status = 'PENDING' and released_at is null;
  get diagnostics n = row_count;
  if n > 1 then raise exception 'chamado 755244: selo — % linhas', n; end if;

  -- 2) fornecedor: PENDING -> INACTIVE
  update suppliers set status = 'INACTIVE' where id = v_sup and status = 'PENDING';
  get diagnostics n = row_count;
  if n > 1 then raise exception 'chamado 755244: fornecedor — % linhas', n; end if;

  -- 3) auditoria (só se algo mudou nesta execução)
  if not exists (select 1 from audit_log where action = 'SUPPLIER_SUSPENDED' and entity_id = v_sup
                    and metadata->>'chamado' = '755244')
     and exists (select 1 from seals s join suppliers p on p.id = s.supplier_id
                  where s.id = v_seal and s.status = 'SUSPENDED' and p.status = 'INACTIVE') then
    insert into audit_log (user_id, action, entity_type, entity_id, metadata)
    values (null, 'SUPPLIER_SUSPENDED', 'supplier', v_sup,
            jsonb_build_object('reason', v_motivo, 'chamado', '755244'));
  end if;
end $$;

-- verificação (esperado: SUSPENDED / INACTIVE / CANCELLED / sem rejection_reason / não liberado)
select s.status as selo, p.status as fornecedor, i.status as convite,
       s.rejection_reason is null as sem_reprovacao, s.released_at is null as nao_liberado
  from seals s
  join suppliers p on p.id = s.supplier_id
  join invitations i on i.id = '15623441-c384-4a8c-9cbf-00a9b5a8fda3'
 where s.id = '01e27b20-af15-48b2-a5ff-9d2096257361';

commit;
