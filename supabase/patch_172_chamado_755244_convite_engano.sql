-- patch_172 — Chamado #755244: convite enviado por engano (FR MADEIRAS RIO SUL LTDA)
-- O quê:  cancela o convite já "Cadastrado" e leva o selo do cliente de "Suprimentos – Nível 3"
--         (reprovado/suspenso) para "Suprimentos – Nível 2", de volta a PENDING.
-- Por quê: o cliente errou o nível e o modelo (não subsidiado); a tela e a função de cancelar
--         recusam convite REGISTERED, e o fornecedor já tem cadastro, login e 2 documentos VALID
--         que devem ser aproveitados (nada é apagado).
-- Escopo: UM convite, UM selo, UM fornecedor — tudo por id. Reexecutar não faz nada (guardas por status).
-- Fora do patch (decisão do gestor): subsidiar ou não. Selo continua sem released_at (não liberado).
-- Aplicar no SQL editor do Supabase (produção) só após aprovação do gestor. Roda numa transação:
-- qualquer divergência de contagem aborta tudo.
-- Obs.: o patch_171 existe só na branch staging; por isso este é o 172.

begin;

-- sessão de manutenção: o guard de escrita de usuário final não se aplica ao SQL editor,
-- mas isto deixa explícito que é uma correção feita pelo sistema
select set_config('app.system_write', '1', true);

do $$
declare
  v_inv     constant uuid := '15623441-c384-4a8c-9cbf-00a9b5a8fda3';
  v_seal    constant uuid := '01e27b20-af15-48b2-a5ff-9d2096257361';
  v_sup     constant uuid := '918b6cc3-5c02-43a4-b575-183b9b41ea9e';
  v_client  constant uuid := '78802f94-6dec-4554-af60-71a2b72e3903';
  v_flow_n2 constant uuid := '960ceddd-ada8-48b1-9c90-04e28266f92d';  -- Suprimentos – Nível 2
  v_motivo  constant text := 'Chamado #755244: convite enviado por engano (nível e modelo incorretos). Cancelado pelo backoffice para novo cadastro correto.';
  n int;
begin
  -- confere que o fluxo Nível 2 é deste cliente e está ativo
  perform 1 from client_flows where id = v_flow_n2 and client_id = v_client and active;
  if not found then raise exception 'chamado 755244: fluxo Nível 2 não encontrado/ativo para o cliente'; end if;

  -- 1) convite REGISTERED -> CANCELLED (o token fica, para rastreabilidade; HOC nunca é tocado)
  update invitations
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = null, cancel_reason = v_motivo
   where id = v_inv and status = 'REGISTERED' and hoc_id is null
     and client_id = v_client and supplier_id = v_sup;
  get diagnostics n = row_count;
  if n = 1 then
    insert into audit_log (user_id, action, entity_type, entity_id, metadata)
    values (null, 'INVITATION_CANCELLED', 'invitation', v_inv,
            jsonb_build_object('client_id', v_client, 'status_anterior', 'REGISTERED', 'motivo', v_motivo, 'chamado', '755244'));
  elsif n > 1 then raise exception 'chamado 755244: convite — % linhas', n;
  end if;   -- n = 0: já cancelado numa execução anterior

  -- 2) selo: fluxo Nível 2 e volta para análise (mesma regra do revertSeal; rejection_reason
  --    é limpo pelo trigger trg_seal_clear_rejection quando o status deixa de ser SUSPENDED)
  update seals
     set flow_id = v_flow_n2, status = 'PENDING', suspended_reason = null, issued_at = null
   where id = v_seal and supplier_id = v_sup and client_id = v_client
     and released_at is null and status = 'SUSPENDED';
  get diagnostics n = row_count;
  if n = 1 then
    insert into audit_log (user_id, action, entity_type, entity_id, metadata)
    values (null, 'SEAL_REVERTED', 'supplier', v_sup,
            jsonb_build_object('reason', v_motivo, 'flow_id', v_flow_n2, 'chamado', '755244'));
  elsif n > 1 then raise exception 'chamado 755244: selo — % linhas', n;
  end if;
end $$;

-- verificação (o resultado deve mostrar: CANCELLED / PENDING / Suprimentos – Nível 2)
select i.status as convite, s.status as selo, f.name as fluxo, s.released_at is null as nao_liberado
  from invitations i
  join seals s on s.id = '01e27b20-af15-48b2-a5ff-9d2096257361'
  left join client_flows f on f.id = s.flow_id
 where i.id = '15623441-c384-4a8c-9cbf-00a9b5a8fda3';

commit;
