-- patch_158 — Fila e Farol: tarefas da EQPI sem arquivo voltam a aparecer (23/10/2026)
--
-- Luiz: processos com a validação do CNAE pendente não apareciam na fila e
-- ficavam parados (a equipe não entra processo a processo). O patch_153 passou
-- a exigir arquivo para o documento entrar na fila — certo para o que o
-- fornecedor envia ou a fonte oficial devolve, mas a Análise de CNAEs (61), o
-- CEIS (12), a Inscrição Estadual feita à mão (15) e o relatório de crédito
-- (578) são trabalho do analista e nunca têm arquivo. Entram de novo os
-- documentos de responsabilidade 'interna' com validação 'manual'. Os
-- coletados pela fonte oficial (FGTS, CNDT, CND...) continuam exigindo arquivo.

CREATE OR REPLACE FUNCTION public.admin_document_farol()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH
  -- 16/10 (patch_145): fila POR PROCESSO — o documento entra se algum processo
  -- que o exige está na fila (seal_in_queue); antes era o fornecedor inteiro
  qseals AS (
    SELECT s.id, s.supplier_id, s.client_id, public.seal_required_doc_ids(s.id) AS req
    FROM seals s
    WHERE s.supplier_id IN (SELECT DISTINCT dd.supplier_id FROM documents dd
                            WHERE dd.status = 'PENDING' AND dd.supplier_id IN (SELECT analysable_supplier_ids()))
      AND public.seal_in_queue(s.id)
  ),
  queued AS (
    SELECT DISTINCT d.id AS doc_id FROM documents d JOIN qseals q ON q.supplier_id = d.supplier_id
    WHERE d.status = 'PENDING' AND public.doc_relevant(q.client_id, q.req, d.type)
      -- patch_153: só o que tem arquivo para analisar (Farol, 20/10)
      -- patch_158: + tarefa da EQPI que não tem arquivo por natureza (interna
      -- e manual: Análise de CNAEs, CEIS, Inscrição Estadual, relatório de crédito)
      AND (d.storage_path IS NOT NULL OR d.hoc_arquivo_id IS NOT NULL
           OR d.type IN (SELECT dc.id::text FROM documents_catalog dc
                         WHERE dc.responsibility = 'interna' AND dc.validation_mode = 'manual'))
  ),
  docs AS (
    SELECT d.id, d.label, d.expires_at, d.status, d.supplier_id,
           doc_analysis_due(d) AS analysis_due,
           json_build_object('razao_social', sup.razao_social, 'cnpj', sup.cnpj) AS suppliers
    FROM documents d
    JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.id IN (SELECT doc_id FROM queued)
  )
  SELECT json_build_object(
    'passados', coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due <  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json),
    'hoje',     coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due =  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json),
    'futuros',  coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due >  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json)
  ) INTO result;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_list_documents(p_doc_type text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text, p_queue text DEFAULT 'todos'::text, p_expires_until date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'due_asc'::text, p_page integer DEFAULT 0, p_size integer DEFAULT 50, p_sugestao text DEFAULT NULL::text, p_prioritario boolean DEFAULT false, p_client text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cnpj_q  text    := public.normalize_cnpj(p_search);   -- patch_129: CNPJ alfanumérico
        is_cnpj boolean := public.looks_like_cnpj(p_search);
        types text[] := CASE WHEN coalesce(p_doc_type,'') = '' THEN NULL
                             ELSE string_to_array(p_doc_type, ',') END;
        result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH
  -- 16/10 (patch_145): fila POR PROCESSO — o documento entra se algum processo
  -- que o exige está na fila (seal_in_queue); antes era o fornecedor inteiro
  qseals AS (
    SELECT s.id, s.supplier_id, s.client_id, public.seal_required_doc_ids(s.id) AS req
    FROM seals s
    WHERE s.supplier_id IN (SELECT DISTINCT dd.supplier_id FROM documents dd
                            WHERE dd.status = 'PENDING' AND dd.supplier_id IN (SELECT analysable_supplier_ids()))
      AND public.seal_in_queue(s.id)
  ),
  queued AS (
    SELECT DISTINCT d.id AS doc_id FROM documents d JOIN qseals q ON q.supplier_id = d.supplier_id
    WHERE d.status = 'PENDING' AND public.doc_relevant(q.client_id, q.req, d.type)
      -- patch_153: só o que tem arquivo para analisar (Farol, 20/10)
      -- patch_158: + tarefa da EQPI que não tem arquivo por natureza (interna
      -- e manual: Análise de CNAEs, CEIS, Inscrição Estadual, relatório de crédito)
      AND (d.storage_path IS NOT NULL OR d.hoc_arquivo_id IS NOT NULL
           OR d.type IN (SELECT dc.id::text FROM documents_catalog dc
                         WHERE dc.responsibility = 'interna' AND dc.validation_mode = 'manual'))
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
           (is_cnpj AND sup.cnpj ILIKE '%'||cnpj_q||'%') OR
           -- busca com letras que "parece CNPJ" (ex.: "Posto 2000") também procura no nome
           ((NOT is_cnpj OR p_search ~ '[A-Za-z]') AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
      AND CASE coalesce(p_queue,'todos')
            WHEN 'fila'     THEN d.status = 'PENDING' AND d.id IN (SELECT doc_id FROM queued)
            WHEN 'passados' THEN d.status = 'PENDING' AND d.id IN (SELECT doc_id FROM queued)
                                 AND doc_analysis_due(d) < current_date
            WHEN 'hoje'     THEN d.status = 'PENDING' AND d.id IN (SELECT doc_id FROM queued)
                                 AND doc_analysis_due(d) = current_date
            WHEN 'futuros'  THEN d.status = 'PENDING' AND d.id IN (SELECT doc_id FROM queued)
                                 AND doc_analysis_due(d) > current_date
            ELSE true
          END
      AND (coalesce(p_status,'todos') = 'todos' OR d.status = p_status)
      -- cliente do processo (patch_123): uuid do cliente ou '__ELOS__' (selo sem
      -- cliente); considera processos ativos/em análise do fornecedor
      AND (coalesce(p_client,'') = ''
           OR (p_client = '__ELOS__' AND EXISTS (SELECT 1 FROM seals se
                 WHERE se.supplier_id = d.supplier_id AND se.client_id IS NULL
                   AND se.status IN ('ACTIVE','PENDING')))
           OR EXISTS (SELECT 1 FROM seals se
                 WHERE se.supplier_id = d.supplier_id AND se.client_id::text = p_client
                   AND se.status IN ('ACTIVE','PENDING')))
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
