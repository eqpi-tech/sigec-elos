-- patch_145 — Fila por processo, reenvio com versões e histórico com arquivo (16/10/2026)
--
-- Regras aprovadas pelo Luiz (16/10):
-- 1) O processo só entra na fila do backoffice quando o fornecedor enviou TUDO
--    o que é dele no processo — documentos PJ (inclusive o interno que a EQPI
--    não conseguiu captar), questionário e mobilidade (pessoas e PF). Por
--    PROCESSO: sem o atalho "já tem algum homologado/HOC" e sem misturar os
--    processos de clientes diferentes. Reprovado ou vencido não conta como enviado.
-- 2) Antes da fila o fornecedor pode trocar qualquer documento já enviado;
--    com o processo na fila, só reenvia o reprovado (ou renova o que vence).
--    Cada envio é uma nova versão — o histórico guarda o arquivo de cada uma.
-- 3) Histórico com o arquivo de cada versão para backoffice, fornecedor e cliente.

ALTER TABLE public.document_history ADD COLUMN IF NOT EXISTS hoc_arquivo_id bigint;

-- documento enviado = em análise, dispensado, ou aprovado ainda dentro da validade
CREATE OR REPLACE FUNCTION public.doc_sent_ok(p_status text, p_expires timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('PENDING','NOT_APPLICABLE')
      OR (p_status IN ('VALID','EXPIRING') AND (p_expires IS NULL OR p_expires >= now()))
$$;

-- processo completo do lado do fornecedor (por processo, patch_145)
CREATE OR REPLACE FUNCTION public.seal_ready_for_analysis(p_seal uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; req int[]; v_cnpj text;
BEGIN
  SELECT * INTO s FROM seals WHERE id = p_seal;
  IF NOT FOUND THEN RETURN false; END IF;
  req := public.seal_required_doc_ids(p_seal);
  -- PJ: tudo o que não é do cliente (fornecedor e interno não captado)
  IF EXISTS (SELECT 1 FROM unnest(req) rid JOIN documents_catalog dc ON dc.id = rid
             WHERE coalesce(dc.responsibility, 'fornecedor') <> 'cliente'
               AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.supplier_id = s.supplier_id AND d.type = rid::text
                                 AND public.doc_sent_ok(d.status, d.expires_at))) THEN
    RETURN false;
  END IF;
  -- questionário do cliente
  IF s.client_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM questionnaire_questions qq JOIN questionnaires qn ON qn.id = qq.questionnaire_id
       WHERE qn.client_id = s.client_id AND qn.active IS NOT false AND qq.required
         AND NOT EXISTS (SELECT 1 FROM questionnaire_answers qa WHERE qa.question_id = qq.id AND qa.supplier_id = s.supplier_id)) THEN
    RETURN false;
  END IF;
  -- mobilidade (PF): pessoas cadastradas e documentos enviados
  IF s.client_id IS NOT NULL THEN
    SELECT cnpj INTO v_cnpj FROM suppliers WHERE id = s.supplier_id;
    IF EXISTS (SELECT 1 FROM mobility_posts p WHERE p.active AND p.client_id = s.client_id AND p.supplier_cnpj = v_cnpj
                 AND p.qty_people > (SELECT count(*) FROM mobility_people mp WHERE mp.post_id = p.id AND mp.active AND mp.supplier_id = s.supplier_id))
       OR EXISTS (
         SELECT 1 FROM mobility_posts p
         JOIN category_mobility_documents m ON m.category_id = p.category_id AND m.required
         LEFT JOIN mobility_people mp ON m.escopo = 'pessoa' AND mp.post_id = p.id AND mp.active AND mp.supplier_id = s.supplier_id
         WHERE p.active AND p.client_id = s.client_id AND p.supplier_cnpj = v_cnpj
           AND (m.escopo = 'posto' AND (m.document_id <> 10017 OR p.armado) OR m.escopo = 'pessoa' AND mp.id IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.supplier_id = s.supplier_id
                             AND d.type = CASE WHEN m.escopo = 'posto' THEN 'mob:' || m.document_id || ':s:' || p.id
                                               ELSE 'mob:' || m.document_id || ':p:' || mp.id END
                             AND public.doc_sent_ok(d.status, d.expires_at))) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END $$;

