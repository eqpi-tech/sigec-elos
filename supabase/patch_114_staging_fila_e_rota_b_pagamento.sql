-- patch_114_staging_fila_e_rota_b_pagamento.sql — STAGING (01/10/2026).
-- Junta o que veio do main (patch_112 trava de pagamento, patch_113 análise
-- prioritária) com o que só existe no staging (patch_109–111, Rota B):
--  1. admin_list_documents com OS DOIS filtros (p_sugestao + p_prioritario) —
--     o patch_113 cria uma 2ª versão e a fila ficaria ambígua;
--  2. Rota B: só entra na fila documento de fornecedor com processo liberado
--     (pagamento confirmado ou subsídio) — a IA tem custo por análise.
-- Na promoção do staging para produção: aplicar DEPOIS de 109, 110, 111 e 113.

drop function if exists public.admin_list_documents(text, text, text, date, text, text, integer, integer, text);
drop function if exists public.admin_list_documents(text, text, text, date, text, text, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.admin_list_documents(p_doc_type text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text, p_queue text DEFAULT 'todos'::text, p_expires_until date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'due_asc'::text, p_page integer DEFAULT 0, p_size integer DEFAULT 50, p_sugestao text DEFAULT NULL::text, p_prioritario boolean DEFAULT false)
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
           -- sugestão da Rota A (fonte oficial) e da Rota B (IA, só a do arquivo atual)
           CASE WHEN d.metadata->>'route' = 'A' THEN d.metadata->'consulta'->>'sugestao' END AS sug_a,
           (SELECT j.verdict FROM ai_review_jobs j
             WHERE j.document_id = d.id AND j.storage_path = d.storage_path AND j.status = 'done'
             ORDER BY j.finished_at DESC NULLS LAST LIMIT 1) AS sug_b,
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
    SELECT * FROM base
    WHERE CASE coalesce(p_sugestao, 'todas')
            WHEN 'A'        THEN sug_a IS NOT NULL
            WHEN 'B'        THEN sug_b IS NOT NULL
            WHEN 'aprovar'  THEN 'aprovar'  IN (sug_a, sug_b)
            WHEN 'reprovar' THEN 'reprovar' IN (sug_a, sug_b)
            WHEN 'revisar'  THEN 'revisar'  IN (sug_a, sug_b)
            WHEN 'nenhuma'  THEN sug_a IS NULL AND sug_b IS NULL
            ELSE true
          END
      AND (NOT coalesce(p_prioritario, false) OR prioridade_em IS NOT NULL)
  ), counted AS (SELECT count(*) AS total FROM filtered),
  paged AS (
    SELECT * FROM filtered
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

-- Rota B: fornecedor sem processo liberado não entra na pré-análise por IA
create or replace function public.trg_ai_review_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'PENDING' or new.storage_path is null
     or coalesce(new.source, 'MANUAL') = 'AUTO'          -- Rota A: veio da fonte oficial
     or new.type !~ '^\d+$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
     and old.status is not distinct from 'PENDING' then
    return new;                                           -- nada de novo para analisar
  end if;
  if not supplier_access_released(new.supplier_id) then
    return new;                                           -- trava de pagamento (patch_112)
  end if;
  if not exists (select 1 from documents_catalog dc
                 where dc.id = new.type::int and dc.route = 'B' and dc.validation_mode <> 'manual') then
    return new;
  end if;
  update ai_review_jobs set status = 'skipped', last_error = 'arquivo substituído pelo fornecedor', finished_at = now()
   where document_id = new.id and status in ('queued','retry') and storage_path <> new.storage_path;
  insert into ai_review_jobs (supplier_id, document_id, doc_type, storage_path)
  values (new.supplier_id, new.id, new.type, new.storage_path)
  on conflict (document_id, storage_path) do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';
