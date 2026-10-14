-- patch_140 — Documentos do processo: exigências da EQPI e lista PJ única (14/10/2026)
--
-- Pedido do Luiz, olhando a GARRA no backoffice:
-- 1) Análise de CNAEs (61) e Simples Nacional (62) são exigência da EQPI em
--    TODO processo (o CNAE valida se o fornecedor pode prestar o serviço; o
--    Simples a EQPI capta) — entram no conjunto exigido de qualquer cliente.
-- 2) Os demais documentos enviados aparecem JUNTO com os PJ, na mesma lista
--    (sem seção separada); marcados extra=true e fora dos totais.
-- A automação do servidor (lib/required_docs.js) segue a mesma regra.

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
  -- exigência da EQPI em todo processo (14/10): Análise de CNAEs (61 — se ele
  -- pode prestar o serviço) e Simples Nacional (62 — captado pela EQPI)
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(coalesce(ids, '{}') || ARRAY[61, 62]) x ORDER BY x);
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

  -- ── PJ: exigidos + os demais enviados, na MESMA lista (14/10) ────────────
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.nome), '[]'::jsonb) INTO v_pj FROM (
  SELECT dc.name AS nome, jsonb_build_object(
           'key', dc.id::text, 'doc_id', dc.id, 'name', dc.name, 'extra', false,
           'responsibility', coalesce(dc.responsibility, 'fornecedor'),
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
           'responsibility', coalesce(dc.responsibility, 'fornecedor'),
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
