-- patch_113_analise_prioritaria.sql — Análise prioritária a pedido do cliente
-- (01/10/2026). No HOC o cliente abria um chamado para pedir urgência; no ELOS
-- ele clica em "Priorizar Análise" (Meus Fornecedores, processos em análise).
-- O pedido marca o processo; no backoffice os prioritários vão para o topo da
-- fila e têm filtro próprio (Análise de Docs e Processos).

alter table seals add column if not exists priority_requested_at timestamptz,
                  add column if not exists priority_requested_by uuid,
                  add column if not exists priority_note text;
create index if not exists idx_seals_priority on seals (supplier_id)
  where priority_requested_at is not null and status = 'PENDING';

-- o cliente pede pela RPC (não tem UPDATE em seals): confere que o processo é
-- do cliente do usuário (ou que é o backoffice) e que está em análise
create or replace function public.request_priority_analysis(p_seal uuid, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
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
  update seals set priority_requested_at = now(), priority_requested_by = auth.uid(),
                   priority_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_seal returning priority_requested_at into ja;
  insert into audit_log (user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'PRIORITY_REQUESTED', 'supplier', s.supplier_id,
          jsonb_build_object('seal_id', s.id, 'client_id', s.client_id, 'nota', nullif(trim(coalesce(p_note, '')), '')));
  return ja;
end $$;
grant execute on function public.request_priority_analysis(uuid, text) to authenticated;

-- fila de análise: coluna/filtro de prioridade e prioritários primeiro
drop function if exists public.admin_list_documents(text, text, text, date, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_documents(p_doc_type text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text, p_queue text DEFAULT 'todos'::text, p_expires_until date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'due_asc'::text, p_page integer DEFAULT 0, p_size integer DEFAULT 50, p_prioritario boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE digits text := regexp_replace(coalesce(p_search,''), '\D', '', 'g');
        types text[] := CASE WHEN coalesce(p_doc_type,'') = '' THEN NULL
                             ELSE string_to_array(p_doc_type, ',') END;
        result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH ready AS (
    SELECT t.sid FROM analysable_supplier_ids() AS t(sid)
    WHERE supplier_ready_for_analysis(t.sid)
  ),
  base AS (
    SELECT d.*, sup.razao_social sup_razao, sup.cnpj sup_cnpj,
           doc_analysis_due(d) AS analysis_due,
           -- análise prioritária pedida pelo cliente (patch_113)
           (SELECT min(se.priority_requested_at) FROM seals se
             WHERE se.supplier_id = d.supplier_id AND se.status = 'PENDING'
               AND se.priority_requested_at IS NOT NULL) AS prioridade_em
    FROM documents d JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.label IS NOT NULL
      AND d.supplier_id IN (SELECT analysable_supplier_ids())
      AND (types IS NULL OR d.type = ANY(types))
      AND (p_expires_until IS NULL OR (d.expires_at IS NOT NULL AND d.expires_at::date <= p_expires_until))
      AND (coalesce(p_search,'') = '' OR
           (length(digits) >= 8 AND sup.cnpj ILIKE '%'||digits||'%') OR
           (length(digits) < 8 AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
      AND CASE coalesce(p_queue,'todos')
            WHEN 'fila'     THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
            WHEN 'passados' THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                 AND doc_analysis_due(d) < current_date
            WHEN 'hoje'     THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                 AND doc_analysis_due(d) = current_date
            WHEN 'futuros'  THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                 AND doc_analysis_due(d) > current_date
            ELSE true
          END
      AND (coalesce(p_status,'todos') = 'todos' OR d.status = p_status)
  ), filtered AS (
    SELECT * FROM base WHERE NOT coalesce(p_prioritario, false) OR prioridade_em IS NOT NULL
  ), counted AS (SELECT count(*) AS total FROM filtered),
  paged AS (
    SELECT * FROM filtered
    -- prioritários primeiro (pedido do cliente), depois a ordenação escolhida
    ORDER BY (prioridade_em IS NULL), prioridade_em,
             CASE WHEN p_sort = 'status' THEN status END,
             CASE WHEN p_sort = 'due_asc'      THEN analysis_due END ASC  NULLS LAST,
             CASE WHEN p_sort = 'expires_asc'  THEN expires_at END ASC  NULLS LAST,
             CASE WHEN p_sort = 'expires_desc' THEN expires_at END DESC NULLS LAST,
             created_at DESC
    OFFSET p_page * p_size LIMIT p_size
  )
  SELECT json_build_object(
    'total', (SELECT total FROM counted),
    'rows',  coalesce((SELECT json_agg(json_build_object(
        'id', p.id, 'type', p.type, 'label', p.label, 'status', p.status,
        'expires_at', p.expires_at, 'created_at', p.created_at,
        'submitted_at', p.submitted_at, 'analysis_due', p.analysis_due,
        'supplier_id', p.supplier_id, 'storage_path', p.storage_path,
        'hoc_arquivo_id', p.hoc_arquivo_id, 'review_note', p.review_note,
        'inscription_number', p.inscription_number, 'metadata', p.metadata,
        'prioridade_em', p.prioridade_em,
        'suppliers', json_build_object('razao_social', p.sup_razao, 'cnpj', p.sup_cnpj),
        'client_names', (SELECT array_agg(DISTINCT coalesce(cl.nome_fantasia, cl.razao_social))
                         FROM seals se JOIN clients cl ON cl.id = se.client_id
                         WHERE se.supplier_id = p.supplier_id AND se.status IN ('ACTIVE','PENDING')
                           AND coalesce(cl.active, true))
      )) FROM paged p), '[]'::json)
  ) INTO result;
  RETURN result;
END $function$;

notify pgrst, 'reload schema';
