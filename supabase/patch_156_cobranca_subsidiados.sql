-- patch_156 — Cobrança dos subsidiados: entrou na esteira, é cobrável (22/10/2026)
--
-- Regra do Luiz (22/10): processo SUBSIDIADO (o cliente paga) é cobrável ao
-- cliente quando ENTRA NA ESTEIRA — envio de documentos completo (inclusive
-- mobilização) e questionário respondido —, independentemente do resultado da
-- homologação. Escopo: clientes do ELOS (ex.: VIXPAR) e clientes migrados do
-- HOC só com processos que entraram na esteira DEPOIS da migração (Chemtrade);
-- cliente inativado (SPMar) fica fora; clientes ainda no HOC ficam fora.
--   · seals.queued_at: primeira entrada na esteira (etapa pré-análise/análise do
--     backoffice, ou decisão do processo) — não se perde quando o processo avança
--   · seals.hoc_subsidized: processo do HOC subsidiado (gravado na virada)
--   · etapa do processo calculada também para processo do HOC de cliente migrado
--   · admin_subsidized_billing(): o relatório do financeiro

ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS hoc_subsidized boolean;

CREATE OR REPLACE FUNCTION public.trg_seal_queued_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.queued_at IS NULL AND (
       NEW.stage IN ('pre_analise', 'analise_backoffice')
       OR (TG_OP = 'UPDATE' AND OLD.status = 'PENDING'
           AND (NEW.status = 'ACTIVE' OR (NEW.status = 'SUSPENDED' AND NEW.rejection_reason IS NOT NULL)))) THEN
    NEW.queued_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_seal_queued_at ON public.seals;
CREATE TRIGGER trg_seal_queued_at BEFORE INSERT OR UPDATE ON public.seals
  FOR EACH ROW EXECUTE FUNCTION public.trg_seal_queued_at();

CREATE OR REPLACE FUNCTION public.recompute_seal_stage(p_seal uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s record; novo text;
begin
  select se.id, se.supplier_id, se.status, se.hoc_process_id, se.stage, c.hoc_migrated_at into s
    from seals se left join clients c on c.id = se.client_id where se.id = p_seal;
  -- HOC manda no processo dele — exceto cliente já migrado (patch_156: o ELOS é o dono)
  if not found or (s.hoc_process_id is not null and s.hoc_migrated_at is null) then return; end if;
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

CREATE OR REPLACE FUNCTION public.trg_stage_from_supplier()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare sid uuid; forn uuid;
begin
  forn := case tg_table_name when 'documents'             then new.supplier_id
                             when 'mobility_people'       then new.supplier_id
                             when 'questionnaire_answers' then new.supplier_id end;
  -- processo do ELOS e, desde a virada, o do HOC de cliente migrado (patch_156)
  for sid in select se.id from seals se left join clients c on c.id = se.client_id
             where se.supplier_id = forn and se.status = 'PENDING'
               and (se.hoc_process_id is null or c.hoc_migrated_at is not null) loop
    perform recompute_seal_stage(sid);
  end loop;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_subsidized_billing()
RETURNS TABLE(seal_id uuid, client_name text, supplier_name text, cnpj text, flow_name text,
              valor numeric, queued_at timestamptz, status text, resultado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.id, coalesce(c.nome_fantasia, c.razao_social)::text, sp.razao_social::text, sp.cnpj::text, f.name::text,
         coalesce(f.price_subsidized, f.price), s.queued_at, s.status::text,
         CASE WHEN s.status = 'ACTIVE' THEN 'Homologado'
              WHEN s.status = 'SUSPENDED' AND s.rejection_reason IS NOT NULL THEN 'Reprovado'
              WHEN s.status = 'EXPIRED' THEN 'Vencido'
              WHEN s.status = 'PENDING' THEN 'Em análise'
              ELSE s.status END::text
  FROM seals s
  JOIN clients c ON c.id = s.client_id
  JOIN suppliers sp ON sp.id = s.supplier_id
  LEFT JOIN client_flows f ON f.id = s.flow_id
  WHERE s.queued_at IS NOT NULL AND c.active
    AND (c.hoc_id IS NULL OR (c.hoc_migrated_at IS NOT NULL AND s.queued_at >= c.hoc_migrated_at))
    AND (coalesce(s.hoc_subsidized, false) OR EXISTS (
          SELECT 1 FROM invitations i WHERE i.client_id = s.client_id AND i.supplier_id = s.supplier_id
            AND i.subsidiado AND i.hoc_id IS NULL AND i.status NOT IN ('CANCELLED', 'SUPERSEDED')))
  ORDER BY s.queued_at;
END $$;
REVOKE ALL ON FUNCTION public.admin_subsidized_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subsidized_billing() TO authenticated;

-- histórico: quem já está na esteira entrou na última mudança de etapa; quem já
-- foi decidido (homologado/reprovado) entrou até a primeira decisão registrada
UPDATE public.seals SET queued_at = stage_changed_at
 WHERE queued_at IS NULL AND stage IN ('pre_analise', 'analise_backoffice') AND stage_changed_at IS NOT NULL;
UPDATE public.seals s SET queued_at = coalesce((
    SELECT min(a.created_at) FROM audit_log a
     WHERE a.entity_id = s.supplier_id AND a.action IN ('SEAL_APPROVED', 'SEAL_AUTO_APPROVED', 'SEAL_REJECTED', 'SEAL_AUTO_REJECTED')
       AND a.created_at >= coalesce(s.released_at, s.created_at)), s.issued_at, s.updated_at)
 FROM public.clients c
 WHERE c.id = s.client_id AND s.queued_at IS NULL AND s.hoc_process_id IS NULL
   AND (c.hoc_id IS NULL OR c.hoc_migrated_at IS NOT NULL)
   AND (s.status = 'ACTIVE' OR (s.status = 'SUSPENDED' AND s.rejection_reason IS NOT NULL));
