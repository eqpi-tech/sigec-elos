-- patch_139 — Documentos do processo: uma fonte só para as três visões (14/10/2026)
--
-- Pedido do Luiz: cliente, backoffice e fornecedor veem os documentos do
-- processo DO MESMO JEITO (cada um com as suas ações), e TODOS os documentos
-- exigidos pelo fluxo contam — PJ e PF (mobilidade). Antes cada tela montava
-- a lista com uma regra diferente e o backoffice dava "Documentação completa"
-- com a mobilidade inteira por enviar.
--
-- 1) seal_required_doc_ids(seal): conjunto PJ exigido — MESMA regra da
--    automação do servidor (netlify/functions/lib/required_docs.js):
--    categorias do fornecedor no cliente (required) → fluxo do selo → fluxos
--    ativos do cliente; sem cliente = 6 docs do ELOS Verificado.
-- 2) process_documents(seal): PJ + mobilidade (postos → pessoas → documentos)
--    com a situação de cada item e os totais. Só para backoffice, fornecedor
--    da empresa ou cliente do processo. Cliente recebe NOME e CPF mascarados
--    (LGPD); fornecedor e backoffice, o nome — CPF sempre mascarado.
-- 3) supplier_ready_for_analysis passa a exigir a mobilidade do processo
--    (pessoas cadastradas e documentos de PF enviados). É ela que decide a
--    fila do analista, o farol e o "Aguardando fornecedor" do cliente.

CREATE OR REPLACE FUNCTION public.mask_cpf(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(regexp_replace(coalesce(p,''), '\D', '', 'g')) = 11
    THEN '***.***.*' || substr(regexp_replace(p, '\D', '', 'g'), 9, 1) || '-' || substr(regexp_replace(p, '\D', '', 'g'), 10, 2)
    ELSE '***' END
$$;

-- "CARLOS LIMA SOUZA" → "Carlos L. S."
CREATE OR REPLACE FUNCTION public.mask_person_name(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(trim(p), '') = '' THEN '—' ELSE
    initcap(split_part(trim(p), ' ', 1)) || coalesce(' ' || (
      SELECT string_agg(upper(left(w, 1)) || '.', ' ' ORDER BY i)
      FROM unnest(regexp_split_to_array(trim(p), '\s+')) WITH ORDINALITY AS t(w, i)
      WHERE i > 1 AND length(w) > 2), '') END
$$;

CREATE OR REPLACE FUNCTION public.seal_required_doc_ids(p_seal uuid)
RETURNS int[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; ids int[];
BEGIN
  SELECT supplier_id, client_id, flow_id INTO s FROM seals WHERE id = p_seal;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF s.client_id IS NULL THEN RETURN ARRAY[37,61,62,7,42,8]; END IF;
  SELECT array_agg(DISTINCT cd.document_id) INTO ids
  FROM supplier_categories sc
  JOIN categories c ON c.id = sc.category_id AND c.client_id = s.client_id
  JOIN category_documents cd ON cd.category_id = sc.category_id AND cd.required
  WHERE sc.supplier_id = s.supplier_id;
  IF ids IS NULL AND s.flow_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT cd.document_id) INTO ids
    FROM client_flow_categories fc
    JOIN category_documents cd ON cd.category_id = fc.category_id AND cd.required
    WHERE fc.flow_id = s.flow_id;
  END IF;
  IF ids IS NULL THEN
    SELECT array_agg(DISTINCT cd.document_id) INTO ids
    FROM client_flows f
    JOIN client_flow_categories fc ON fc.flow_id = f.id
    JOIN category_documents cd ON cd.category_id = fc.category_id AND cd.required
    WHERE f.client_id = s.client_id AND f.active;
  END IF;
  RETURN coalesce(ids, '{}');
END $$;

CREATE OR REPLACE FUNCTION public.process_documents(p_seal uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  -- ── PJ ──────────────────────────────────────────────────────────────────
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', dc.id::text, 'doc_id', dc.id, 'name', dc.name,
           'responsibility', coalesce(dc.responsibility, 'fornecedor'),
           'auto_collect', coalesce(dc.auto_collect, false),
           'status', coalesce(d.status, 'MISSING'),
           'document', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', d.id, 'type', d.type, 'storage_path', d.storage_path, 'source', d.source,
              'hoc_arquivo_id', d.hoc_arquivo_id, 'expires_at', d.expires_at, 'issued_at', d.issued_at,
              'submitted_at', d.submitted_at, 'created_at', d.created_at, 'reviewed_at', d.reviewed_at,
              'review_note', d.review_note, 'status', d.status) END)
         ORDER BY dc.name), '[]'::jsonb)
    INTO v_pj
  FROM unnest(req) rid
  JOIN documents_catalog dc ON dc.id = rid
  LEFT JOIN documents d ON d.supplier_id = s.supplier_id AND d.type = rid::text;

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
    SELECT e->>'status' AS st, e->>'responsibility' AS resp FROM jsonb_array_elements(v_pj) e
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
           'supplier_todo', count(*) FILTER (WHERE resp = 'fornecedor' AND st IN ('MISSING','REJECTED','EXPIRED')),
           'client_todo', count(*) FILTER (WHERE resp = 'cliente' AND st IN ('MISSING','REJECTED','EXPIRED')),
           'internal_todo', count(*) FILTER (WHERE resp = 'interna' AND st IN ('MISSING','REJECTED','EXPIRED')),
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
END $$;
GRANT EXECUTE ON FUNCTION public.process_documents(uuid) TO authenticated;