-- processo na fila: homologado (renovações), do HOC (o HOC controla) ou do
-- ELOS liberado (pago/subsidiado) e completo
CREATE OR REPLACE FUNCTION public.seal_in_queue(p_seal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT CASE
           WHEN s.client_suspended_at IS NOT NULL THEN false
           WHEN s.status = 'ACTIVE' THEN true
           WHEN s.status = 'PENDING' AND s.hoc_process_id IS NOT NULL THEN true
           WHEN s.status = 'PENDING' AND s.released_at IS NOT NULL THEN public.seal_ready_for_analysis(s.id)
           ELSE false END
         FROM seals s WHERE s.id = p_seal), false)
$$;

-- o documento é deste processo? (PJ exigido ou mobilidade do cliente do processo)
CREATE OR REPLACE FUNCTION public.doc_relevant(p_client uuid, p_req int[], p_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_type ~ '^[0-9]+$' THEN p_type::int = ANY (p_req)
    WHEN p_type LIKE 'mob:%:s:%' THEN EXISTS (SELECT 1 FROM mobility_posts p WHERE p.id::text = split_part(p_type, ':', 4) AND p.client_id = p_client)
    WHEN p_type LIKE 'mob:%:p:%' THEN EXISTS (SELECT 1 FROM mobility_people mp JOIN mobility_posts p ON p.id = mp.post_id
                                              WHERE mp.id::text = split_part(p_type, ':', 4) AND p.client_id = p_client)
    ELSE false END
$$;

-- o documento está num processo que já entrou na fila?
CREATE OR REPLACE FUNCTION public.doc_in_queue(p_supplier uuid, p_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM seals s
                 WHERE s.supplier_id = p_supplier AND s.status IN ('ACTIVE','PENDING')
                   AND public.doc_relevant(s.client_id, public.seal_required_doc_ids(s.id), p_type)
                   AND public.seal_in_queue(s.id))
$$;

-- o fornecedor pode enviar um novo arquivo deste documento?
CREATE OR REPLACE FUNCTION public.doc_replaceable(p_supplier uuid, p_type text, p_status text, p_expires timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_status IN ('MISSING','REJECTED','EXPIRED')
      OR (p_expires IS NOT NULL AND p_expires <= now() + interval '30 days')   -- renovação
      OR NOT public.doc_in_queue(p_supplier, p_type)
$$;

-- para a tela do fornecedor: documentos que NÃO podem receber novo arquivo agora
CREATE OR REPLACE FUNCTION public.supplier_doc_locks(p_supplier uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_admin() OR p_supplier IN (SELECT public.my_supplier_ids())) THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501';
  END IF;
  RETURN ARRAY(SELECT d.type FROM documents d WHERE d.supplier_id = p_supplier
                 AND NOT public.doc_replaceable(d.supplier_id, d.type, d.status, d.expires_at));
END $$;
GRANT EXECUTE ON FUNCTION public.supplier_doc_locks(uuid) TO authenticated;

-- "tem processo na fila" (avisos das telas do fornecedor) — sem o atalho
CREATE OR REPLACE FUNCTION public.supplier_ready_for_analysis(p_supplier uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM seals s WHERE s.supplier_id = p_supplier AND s.status = 'PENDING'
                   AND public.seal_in_queue(s.id))
$$;

-- cliente: o processo dele está na fila? (aviso "Aguardando fornecedor")
CREATE OR REPLACE FUNCTION public.client_seal_in_queue(p_seal uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM seals s JOIN user_roles ur ON ur.client_id = s.client_id
            WHERE s.id = p_seal AND ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND coalesce(ur.is_active, true))) THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501';
  END IF;
  RETURN public.seal_in_queue(p_seal);
END $$;
GRANT EXECUTE ON FUNCTION public.client_seal_in_queue(uuid) TO authenticated;

-- histórico: o cliente vê o dos fornecedores dos processos dele
DROP POLICY IF EXISTS dochist_client_read ON public.document_history;
CREATE POLICY dochist_client_read ON public.document_history FOR SELECT
  USING (supplier_id IN (SELECT public.my_client_supplier_ids()));

CREATE OR REPLACE FUNCTION public.fn_document_history_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_event TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'CREATED';
  ELSE
    -- Deriva o evento da transição de estado
    IF NEW.status = 'VALID'    AND OLD.status IS DISTINCT FROM 'VALID'    THEN v_event := 'APPROVED';
    ELSIF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN v_event := 'REJECTED';
    ELSIF NEW.status = 'EXPIRED'  AND OLD.status IS DISTINCT FROM 'EXPIRED'  THEN v_event := 'EXPIRED';
    ELSIF OLD.status = 'VALID' AND NEW.status IN ('PENDING','MISSING')       THEN v_event := 'REVOKED';
    ELSIF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.hoc_arquivo_id IS DISTINCT FROM OLD.hoc_arquivo_id               THEN v_event := 'UPLOADED';
    ELSE
      -- Ignora updates sem mudança relevante (ex.: só updated_at)
      IF NEW.status IS NOT DISTINCT FROM OLD.status
         AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
         AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note
         AND NEW.inscription_number IS NOT DISTINCT FROM OLD.inscription_number THEN
        RETURN NEW;
      END IF;
      v_event := 'UPDATED';
    END IF;
  END IF;

  INSERT INTO document_history
    (document_id, supplier_id, type, label, event, status, source, storage_path,
     expires_at, issued_at, review_note, reviewed_by, inscription_number, hoc_arquivo_id)
  VALUES
    (NEW.id, NEW.supplier_id, NEW.type, NEW.label, v_event, NEW.status, NEW.source, NEW.storage_path,
     NEW.expires_at, NEW.issued_at, NEW.review_note, NEW.reviewed_by, NEW.inscription_number, NEW.hoc_arquivo_id);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_documents_end_user_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE dname text;
BEGIN
  IF NOT public.is_end_user_request() OR public.is_admin() THEN RETURN NEW; END IF;

  -- campos da análise nunca vêm do navegador
  IF TG_OP = 'UPDATE' AND (
       NEW.reviewed_by    IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_note    IS DISTINCT FROM OLD.review_note
    OR NEW.hoc_arquivo_id IS DISTINCT FROM OLD.hoc_arquivo_id
    OR NEW.supplier_id    IS DISTINCT FROM OLD.supplier_id
    -- validade e arquivo: só junto de um novo envio (volta para análise) —
    -- senão trocava o arquivo de um documento já aprovado
    OR (NEW.expires_at   IS DISTINCT FROM OLD.expires_at   AND NEW.status <> 'PENDING')
    OR (NEW.storage_path IS DISTINCT FROM OLD.storage_path AND NEW.status <> 'PENDING')) THEN
    RAISE EXCEPTION 'Alteração não permitida: dados da análise só mudam pelo backoffice'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.hoc_arquivo_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Alteração não permitida: dados da análise só mudam pelo backoffice'
      USING ERRCODE = '42501';
  END IF;

  -- 16/10 (patch_145): novo arquivo do fornecedor — antes da fila, qualquer
  -- documento; com o processo na fila, só reprovado/vencido ou para renovar
  -- (vencendo em até 30 dias). Cada envio vira uma versão no histórico.
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS DISTINCT FROM OLD.storage_path
     AND NOT public.doc_replaceable(OLD.supplier_id, OLD.type, OLD.status, OLD.expires_at) THEN
    RAISE EXCEPTION 'Este documento já está na análise: só pode ser reenviado se for reprovado (ou para renovar quando estiver vencendo)'
      USING ERRCODE = '42501';
  END IF;

  -- status: enviar (PENDING) ou retirar (MISSING); decisão é da análise
  IF NEW.status IN ('PENDING', 'MISSING')
     OR (TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'VALID' THEN
    -- Apresentação da Empresa: aprovada automaticamente (sem revisão)
    IF NEW.type = 'presentation' THEN RETURN NEW; END IF;
    -- Cartão CNPJ (37) e Simples Nacional (62) vindos da Receita
    IF NEW.source = 'AUTO' AND NEW.type IN ('37', '62') THEN RETURN NEW; END IF;
    -- Inscrição Estadual/Municipal declarada isenta pelo fornecedor
    IF coalesce(NEW.metadata->>'isento', '') = 'true' AND NEW.type ~ '^\d+$' THEN
      SELECT lower(name) INTO dname FROM documents_catalog WHERE id = NEW.type::int;
      IF dname ~ '(inscri[cç][aã]o (estadual|municipal)|ie estadual|im municipal)' THEN RETURN NEW; END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'Alteração não permitida: o status do documento é definido pela análise'
    USING ERRCODE = '42501';
END;
$function$;

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
