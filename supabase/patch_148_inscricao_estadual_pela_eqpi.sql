-- patch_148 — Inscrição Estadual é obtida pela EQPI, nunca pedida ao fornecedor (16/10/2026)
--
-- Luiz (16/10, caso HAVI): "se conseguir captar automaticamente manda ver,
-- quando não conseguir não abre para o fornecedor". A IE (doc 15) passa a ser
-- consultada no Sintegra da UF (Rota A); se a fonte falhar, a pendência fica
-- com a EQPI: não conta como falta do fornecedor, não segura a entrada na fila
-- e não aparece em lembrete. Exceção à regra do patch_141 só para estes tipos.
-- Lista fixa aqui (e não em documents_catalog.responsibility) porque a
-- sincronia noturna do HOC regrava a responsabilidade dos docs ≤ 600.

CREATE OR REPLACE FUNCTION public.doc_so_eqpi(p_doc integer)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT p_doc IN (15) $$;

CREATE OR REPLACE FUNCTION public.process_documents(p_seal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_cnpj text; v_admin boolean; v_sup boolean; v_cli boolean; v_mask boolean;
        req int[]; v_pj jsonb; v_mob jsonb; v_tot jsonb; v_short int;
BEGIN
  SELECT se.id, se.supplier_id, se.client_id, se.status, se.flow_id, se.hoc_process_id,
         coalesce(c.nome_fantasia, c.razao_social) AS client_name
    INTO s FROM seals se LEFT JOIN clients c ON c.id = se.client_id WHERE se.id = p_seal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
  v_admin := public.is_admin();
  v_sup := s.supplier_id IN (SELECT public.my_supplier_ids());
  v_cli := s.client_id IS NOT NULL AND (
             EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
                     AND ur.client_id = s.client_id AND coalesce(ur.is_active, true))
             OR EXISTS (SELECT 1 FROM clients WHERE id = s.client_id AND user_id = auth.uid()));
  IF NOT (v_admin OR v_sup OR v_cli) THEN
    RAISE EXCEPTION 'Sem acesso a este processo' USING ERRCODE = '42501';
  END IF;
  v_mask := NOT (v_admin OR v_sup);
  req := public.seal_required_doc_ids(p_seal);
  SELECT cnpj INTO v_cnpj FROM suppliers WHERE id = s.supplier_id;

  -- ── PJ: exigidos + os demais enviados, na MESMA lista (14/10) ────────────
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.nome), '[]'::jsonb) INTO v_pj FROM (
  SELECT dc.name AS nome, jsonb_build_object(
           'key', dc.id::text, 'doc_id', dc.id, 'name', dc.name, 'extra', false,
           'responsibility', CASE WHEN public.doc_so_eqpi(dc.id) THEN 'eqpi' ELSE coalesce(dc.responsibility, 'fornecedor') END,   -- patch_148
           'auto_collect', coalesce(dc.auto_collect, false),
           'status', coalesce(d.status, 'MISSING'),
           'document', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', d.id, 'type', d.type, 'storage_path', d.storage_path, 'source', d.source,
              'hoc_arquivo_id', d.hoc_arquivo_id, 'expires_at', d.expires_at, 'issued_at', d.issued_at,
              'submitted_at', d.submitted_at, 'created_at', d.created_at, 'reviewed_at', d.reviewed_at,
              'review_note', d.review_note, 'status', d.status) END) AS j
  FROM unnest(req) rid
  JOIN documents_catalog dc ON dc.id = rid
  LEFT JOIN documents d ON d.supplier_id = s.supplier_id AND d.type = rid::text
  UNION ALL
  -- enviados fora da exigência deste processo (não entram nos totais)
  SELECT coalesce(dc.name, d.label, d.type), jsonb_build_object(
           'key', d.type, 'doc_id', dc.id, 'name', coalesce(dc.name, d.label, d.type), 'extra', true,
           'responsibility', CASE WHEN public.doc_so_eqpi(dc.id) THEN 'eqpi' ELSE coalesce(dc.responsibility, 'fornecedor') END,   -- patch_148
           'auto_collect', coalesce(dc.auto_collect, false),
           'status', d.status,
           'document', jsonb_build_object(
              'id', d.id, 'type', d.type, 'storage_path', d.storage_path, 'source', d.source,
              'hoc_arquivo_id', d.hoc_arquivo_id, 'expires_at', d.expires_at, 'issued_at', d.issued_at,
              'submitted_at', d.submitted_at, 'created_at', d.created_at, 'reviewed_at', d.reviewed_at,
              'review_note', d.review_note, 'status', d.status))
  FROM documents d
  LEFT JOIN documents_catalog dc ON dc.id::text = d.type
  WHERE d.supplier_id = s.supplier_id AND d.type NOT LIKE 'mob:%' AND d.type <> 'presentation'
    AND d.status <> 'MISSING'
    AND NOT (d.type = ANY (SELECT r::text FROM unnest(req) r))
  ) x;

  -- ── Mobilidade (postos do cliente deste processo) ────────────────────────
  WITH posts AS (
    SELECT p.*, cat.name AS cat_name FROM mobility_posts p
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE p.active AND s.client_id IS NOT NULL AND p.client_id = s.client_id AND p.supplier_cnpj = v_cnpj
  ),
  mx AS (SELECT m.* FROM category_mobility_documents m WHERE m.required AND m.category_id IN (SELECT category_id FROM posts)),
  ppl AS (SELECT mp.* FROM mobility_people mp WHERE mp.active AND mp.supplier_id = s.supplier_id AND mp.post_id IN (SELECT id FROM posts)),
  item AS (   -- um item por documento exigido (por posto ou por pessoa)
    SELECT p.id AS post_id, NULL::uuid AS person_id, m.document_id, 'posto'::text AS escopo,
           'mob:' || m.document_id || ':s:' || p.id AS t
    FROM posts p JOIN mx m ON m.category_id = p.category_id AND m.escopo = 'posto'
    WHERE m.document_id <> 10017 OR p.armado          -- Registro da Arma só em posto armado
    UNION ALL
    SELECT p.id, pe.id, m.document_id, 'pessoa', 'mob:' || m.document_id || ':p:' || pe.id
    FROM posts p JOIN mx m ON m.category_id = p.category_id AND m.escopo = 'pessoa'
    JOIN ppl pe ON pe.post_id = p.id
  ),
  itj AS (
    SELECT i.post_id, i.person_id, jsonb_build_object(
             'key', i.t, 'doc_id', i.document_id, 'name', dc.name, 'escopo', i.escopo,
             'responsibility', 'fornecedor', 'auto_collect', false,
             'status', coalesce(d.status, 'MISSING'),
             'document', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', d.id, 'type', d.type, 'storage_path', d.storage_path, 'source', d.source,
                'hoc_arquivo_id', d.hoc_arquivo_id, 'expires_at', d.expires_at, 'issued_at', d.issued_at,
                'submitted_at', d.submitted_at, 'created_at', d.created_at, 'reviewed_at', d.reviewed_at,
                'review_note', d.review_note, 'status', d.status) END) AS j, dc.name
    FROM item i JOIN documents_catalog dc ON dc.id = i.document_id
    LEFT JOIN documents d ON d.supplier_id = s.supplier_id AND d.type = i.t
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'post_id', p.id, 'category_id', p.category_id, 'category', p.cat_name,
           'city', p.site_city, 'uf', p.site_uf, 'armado', p.armado, 'funcao', p.funcao_label,
           'qty_people', p.qty_people,
           'people_count', (SELECT count(*) FROM ppl WHERE ppl.post_id = p.id),
           'post_docs', coalesce((SELECT jsonb_agg(itj.j ORDER BY itj.name) FROM itj WHERE itj.post_id = p.id AND itj.person_id IS NULL), '[]'::jsonb),
           'people', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'person_id', pe.id,
                'name', CASE WHEN v_mask THEN public.mask_person_name(pe.nome) ELSE pe.nome END,
                'cpf', public.mask_cpf(pe.cpf_digits),
                'docs', coalesce((SELECT jsonb_agg(itj.j ORDER BY itj.name) FROM itj WHERE itj.person_id = pe.id), '[]'::jsonb))
              ORDER BY pe.nome) FROM ppl pe WHERE pe.post_id = p.id), '[]'::jsonb))
         ORDER BY p.site_city, p.site_uf, p.funcao_label), '[]'::jsonb)
    INTO v_mob FROM posts p;

  SELECT coalesce(sum(greatest(0, (x->>'qty_people')::int - (x->>'people_count')::int)), 0)::int
    INTO v_short FROM jsonb_array_elements(v_mob) x;

  -- totais: TODOS os itens exigidos (PJ + PF); pendente = o que falta fazer
  WITH todos AS (
    SELECT e->>'status' AS st, e->>'responsibility' AS resp FROM jsonb_array_elements(v_pj) e WHERE NOT (e->>'extra')::boolean
    UNION ALL SELECT d->>'status', 'fornecedor' FROM jsonb_array_elements(v_mob) p, jsonb_array_elements(p->'post_docs') d
    UNION ALL SELECT d->>'status', 'fornecedor' FROM jsonb_array_elements(v_mob) p, jsonb_array_elements(p->'people') pe, jsonb_array_elements(pe->'docs') d
  )
  SELECT jsonb_build_object(
           'required', count(*),
           'valid', count(*) FILTER (WHERE st IN ('VALID','EXPIRING','NOT_APPLICABLE')),
           'in_review', count(*) FILTER (WHERE st = 'PENDING'),
           'missing', count(*) FILTER (WHERE st = 'MISSING'),
           'rejected', count(*) FILTER (WHERE st = 'REJECTED'),
           'expired', count(*) FILTER (WHERE st = 'EXPIRED'),
           -- interno (captado pela EQPI) que não foi captado volta para o fornecedor (Luiz, 14/10)
           'supplier_todo', count(*) FILTER (WHERE resp IN ('fornecedor','interna') AND st IN ('MISSING','REJECTED','EXPIRED')),
           'client_todo', count(*) FILTER (WHERE resp = 'cliente' AND st IN ('MISSING','REJECTED','EXPIRED')),
           'internal_todo', count(*) FILTER (WHERE resp = 'eqpi' AND st IN ('MISSING','REJECTED','EXPIRED')),   -- patch_148
           'people_shortfall', v_short,
           'complete', v_short = 0 AND count(*) > 0
                       AND count(*) = count(*) FILTER (WHERE st IN ('VALID','EXPIRING','NOT_APPLICABLE')))
    INTO v_tot FROM todos;

  RETURN jsonb_build_object(
    'seal', jsonb_build_object('id', s.id, 'supplier_id', s.supplier_id, 'client_id', s.client_id,
                               'client_name', s.client_name, 'status', s.status, 'flow_id', s.flow_id,
                               'from_hoc', s.hoc_process_id IS NOT NULL),
    'viewer', CASE WHEN v_admin THEN 'ADMIN' WHEN v_sup THEN 'SUPPLIER' ELSE 'CLIENT' END,
    'masked', v_mask,
    'pj', v_pj, 'mobility', v_mob, 'totals', v_tot);
END $function$;

CREATE OR REPLACE FUNCTION public.seal_ready_for_analysis(p_seal uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; req int[]; v_cnpj text;
BEGIN
  SELECT * INTO s FROM seals WHERE id = p_seal;
  IF NOT FOUND THEN RETURN false; END IF;
  req := public.seal_required_doc_ids(p_seal);
  -- PJ: tudo o que não é do cliente (fornecedor e interno não captado)
  IF EXISTS (SELECT 1 FROM unnest(req) rid JOIN documents_catalog dc ON dc.id = rid
             WHERE coalesce(dc.responsibility, 'fornecedor') <> 'cliente'
               AND NOT public.doc_so_eqpi(dc.id)   -- patch_148: obtido pela EQPI, não segura a fila
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
END $function$;