-- prontidão: além dos docs PJ e do questionário, a MOBILIDADE do processo
CREATE OR REPLACE FUNCTION public.supplier_ready_for_analysis(p_supplier uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ready boolean := false; s record; req_missing int; q_missing int; req_ids int[]; v_cnpj text;
BEGIN
  -- selo vindo do HOC (o HOC controla o estado) ou selo já ATIVO → entra
  IF EXISTS (SELECT 1 FROM seals WHERE supplier_id = p_supplier
              AND (hoc_process_id IS NOT NULL OR status = 'ACTIVE')) THEN
    RETURN true;
  END IF;
  SELECT cnpj INTO v_cnpj FROM suppliers WHERE id = p_supplier;
  FOR s IN SELECT * FROM seals WHERE supplier_id = p_supplier AND status = 'PENDING' LOOP
    req_ids := public.seal_required_doc_ids(s.id);
    -- docs de responsabilidade do FORNECEDOR ainda sem envio (sem linha ou MISSING)
    SELECT count(*) INTO req_missing
    FROM unnest(req_ids) rid
    JOIN documents_catalog dc ON dc.id = rid
    WHERE coalesce(dc.responsibility,'fornecedor') = 'fornecedor'
      AND coalesce(dc.auto_collect,false) = false
      AND NOT EXISTS (SELECT 1 FROM documents d
                      WHERE d.supplier_id = p_supplier AND d.type = rid::text
                        AND d.status <> 'MISSING');
    -- questionários ativos do cliente: perguntas obrigatórias sem resposta
    q_missing := 0;
    IF s.client_id IS NOT NULL THEN
      SELECT count(*) INTO q_missing
      FROM questionnaire_questions qq
      JOIN questionnaires qn ON qn.id = qq.questionnaire_id
      WHERE qn.client_id = s.client_id AND qn.active IS NOT false AND qq.required
        AND NOT EXISTS (SELECT 1 FROM questionnaire_answers qa
                        WHERE qa.question_id = qq.id AND qa.supplier_id = p_supplier);
      -- mobilidade (patch_139): pessoas cadastradas e documentos de PF enviados
      IF EXISTS (SELECT 1 FROM mobility_posts p
                 WHERE p.active AND p.client_id = s.client_id AND p.supplier_cnpj = v_cnpj
                   AND p.qty_people > (SELECT count(*) FROM mobility_people mp
                                       WHERE mp.post_id = p.id AND mp.active AND mp.supplier_id = p_supplier))
         OR EXISTS (
           SELECT 1 FROM mobility_posts p
           JOIN category_mobility_documents m ON m.category_id = p.category_id AND m.required
           LEFT JOIN mobility_people mp ON m.escopo = 'pessoa' AND mp.post_id = p.id AND mp.active AND mp.supplier_id = p_supplier
           WHERE p.active AND p.client_id = s.client_id AND p.supplier_cnpj = v_cnpj
             AND (m.escopo = 'posto' AND (m.document_id <> 10017 OR p.armado)
                  OR m.escopo = 'pessoa' AND mp.id IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM documents d
                             WHERE d.supplier_id = p_supplier
                               AND d.type = CASE WHEN m.escopo = 'posto'
                                                 THEN 'mob:' || m.document_id || ':s:' || p.id
                                                 ELSE 'mob:' || m.document_id || ':p:' || mp.id END
                               AND d.status <> 'MISSING')) THEN
        q_missing := q_missing + 1;
      END IF;
    END IF;
    IF req_missing = 0 AND q_missing = 0 THEN ready := true; EXIT; END IF;
  END LOOP;
  RETURN ready;
END $fn$;
