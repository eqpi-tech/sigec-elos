-- PATCH 069: Farol e Análise de Docs só com processos OPERÁVEIS
-- Regra (08-09/09): documento entra na fila/farol apenas se o fornecedor
-- tem ≥1 selo ACTIVE/PENDING cujo cliente (quando houver) está ATIVO.
-- Suspensos e clientes inativos no HOC saem. RPCs SECURITY DEFINER também
-- eliminam o custo de RLS por linha nessas telas (padrão patch_067).

CREATE OR REPLACE FUNCTION public.analysable_supplier_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT DISTINCT s.supplier_id
  FROM seals s LEFT JOIN clients c ON c.id = s.client_id
  WHERE s.status IN ('ACTIVE','PENDING')
    AND (s.client_id IS NULL OR coalesce(c.active, true))
$fn$;

CREATE OR REPLACE FUNCTION public.admin_document_farol() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH eligible AS (SELECT * FROM analysable_supplier_ids() AS t(sid)),
  docs AS (
    SELECT d.id, d.label, d.expires_at, d.status, d.supplier_id,
           json_build_object('razao_social', sup.razao_social, 'cnpj', sup.cnpj) AS suppliers,
           CASE WHEN d.expires_at < current_date THEN 'vencidos'
                WHEN d.expires_at < current_date + 1 THEN 'hoje'
                ELSE 'futuro' END AS bucket
    FROM documents d
    JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.supplier_id IN (SELECT sid FROM eligible)
      AND d.expires_at IS NOT NULL
      AND d.expires_at < current_date + 6
      AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
    ORDER BY d.expires_at
  )
  SELECT json_build_object(
    'vencidos', coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE bucket='vencidos' LIMIT 5000) x), '[]'::json),
    'hoje',     coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE bucket='hoje' LIMIT 5000) x), '[]'::json),
    'futuro',   coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE bucket='futuro' LIMIT 5000) x), '[]'::json)
  ) INTO result;
  RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_list_documents(
  p_doc_type text DEFAULT NULL, p_status text DEFAULT 'analise',
  p_expires_until date DEFAULT NULL, p_search text DEFAULT NULL,
  p_sort text DEFAULT 'expires_asc', p_page int DEFAULT 0, p_size int DEFAULT 50
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE digits text := regexp_replace(coalesce(p_search,''), '\D', '', 'g');
        result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT d.*, sup.razao_social sup_razao, sup.cnpj sup_cnpj
    FROM documents d JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.label IS NOT NULL
      AND d.supplier_id IN (SELECT analysable_supplier_ids())
      AND (p_doc_type IS NULL OR d.type = p_doc_type)
      AND (p_expires_until IS NULL OR (d.expires_at IS NOT NULL AND d.expires_at::date <= p_expires_until))
      AND (coalesce(p_search,'') = '' OR
           (length(digits) >= 8 AND sup.cnpj ILIKE '%'||digits||'%') OR
           (length(digits) < 8 AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
      AND CASE coalesce(p_status,'todos')
            WHEN 'vencido'  THEN d.expires_at IS NOT NULL AND d.expires_at < now()
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'hoje'     THEN d.expires_at::date = current_date
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN '5dias'    THEN d.expires_at::date > current_date AND d.expires_at::date <= current_date + 5
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'pendente' THEN d.status = 'PENDING'
            WHEN 'analise'  THEN d.status IN ('PENDING','MISSING')
            WHEN 'todos'    THEN true
            ELSE d.status = p_status
          END
  ), counted AS (SELECT count(*) AS total FROM base),
  paged AS (
    SELECT * FROM base
    ORDER BY CASE WHEN p_sort = 'status' THEN status END,
             CASE WHEN p_sort = 'expires_asc'  THEN expires_at END ASC  NULLS LAST,
             CASE WHEN p_sort = 'expires_desc' THEN expires_at END DESC NULLS LAST,
             CASE WHEN p_sort NOT IN ('status','expires_asc','expires_desc') THEN created_at END DESC,
             id
    OFFSET greatest(p_page,0) * p_size LIMIT p_size
  )
  SELECT json_build_object(
    'total', (SELECT total FROM counted),
    'rows', coalesce((SELECT json_agg(json_build_object(
      'id', id, 'type', type, 'label', label, 'status', status, 'source', source,
      'expires_at', expires_at, 'review_note', review_note, 'supplier_id', supplier_id,
      'storage_path', storage_path, 'hoc_arquivo_id', hoc_arquivo_id,
      'created_at', created_at, 'updated_at', updated_at,
      'suppliers', json_build_object('id', supplier_id, 'razao_social', sup_razao, 'cnpj', sup_cnpj))) FROM paged), '[]'::json)
  ) INTO result;
  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.admin_document_farol() FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_documents(text,text,date,text,text,int,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_document_farol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_documents(text,text,date,text,text,int,int) TO authenticated;
-- PATCH 069b: admin_list_documents ganha client_names — cliente(s) do(s)
-- processo(s) operável(is) do fornecedor (ou 'ELOS' se só selo próprio)
CREATE OR REPLACE FUNCTION public.admin_list_documents(
  p_doc_type text DEFAULT NULL, p_status text DEFAULT 'analise',
  p_expires_until date DEFAULT NULL, p_search text DEFAULT NULL,
  p_sort text DEFAULT 'expires_asc', p_page int DEFAULT 0, p_size int DEFAULT 50
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE digits text := regexp_replace(coalesce(p_search,''), '\D', '', 'g');
        result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT d.*, sup.razao_social sup_razao, sup.cnpj sup_cnpj,
      coalesce(
        (SELECT string_agg(DISTINCT cl.razao_social, ' · ' ORDER BY cl.razao_social)
           FROM seals s2 JOIN clients cl ON cl.id = s2.client_id
          WHERE s2.supplier_id = d.supplier_id AND s2.status IN ('ACTIVE','PENDING')
            AND coalesce(cl.active, true)),
        CASE WHEN EXISTS (SELECT 1 FROM seals s3 WHERE s3.supplier_id = d.supplier_id
                            AND s3.client_id IS NULL AND s3.status IN ('ACTIVE','PENDING'))
             THEN 'ELOS' END
      ) AS client_names
    FROM documents d JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.label IS NOT NULL
      AND d.supplier_id IN (SELECT analysable_supplier_ids())
      AND (p_doc_type IS NULL OR d.type = p_doc_type)
      AND (p_expires_until IS NULL OR (d.expires_at IS NOT NULL AND d.expires_at::date <= p_expires_until))
      AND (coalesce(p_search,'') = '' OR
           (length(digits) >= 8 AND sup.cnpj ILIKE '%'||digits||'%') OR
           (length(digits) < 8 AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
      AND CASE coalesce(p_status,'todos')
            WHEN 'vencido'  THEN d.expires_at IS NOT NULL AND d.expires_at < now()
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'hoje'     THEN d.expires_at::date = current_date
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN '5dias'    THEN d.expires_at::date > current_date AND d.expires_at::date <= current_date + 5
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'pendente' THEN d.status = 'PENDING'
            WHEN 'analise'  THEN d.status IN ('PENDING','MISSING')
            WHEN 'todos'    THEN true
            ELSE d.status = p_status
          END
  ), counted AS (SELECT count(*) AS total FROM base),
  paged AS (
    SELECT * FROM base
    ORDER BY CASE WHEN p_sort = 'status' THEN status END,
             CASE WHEN p_sort = 'expires_asc'  THEN expires_at END ASC  NULLS LAST,
             CASE WHEN p_sort = 'expires_desc' THEN expires_at END DESC NULLS LAST,
             CASE WHEN p_sort NOT IN ('status','expires_asc','expires_desc') THEN created_at END DESC,
             id
    OFFSET greatest(p_page,0) * p_size LIMIT p_size
  )
  SELECT json_build_object(
    'total', (SELECT total FROM counted),
    'rows', coalesce((SELECT json_agg(json_build_object(
      'id', id, 'type', type, 'label', label, 'status', status, 'source', source,
      'expires_at', expires_at, 'review_note', review_note, 'supplier_id', supplier_id,
      'storage_path', storage_path, 'hoc_arquivo_id', hoc_arquivo_id,
      'created_at', created_at, 'updated_at', updated_at, 'client_names', client_names,
      'suppliers', json_build_object('id', supplier_id, 'razao_social', sup_razao, 'cnpj', sup_cnpj))) FROM paged), '[]'::json)
  ) INTO result;
  RETURN result;
END $fn$;
