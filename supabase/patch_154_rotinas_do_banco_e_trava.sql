-- patch_154 — Rotinas do banco voltam a poder atualizar o processo (20/10/2026)
--
-- Caso MI Caldeiraria (Chemtrade, processo do ELOS após a virada): ao enviar a
-- CND municipal, o fornecedor recebia "Alteração não permitida: seals só é
-- alterado pelo sistema" e o envio era desfeito. A trava do patch_124 (escrita
-- de usuário final em seals/plans/suppliers) também barrava as ROTINAS DO
-- BANCO disparadas pela ação do usuário — elas rodam com o JWT dele:
--   · etapa do processo (documento, pessoa da mobilidade, questionário)
--   · reabertura do processo reprovado automaticamente (reenvio)
--   · pedido de análise prioritária (cliente)
--   · criação do processo e liberação do subsidiado (convite)
-- Só falhava quando a rotina de fato gravava (ex.: a etapa mudava). Agora
-- essas rotinas marcam app.system_write só em volta da própria gravação; a
-- trava continua barrando qualquer escrita direta do navegador.

CREATE OR REPLACE FUNCTION public.trg_block_end_user_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin()
     AND coalesce(current_setting('app.team_rpc', true), '') <> '1'
     AND coalesce(current_setting('app.system_write', true), '') <> '1' THEN
    RAISE EXCEPTION 'Alteração não permitida: % só é alterado pelo sistema', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_seal_stage(p_seal uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s record; novo text;
begin
  select id, supplier_id, status, hoc_process_id, stage into s from seals where id = p_seal;
  if not found or s.hoc_process_id is not null then return; end if;   -- HOC manda no processo dele
  if s.status <> 'PENDING' then
    novo := null;                                                        -- homologado/reprovado/vencido
  elsif exists (select 1 from auto_collect_jobs j
                where j.seal_id = s.id and j.status in ('queued','running','retry')) then
    novo := 'coleta_automatica';
  elsif seal_ready_for_analysis(s.id) then
    -- tudo enviado; a IA ainda está pré-analisando algum arquivo do fornecedor
    if exists (select 1 from ai_review_jobs r
               where r.supplier_id = s.supplier_id and r.status in ('queued','running','retry')) then
      novo := 'pre_analise';
    else
      novo := 'analise_backoffice';
    end if;
  else
    novo := 'aguardando_fornecedor';
  end if;
  if novo is distinct from s.stage then
    perform set_config('app.system_write', '1', true);   -- patch_154: escrita do próprio sistema
  update seals set stage = novo, stage_changed_at = now() where id = s.id;
  perform set_config('app.system_write', '', true);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.reopen_seal_on_resubmit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- só quando o documento está (re)entrando em análise
  if new.status <> 'PENDING' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'PENDING'
     and old.storage_path is not distinct from new.storage_path then return new; end if;

  perform set_config('app.system_write', '1', true);   -- patch_154: escrita do próprio sistema
  update seals se
     set status = 'PENDING',
         suspended_reason = null,
         updated_at = now()
   where se.supplier_id = new.supplier_id
     and se.status = 'SUSPENDED'
     and se.hoc_process_id is null
     and se.client_suspended_at is null
     and se.suspended_reason ilike 'Homologação reprovada automaticamente%';

  if found then
    insert into audit_log (user_id, action, entity_type, entity_id, metadata)
    values ((select auth.uid()), 'PROCESS_REOPENED', 'supplier', new.supplier_id,
            jsonb_build_object('motivo', 'documento reenviado após reprovação',
                               'document_type', new.type, 'document_label', new.label));
  end if;
  perform set_config('app.system_write', '', true);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.request_priority_analysis(p_seal uuid, p_note text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s record; ja timestamptz;
begin
  select id, supplier_id, client_id, status, released_at, hoc_process_id, priority_requested_at
    into s from seals where id = p_seal;
  if not found then raise exception 'Processo não encontrado'; end if;
  if not (is_admin() or exists (select 1 from user_roles ur
          where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id = s.client_id)) then
    raise exception 'Sem permissão para este processo';
  end if;
  if s.status <> 'PENDING' or (s.released_at is null and s.hoc_process_id is null) then
    raise exception 'Só processos em análise podem ser priorizados';
  end if;
  if s.priority_requested_at is not null then return s.priority_requested_at; end if;
  perform set_config('app.system_write', '1', true);   -- patch_154: escrita do próprio sistema
  update seals set priority_requested_at = now(), priority_requested_by = auth.uid(),
                   priority_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_seal returning priority_requested_at into ja;
  perform set_config('app.system_write', '', true);
  insert into audit_log (user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'PRIORITY_REQUESTED', 'supplier', s.supplier_id,
          jsonb_build_object('seal_id', s.id, 'client_id', s.client_id, 'nota', nullif(trim(coalesce(p_note, '')), '')));
  return ja;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_auto_create_process_seal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Dispara apenas na transição para REGISTERED com client_id preenchido
  IF NEW.status = 'REGISTERED'
     AND NEW.hoc_id IS NULL
     AND NEW.client_id IS NOT NULL
     AND NEW.supplier_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'REGISTERED')
  THEN
    perform set_config('app.system_write', '1', true);   -- patch_154: escrita do próprio sistema
  INSERT INTO public.seals (supplier_id, client_id, status, level, seal_name)
    SELECT
      NEW.supplier_id,
      NEW.client_id,
      'PENDING',
      'Simples',
      'Processo ' || COALESCE(c.razao_social, 'Cliente')
    FROM public.clients c
    WHERE c.id = NEW.client_id
    ON CONFLICT DO NOTHING;
  perform set_config('app.system_write', '', true);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_invitation_subsidy_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.hoc_id is null
     and new.subsidiado and new.supplier_id is not null and new.client_id is not null
     and new.status not in ('CANCELLED','SUPERSEDED') then
    perform set_config('app.system_write', '1', true);   -- patch_154: escrita do próprio sistema
  update seals set released_at = now()
     where supplier_id = new.supplier_id and client_id = new.client_id and released_at is null;
  perform set_config('app.system_write', '', true);
  end if;
  return new;
end $function$;
