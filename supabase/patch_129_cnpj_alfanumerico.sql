-- patch_129 — CNPJ ALFANUMÉRICO nas funções do banco (12/10/2026)
--
-- A Receita Federal emite CNPJ alfanumérico desde jul/2026 (IN RFB 2.229/2024):
-- 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos, ex.
-- 12.ABC.345/01DE-35. No banco o CNPJ fica sempre com 14 caracteres em
-- MAIÚSCULAS, sem pontuação (mesma regra de src/lib/cnpj.js e
-- netlify/functions/lib/cnpj.js).
--
-- As funções abaixo limpavam o CNPJ com regexp_replace(..., '\D', '') — que
-- apaga as letras — e decidiam "busca por CNPJ x busca por nome" pela
-- quantidade de dígitos. Com o CNPJ novo isso quebra a busca e a comparação
-- convite × fornecedor da trava de pagamento.
--
--   normalize_cnpj(text)   só letras e números, em maiúsculas
--   looks_like_cnpj(text)  a busca digitada é um CNPJ (ou parte): 8+ caracteres
--                          de CNPJ com ao menos 2 números, e o texto só tem
--                          letras, números, espaço e . - /
--
-- Recriadas a partir da definição EM PRODUÇÃO (pg_get_functiondef), mudando só
-- a normalização do CNPJ e a decisão CNPJ × nome:
--   admin_search_suppliers (patch_067), admin_list_documents (patch_123),
--   trg_seal_payment_lock (patch_117).
-- Para CNPJ só com números o resultado é idêntico ao anterior (sem letras,
-- normalize_cnpj = regexp_replace '\D'). Busca que parece CNPJ mas tem letras
-- ("Posto 2000", "12ABC345") procura no CNPJ E no nome — não perde a busca por
-- nome que antes caía no ramo "menos de 8 dígitos".
-- Índices: suppliers.cnpj já é gravado normalizado, então a comparação segue
-- sendo  cnpj ILIKE '%'||normalize_cnpj(busca)||'%'  sobre a coluna crua —
-- idx_suppliers_cnpj_trgm continua servindo (nada de função na coluna).
-- CPF não muda (11 dígitos, sempre mascarado).

CREATE OR REPLACE FUNCTION public.normalize_cnpj(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT upper(regexp_replace(coalesce($1, ''), '[^0-9A-Za-z]', '', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.looks_like_cnpj(text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT coalesce(btrim($1), '') ~ '^[0-9A-Za-z./[:space:]-]+$'
     AND length(public.normalize_cnpj($1)) >= 8
     AND length(regexp_replace(coalesce($1, ''), '[^0-9]', '', 'g')) >= 2
$function$;

-- busca de fornecedores do backoffice (patch_067)
CREATE OR REPLACE FUNCTION public.admin_search_suppliers(q text, show_inactive boolean DEFAULT false)
 RETURNS TABLE(id uuid, razao_social text, cnpj text, city text, state text, status text, created_at timestamp with time zone, archived_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cnpj_q  text    := public.normalize_cnpj(q);   -- patch_129: CNPJ alfanumérico
        is_cnpj boolean := public.looks_like_cnpj(q);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.id, s.razao_social, s.cnpj, s.city, s.state, s.status, s.created_at, s.archived_at
  FROM suppliers s
  WHERE (show_inactive OR (coalesce(s.status,'') <> 'INACTIVE' AND s.archived_at IS NULL))
    AND (
      (is_cnpj AND s.cnpj ILIKE '%' || cnpj_q || '%')
      -- busca com letras que "parece CNPJ" (ex.: "Posto 2000") também procura no nome
      OR ((NOT is_cnpj OR q ~ '[A-Za-z]') AND coalesce(trim(q),'') <> '' AND s.razao_social ILIKE '%' || trim(q) || '%')
      OR coalesce(trim(q),'') = ''
    )
  ORDER BY CASE WHEN coalesce(trim(q),'') = '' THEN NULL ELSE s.razao_social END ASC,
           s.created_at DESC
  LIMIT 200;
END $function$;

-- fila de análise do backoffice (patch_123 — assinatura com p_client)
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
           (is_cnpj AND sup.cnpj ILIKE '%'||cnpj_q||'%') OR
           -- busca com letras que "parece CNPJ" (ex.: "Posto 2000") também procura no nome
           ((NOT is_cnpj OR p_search ~ '[A-Za-z]') AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
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

-- trava de pagamento: convite subsidiado × CNPJ do fornecedor (patch_117)
CREATE OR REPLACE FUNCTION public.trg_seal_payment_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.released_at is null and new.hoc_process_id is not null then
    new.released_at := coalesce(new.created_at, now());          -- HOC já vem pago/subsidiado
  end if;
  -- subsidiado (o cliente paga): processo do cliente nasce liberado, venha
  -- de onde vier (cadastro, convite em lote, ajuste do backoffice)
  if new.released_at is null and new.client_id is not null and exists (
       select 1 from invitations i
       where i.client_id = new.client_id and i.subsidiado
         and i.status not in ('CANCELLED','SUPERSEDED')
         and i.hoc_id is null   -- convite do HOC não libera processo do ELOS (patch_117)
         and (i.supplier_id = new.supplier_id
              or public.normalize_cnpj(i.supplier_cnpj)   -- patch_129: CNPJ alfanumérico
                 = (select public.normalize_cnpj(cnpj) from suppliers where id = new.supplier_id))) then
    new.released_at := now();
  end if;
  if new.status = 'ACTIVE' and new.released_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'ACTIVE') then
    raise exception 'Processo sem pagamento confirmado: o selo não pode ser emitido'
      using errcode = 'P0001', hint = 'payment_lock';
  end if;
  return new;
end $function$;
