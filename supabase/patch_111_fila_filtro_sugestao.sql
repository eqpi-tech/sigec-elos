-- patch_111_fila_filtro_sugestao.sql — Fila de análise: filtro por sugestão
-- da automação (29/09). p_sugestao: 'A' (Rota A — fonte oficial), 'B' (Rota B
-- — IA), 'aprovar' / 'reprovar' / 'revisar' (qualquer rota), 'nenhuma'.
-- Rota B conta só a análise do arquivo ATUAL do documento.
-- Depende do patch_109 (ai_review_jobs). Aplicar PRIMEIRO no staging.
drop function if exists public.admin_list_documents(text, text, text, date, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_documents(p_doc_type text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text, p_queue text DEFAULT 'todos'::text, p_expires_until date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'due_asc'::text, p_page integer DEFAULT 0, p_size integer DEFAULT 50, p_sugestao text DEFAULT NULL::text)
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
             ORDER BY j.finished_at DESC NULLS LAST LIMIT 1) AS sug_b
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
  ), counted AS (SELECT count(*) AS total FROM filtered),
  paged AS (
    SELECT * FROM filtered
    ORDER BY CASE WHEN p_sort = 'status' THEN status END,
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
