--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_business_days(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_business_days(d date, n integer) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE cur date := d; added int := 0;
BEGIN
  WHILE added < n LOOP
    cur := cur + 1;
    IF extract(isodow FROM cur) < 6
       AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.data = cur) THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN cur;
END $$;


--
-- Name: admin_campaign_funnel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_campaign_funnel() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'total_contas',   count(*),
    'acessaram',      count(*) filter (where u.last_sign_in_at is not null),
    'acessaram_7d',   count(*) filter (where u.last_sign_in_at >= now() - interval '7 days'),
    'primeiro_envio', min(u.created_at)::date,
    'ultimo_envio',   max(u.created_at)::date
  ) into r
  from auth.users u
  where u.raw_user_meta_data->>'campanha' is not null;

  r := r || jsonb_build_object(
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d, 'criadas', c, 'acessaram', a) order by d)
      from (
        select created_at::date d, count(*) c,
               count(*) filter (where last_sign_in_at is not null) a
        from auth.users
        where raw_user_meta_data->>'campanha' is not null
        group by 1
      ) t), '[]'::jsonb),
    'fornecedores_alcancados', (
      select count(distinct ur.supplier_id)
      from user_roles ur
      join auth.users au on au.id = ur.user_id
      where au.raw_user_meta_data->>'campanha' is not null and ur.supplier_id is not null),
    'fornecedores_acessaram', (
      select count(distinct ur.supplier_id)
      from user_roles ur
      join auth.users au on au.id = ur.user_id
      where au.raw_user_meta_data->>'campanha' is not null
        and au.last_sign_in_at is not null and ur.supplier_id is not null)
  );
  return r;
end $$;


--
-- Name: admin_document_farol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_document_farol() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH eligible AS (
    SELECT t.sid FROM analysable_supplier_ids() AS t(sid)
    WHERE supplier_ready_for_analysis(t.sid)
  ),
  docs AS (
    SELECT d.id, d.label, d.expires_at, d.status, d.supplier_id,
           doc_analysis_due(d) AS analysis_due,
           json_build_object('razao_social', sup.razao_social, 'cnpj', sup.cnpj) AS suppliers
    FROM documents d
    JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.supplier_id IN (SELECT sid FROM eligible)
      AND d.status = 'PENDING'
  )
  SELECT json_build_object(
    'passados', coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due <  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json),
    'hoje',     coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due =  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json),
    'futuros',  coalesce((SELECT json_agg(to_json(x)) FROM (SELECT * FROM docs WHERE analysis_due >  current_date ORDER BY analysis_due LIMIT 5000) x), '[]'::json)
  ) INTO result;
  RETURN result;
END $$;


--
-- Name: admin_exec_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_exec_dashboard() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'fornecedores', jsonb_build_object(
      'total',       (select count(*) from suppliers),
      'migrados',    (select count(*) from suppliers where hoc_id is not null),
      'espontaneos', (select count(*) from suppliers where hoc_id is null),
      'com_conta',   (select count(distinct ur.supplier_id) from user_roles ur
                      where ur.role = 'SUPPLIER' and ur.supplier_id is not null)),
    'selos_por_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select status, count(*) n from seals group by 1) s), '{}'::jsonb),
    'homologados_por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object('cliente', nome, 'n', n) order by n desc)
      from (
        select coalesce(cl.nome_fantasia, cl.razao_social, 'ELOS') nome, count(*) n
        from seals s
        left join clients cl on cl.id = s.client_id
        where s.status = 'ACTIVE' and (cl.id is null or cl.active is not false)
        group by 1 order by 2 desc limit 8
      ) t), '[]'::jsonb),
    'usuarios', (
      select jsonb_build_object(
        'total',      count(*),
        'ativos_30d', count(*) filter (where last_sign_in_at >= now() - interval '30 days'),
        'nunca_logaram', count(*) filter (where last_sign_in_at is null))
      from auth.users),
    'acessos_por_semana', coalesce((
      select jsonb_agg(jsonb_build_object('semana', w, 'n', n) order by w)
      from (
        select date_trunc('week', last_sign_in_at)::date w, count(*) n
        from auth.users
        where last_sign_in_at >= now() - interval '12 weeks'
        group by 1
      ) t), '[]'::jsonb),
    'documentos', (
      select jsonb_build_object(
        'total',     count(*),
        'aprovados', count(*) filter (where status in ('VALID','NOT_APPLICABLE')),
        'aguardando_analise', count(*) filter (where status = 'PENDING'),
        'vencidos',  count(*) filter (where status = 'EXPIRED'))
      from documents),
    'convites', (
      select jsonb_build_object(
        'total', count(*),
        'ultimos_30d', count(*) filter (where created_at >= now() - interval '30 days'))
      from invitations),
    'campanha', (
      select jsonb_build_object(
        'contas', count(*),
        'acessaram', count(*) filter (where last_sign_in_at is not null))
      from auth.users where raw_user_meta_data->>'campanha' is not null)
  ) into r;
  return r;
end $$;


--
-- Name: admin_list_documents(text, text, text, date, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_documents(p_doc_type text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text, p_queue text DEFAULT 'todos'::text, p_expires_until date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'due_asc'::text, p_page integer DEFAULT 0, p_size integer DEFAULT 50) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
           doc_analysis_due(d) AS analysis_due
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
  ), counted AS (SELECT count(*) AS total FROM base),
  paged AS (
    SELECT * FROM base
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
END $$;


--
-- Name: admin_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_metrics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'suppliers_total',     (SELECT count(*) FROM suppliers),
    'suppliers_new_month', (SELECT count(*) FROM suppliers WHERE created_at >= date_trunc('month', now())),
    -- por status: processos (selos) e fornecedores distintos — os dois números
    'seals_by_status', (
      SELECT coalesce(jsonb_object_agg(status, jsonb_build_object('processos', n, 'fornecedores', d)), '{}'::jsonb)
      FROM (SELECT status, count(*) n, count(DISTINCT supplier_id) d FROM seals GROUP BY status) s)
  ) INTO result;
  RETURN result;
END $$;


--
-- Name: admin_search_suppliers(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_search_suppliers(q text, show_inactive boolean DEFAULT false) RETURNS TABLE(id uuid, razao_social text, cnpj text, city text, state text, status text, created_at timestamp with time zone, archived_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE digits text := regexp_replace(coalesce(q,''), '\D', '', 'g');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.id, s.razao_social, s.cnpj, s.city, s.state, s.status, s.created_at, s.archived_at
  FROM suppliers s
  WHERE (show_inactive OR (coalesce(s.status,'') <> 'INACTIVE' AND s.archived_at IS NULL))
    AND (
      (length(digits) >= 8 AND s.cnpj ILIKE '%' || digits || '%')
      OR (length(digits) < 8 AND coalesce(trim(q),'') <> '' AND s.razao_social ILIKE '%' || trim(q) || '%')
      OR coalesce(trim(q),'') = ''
    )
  ORDER BY CASE WHEN coalesce(trim(q),'') = '' THEN NULL ELSE s.razao_social END ASC,
           s.created_at DESC
  LIMIT 200;
END $$;


--
-- Name: analysable_supplier_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.analysable_supplier_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT s.supplier_id
  FROM seals s LEFT JOIN clients c ON c.id = s.client_id
  WHERE s.status IN ('ACTIVE','PENDING')
    AND (s.client_id IS NULL OR coalesce(c.active, true))
$$;


--
-- Name: arr_digits(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.arr_digits(text[]) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT regexp_replace(array_to_string(coalesce($1, '{}'), ','), '[^0-9,]', '', 'g')
$_$;


--
-- Name: client_compliance_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_compliance_report() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cid uuid; r jsonb;
begin
  select ur.client_id into cid from user_roles ur
  where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null
  limit 1;
  if cid is null then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'supplier_id', t.supplier_id,
      'razao_social', t.razao_social,
      'cnpj', t.cnpj,
      'questionario', t.q_title,
      'pergunta', t.q_text,
      'resposta', t.resposta,
      'respondido_em', t.answered_at
    ) order by t.razao_social, t.q_text), '[]'::jsonb) into r
  from (
    select s.supplier_id, sup.razao_social, sup.cnpj,
           qn.title q_title, qq.text q_text, qa.answered_at,
           case when qq.type = 'boolean'
                then case when qa.answer_boolean then 'Sim' else 'Não' end
                else qa.answer_text end resposta
    from questionnaire_answers qa
    join questionnaire_questions qq on qq.id = qa.question_id
    join questionnaires qn on qn.id = qq.questionnaire_id and qn.client_id = cid
    join seals s on s.supplier_id = qa.supplier_id and s.client_id = cid
               and s.status in ('ACTIVE','PENDING')
    join suppliers sup on sup.id = qa.supplier_id
    where qq.compliance_alert is not null
      and (
        (qq.type = 'boolean' and
          ((qa.answer_boolean is true  and exists (select 1 from unnest(qq.compliance_alert) v where upper(v) in ('SIM','TRUE')))
        or (qa.answer_boolean is false and exists (select 1 from unnest(qq.compliance_alert) v where upper(v) in ('NÃO','NAO','FALSE')))))
        or
        (qq.type <> 'boolean' and qa.answer_text is not null
          and exists (select 1 from unnest(qq.compliance_alert) v
                      where position(lower(v) in lower(qa.answer_text)) > 0))
      )
  ) t;
  return r;
end $$;


--
-- Name: client_exec_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_exec_dashboard() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cid uuid; r jsonb;
begin
  select ur.client_id into cid
  from user_roles ur
  where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null
  limit 1;
  if cid is null then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'processos', (
      select jsonb_build_object(
        'em_homologacao', count(*) filter (where status = 'PENDING'),
        'homologados',    count(*) filter (where status = 'ACTIVE'),
        'suspensos',      count(*) filter (where status = 'SUSPENDED'),
        'vencidos',       count(*) filter (where status = 'EXPIRED'
                            or (status = 'ACTIVE' and expires_at < now())),
        'a_vencer_60d',   count(*) filter (where status = 'ACTIVE'
                            and expires_at between now() and now() + interval '60 days'))
      from seals where client_id = cid),
    'fornecedores', (
      select jsonb_build_object(
        'total',     count(distinct supplier_id),
        'novos_30d', count(distinct supplier_id) filter (where created_at >= now() - interval '30 days'))
      from seals where client_id = cid),
    'documentos', (
      with meus as (select distinct supplier_id from seals
                    where client_id = cid and status in ('ACTIVE','PENDING'))
      select jsonb_build_object(
        'vencidos',     count(*) filter (where d.status = 'EXPIRED'
                          or (d.expires_at < now() and d.status in ('VALID','EXPIRING'))),
        'a_vencer_30d', count(*) filter (where d.status in ('VALID','EXPIRING')
                          and d.expires_at between now() and now() + interval '30 days'),
        'em_analise',   count(*) filter (where d.status = 'PENDING'))
      from documents d join meus m on m.supplier_id = d.supplier_id),
    'convites', (
      select jsonb_build_object(
        'total',       count(*),
        'enviados',    count(*) filter (where status = 'SENT'),
        'visualizados',count(*) filter (where status = 'VIEWED'),
        'cadastrados', count(*) filter (where status = 'REGISTERED'),
        'ultimos_30d', count(*) filter (where created_at >= now() - interval '30 days'))
      from invitations where client_id = cid),
    'rfq', (
      select jsonb_build_object(
        'total',       count(distinct q.id),
        'ultimas_30d', count(distinct q.id) filter (where q.created_at >= now() - interval '30 days'),
        'respostas',   count(rr.id))
      from rfqs q left join rfq_responses rr on rr.rfq_id = q.id
      where q.client_id = cid),
    'questionarios', coalesce((
      -- por questionário ativo: homologados que responderam × pendentes
      select jsonb_agg(jsonb_build_object(
        'titulo', t.title, 'respondidos', t.resp, 'nao_respondidos', t.tot - t.resp) order by t.title)
      from (
        select qn.title,
          (select count(distinct s.supplier_id) from seals s
            where s.client_id = cid and s.status = 'ACTIVE') tot,
          (select count(distinct qa.supplier_id)
             from questionnaire_answers qa
             join questionnaire_questions qq on qq.id = qa.question_id
             join seals s on s.supplier_id = qa.supplier_id
                        and s.client_id = cid and s.status = 'ACTIVE'
             where qq.questionnaire_id = qn.id) resp
        from questionnaires qn
        where qn.client_id = cid and qn.active is not false
      ) t), '[]'::jsonb),
    'homologacoes_por_mes', coalesce((
      select jsonb_agg(jsonb_build_object('mes', mes, 'n', n) order by mes)
      from (
        select date_trunc('month', coalesce(issued_at, created_at))::date mes, count(*) n
        from seals
        where client_id = cid and status = 'ACTIVE'
          and coalesce(issued_at, created_at) >= now() - interval '12 months'
        group by 1
      ) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    type text NOT NULL,
    label text,
    source text DEFAULT 'MANUAL'::text,
    status text DEFAULT 'PENDING'::text,
    storage_path text,
    public_url text,
    issued_at timestamp with time zone,
    expires_at timestamp with time zone,
    reviewed_by uuid,
    review_note text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    history jsonb DEFAULT '[]'::jsonb,
    hoc_arquivo_id integer,
    hoc_s3_url text,
    inscription_number text,
    submitted_at timestamp with time zone,
    hoc_analysis_due date,
    CONSTRAINT documents_source_check CHECK ((source = ANY (ARRAY['MANUAL'::text, 'AUTO'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['VALID'::text, 'EXPIRING'::text, 'EXPIRED'::text, 'MISSING'::text, 'PENDING'::text, 'REJECTED'::text, 'NOT_APPLICABLE'::text])))
);


--
-- Name: doc_analysis_due(public.documents); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.doc_analysis_due(d public.documents) RETURNS date
    LANGUAGE sql STABLE
    AS $$
  SELECT coalesce(d.hoc_analysis_due,
                  add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3))
$$;


--
-- Name: fn_auto_create_process_seal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_create_process_seal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Dispara apenas na transição para REGISTERED com client_id preenchido
  IF NEW.status = 'REGISTERED'
     AND NEW.client_id IS NOT NULL
     AND NEW.supplier_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'REGISTERED')
  THEN
    INSERT INTO public.seals (supplier_id, client_id, status, level, seal_name)
    SELECT
      NEW.supplier_id,
      NEW.client_id,
      'PENDING',
      'Simples',
      'Processo ' || COALESCE(c.razao_social, 'Cliente')
    FROM public.clients c
    WHERE c.id = NEW.client_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_check_supplier_user_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_supplier_user_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.role = 'SUPPLIER' AND NEW.is_active = true THEN
    IF (SELECT COUNT(*) FROM public.user_roles
        WHERE supplier_id = NEW.supplier_id AND role = 'SUPPLIER' AND is_active = true
          AND id IS DISTINCT FROM NEW.id) >= 4 THEN
      RAISE EXCEPTION 'Limite de 4 usuários por fornecedor atingido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_document_history_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_document_history_snapshot() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
    ELSIF NEW.storage_path IS DISTINCT FROM OLD.storage_path                 THEN v_event := 'UPLOADED';
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
     expires_at, issued_at, review_note, reviewed_by, inscription_number)
  VALUES
    (NEW.id, NEW.supplier_id, NEW.type, NEW.label, v_event, NEW.status, NEW.source, NEW.storage_path,
     NEW.expires_at, NEW.issued_at, NEW.review_note, NEW.reviewed_by, NEW.inscription_number);

  RETURN NEW;
END;
$$;


--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'SUPPLIER'),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN');
$$;


--
-- Name: marketplace_category_suppliers(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_category_suppliers(cat_ids bigint[]) RETURNS TABLE(supplier_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH sel AS (
    SELECT DISTINCT lower(trim(name)) AS nm FROM categories WHERE id = ANY(cat_ids)
  ), expanded AS (
    SELECT id FROM categories WHERE id = ANY(cat_ids)
    UNION
    SELECT c.id FROM categories c JOIN sel ON lower(trim(c.name)) = sel.nm
    WHERE c.client_id IS NOT NULL
  )
  SELECT DISTINCT sc.supplier_id
  FROM supplier_categories sc
  WHERE sc.category_id IN (SELECT id FROM expanded);
$$;


--
-- Name: my_supplier_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_supplier_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT supplier_id FROM user_roles
  WHERE user_id = auth.uid() AND role = 'SUPPLIER'
    AND supplier_id IS NOT NULL AND COALESCE(is_active, true)
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: supplier_ready_for_analysis(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_ready_for_analysis(p_supplier uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ready boolean := false; s record; req_missing int; q_missing int; req_ids int[];
BEGIN
  -- selo vindo do HOC (o HOC controla o estado) ou selo já ATIVO → entra
  IF EXISTS (SELECT 1 FROM seals WHERE supplier_id = p_supplier
              AND (hoc_process_id IS NOT NULL OR status = 'ACTIVE')) THEN
    RETURN true;
  END IF;
  FOR s IN SELECT * FROM seals WHERE supplier_id = p_supplier AND status = 'PENDING' LOOP
    -- exigência: categorias do fornecedor DENTRO do cliente; fallback fluxo
    SELECT array_agg(DISTINCT cd.document_id) INTO req_ids
    FROM supplier_categories sc
    JOIN categories c ON c.id = sc.category_id AND c.client_id = s.client_id
    JOIN category_documents cd ON cd.category_id = sc.category_id AND cd.required
    WHERE sc.supplier_id = p_supplier;
    IF req_ids IS NULL AND s.flow_id IS NOT NULL THEN
      SELECT array_agg(DISTINCT cd.document_id) INTO req_ids
      FROM client_flow_categories fc
      JOIN category_documents cd ON cd.category_id = fc.category_id AND cd.required
      WHERE fc.flow_id = s.flow_id;
    END IF;
    IF s.client_id IS NULL OR req_ids IS NULL THEN
      req_ids := ARRAY[37,61,62,7,42,8];  -- ELOS Verificado
    END IF;
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
    END IF;
    IF req_missing = 0 AND q_missing = 0 THEN ready := true; EXIT; END IF;
  END LOOP;
  RETURN ready;
END $$;


--
-- Name: trg_documents_submitted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_documents_submitted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PENDING') THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: access_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role_type text NOT NULL,
    modules text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_profiles_role_type_check CHECK ((role_type = ANY (ARRAY['CLIENT'::text, 'SUPPLIER'::text])))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: assertiva_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assertiva_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    cnpj text NOT NULL,
    report_data jsonb NOT NULL,
    protocol text,
    score_classe text,
    score_pontos integer,
    generated_at timestamp with time zone DEFAULT now(),
    generated_by uuid
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text,
    image_alt text,
    title text,
    body text,
    tipo text DEFAULT 'novidade'::text,
    cta_label text,
    cta_url text,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT banners_tipo_check CHECK ((tipo = ANY (ARRAY['novidade'::text, 'manutencao'::text, 'lancamento'::text, 'produto'::text, 'feriado'::text])))
);


--
-- Name: bc_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bc_config (
    key text NOT NULL,
    value jsonb
);


--
-- Name: buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cnpj text,
    razao_social text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    parent_id integer,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    is_custom boolean DEFAULT false,
    proposed_by uuid,
    approved boolean DEFAULT false,
    is_active boolean DEFAULT true,
    client_id uuid,
    hoc_id integer,
    codigo text,
    name_en text
);


--
-- Name: COLUMN categories.client_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.client_id IS 'NULL = categoria global (árvore ELOS, marketplace). Preenchido = categoria custom do cliente HOC, visível só no contexto dele';


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categories ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: category_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id integer,
    document_id integer,
    required boolean DEFAULT true,
    blocking boolean DEFAULT false
);


--
-- Name: client_document_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_document_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    category_id integer,
    catalog_id integer NOT NULL,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    flow_id uuid,
    blocking boolean DEFAULT false NOT NULL
);


--
-- Name: client_flow_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_flow_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    category_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    price numeric(10,2),
    price_subsidized numeric(10,2),
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: client_landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_landing_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    slug character varying(100) NOT NULL,
    company_name character varying(255) NOT NULL,
    logo_url text,
    hero_image_url text,
    accent_color character varying(7) DEFAULT '#F47E2F'::character varying,
    description text,
    compliance_url text,
    website_url text,
    linkedin_url text,
    contact_email text,
    badges text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone character varying(30),
    secondary_color character varying(7) DEFAULT '#1B2A4A'::character varying
);


--
-- Name: client_term_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_term_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    item_version integer NOT NULL,
    client_id uuid NOT NULL,
    supplier_id uuid,
    invitation_id uuid,
    accepted_name text,
    accepted_email text,
    accepted_ip text,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_terms_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_terms_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    content text,
    storage_path text,
    file_name text,
    version integer DEFAULT 1 NOT NULL,
    required boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT client_terms_items_kind_check CHECK ((kind = ANY (ARRAY['TEXT'::text, 'DOCUMENT'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cnpj text,
    razao_social text NOT NULL,
    nome_fantasia text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    terms_content text,
    terms_updated_at timestamp with time zone,
    hoc_id integer,
    homologation_price numeric(10,2) DEFAULT 390.00,
    homologation_payer text DEFAULT 'supplier'::text,
    sigla text,
    hoc_extra jsonb,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT clients_homologation_payer_check CHECK ((homologation_payer = ANY (ARRAY['supplier'::text, 'client'::text])))
);


--
-- Name: cnaes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cnaes (
    codigo text NOT NULL,
    descricao text NOT NULL,
    codigo_setor text,
    setor text
);


--
-- Name: cnpj_consultations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cnpj_consultations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cnpj text NOT NULL,
    supplier_id uuid,
    cnpj_data jsonb,
    sanctions_data jsonb,
    has_sanctions boolean DEFAULT false,
    consulted_at timestamp with time zone DEFAULT now(),
    sanctions_history jsonb DEFAULT '{}'::jsonb
);


--
-- Name: document_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    type text NOT NULL,
    label text,
    event text NOT NULL,
    status text,
    source text,
    storage_path text,
    expires_at timestamp with time zone,
    issued_at timestamp with time zone,
    review_note text,
    reviewed_by uuid,
    inscription_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_history_event_check CHECK ((event = ANY (ARRAY['CREATED'::text, 'UPLOADED'::text, 'APPROVED'::text, 'REJECTED'::text, 'REVOKED'::text, 'EXPIRED'::text, 'UPDATED'::text])))
);


--
-- Name: documents_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents_catalog (
    id integer NOT NULL,
    name text NOT NULL,
    auto_collect boolean DEFAULT false,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    responsibility text DEFAULT 'fornecedor'::text NOT NULL,
    analysis_sla_days integer DEFAULT 5 NOT NULL,
    hoc_tipo text,
    dado_pessoal boolean DEFAULT false NOT NULL,
    validation_rule text,
    CONSTRAINT documents_catalog_responsibility_check CHECK ((responsibility = ANY (ARRAY['interna'::text, 'fornecedor'::text, 'cliente'::text])))
);


--
-- Name: COLUMN documents_catalog.responsibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents_catalog.responsibility IS 'Quem fornece o documento: interna (auto-coleta EQPI), fornecedor (upload) ou cliente';


--
-- Name: COLUMN documents_catalog.analysis_sla_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents_catalog.analysis_sla_days IS 'Prazo em dias corridos entre o envio e a data limite de análise (farol)';


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    descricao text NOT NULL,
    data date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid,
    supplier_id uuid,
    buyer_name text DEFAULT ''::text NOT NULL,
    buyer_email text DEFAULT ''::text NOT NULL,
    supplier_razao_social text DEFAULT ''::text NOT NULL,
    supplier_cnpj text DEFAULT ''::text NOT NULL,
    supplier_email text,
    status text DEFAULT 'SENT'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    client_id uuid,
    tipo_fornecedor text,
    subsidiado boolean DEFAULT false,
    telefone text,
    contato text,
    escopo text,
    invited_by_role text DEFAULT 'BUYER'::text,
    token uuid DEFAULT gen_random_uuid(),
    viewed_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    objetivo text DEFAULT 'homologacao'::text NOT NULL,
    last_reminder_at timestamp with time zone,
    reminder_count integer DEFAULT 0 NOT NULL,
    flow_id uuid,
    message text,
    CONSTRAINT invitations_invited_by_role_check CHECK ((invited_by_role = ANY (ARRAY['BUYER'::text, 'CLIENT'::text, 'ADMIN'::text]))),
    CONSTRAINT invitations_objetivo_check CHECK ((objetivo = ANY (ARRAY['contato'::text, 'homologacao'::text]))),
    CONSTRAINT invitations_tipo_fornecedor_check CHECK ((tipo_fornecedor = ANY (ARRAY['produto'::text, 'servico'::text, 'ambos'::text])))
);


--
-- Name: nfe_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfe_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    source text DEFAULT 'STRIPE'::text NOT NULL,
    stripe_invoice_id text,
    stripe_session_id text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'brl'::text NOT NULL,
    plan_type text,
    description text,
    paid_at timestamp with time zone,
    status text DEFAULT 'PENDING'::text NOT NULL,
    nfeio_id text,
    serie text,
    numero text,
    codigo_verificacao text,
    nfe_status text,
    log_erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    emitted_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    type text,
    cnae_count integer DEFAULT 3,
    price_yearly numeric(10,2),
    stripe_sub_id text,
    stripe_customer_id text,
    stripe_session_id text,
    status text DEFAULT 'PENDING'::text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hoc_process_id integer,
    source text DEFAULT 'STRIPE'::text,
    CONSTRAINT plans_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PENDING'::text, 'PAST_DUE'::text, 'CANCELED'::text, 'TRIALING'::text]))),
    CONSTRAINT plans_type_check CHECK ((type = ANY (ARRAY['verificado'::text, 'homologado'::text, 'verificado_anual'::text, 'verificado_mensal'::text, 'homologado_anual'::text, 'comprador_pro_anual'::text, 'comprador_pro_mensal'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role text DEFAULT 'SUPPLIER'::text NOT NULL,
    name text,
    supplier_id uuid,
    buyer_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    onboarding_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['SUPPLIER'::text, 'BUYER'::text, 'ADMIN'::text, 'CLIENT'::text])))
);


--
-- Name: questionnaire_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    answer_boolean boolean,
    answer_text text,
    answered_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: questionnaire_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaire_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    questionnaire_id uuid NOT NULL,
    text text NOT NULL,
    type text DEFAULT 'boolean'::text NOT NULL,
    options jsonb,
    required boolean DEFAULT true,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    compliance_alert text[],
    CONSTRAINT questionnaire_questions_type_check CHECK ((type = ANY (ARRAY['boolean'::text, 'text'::text, 'select'::text])))
);


--
-- Name: questionnaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rejection_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rejection_reasons (
    id integer NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    applies_to text DEFAULT 'both'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rejection_reasons_applies_to_check CHECK ((applies_to = ANY (ARRAY['document'::text, 'seal'::text, 'both'::text])))
);


--
-- Name: rejection_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rejection_reasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rejection_reasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rejection_reasons_id_seq OWNED BY public.rejection_reasons.id;


--
-- Name: report_evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_evidences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_result_id uuid,
    kind text,
    storage_path text NOT NULL,
    sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: report_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cnpj text NOT NULL,
    supplier_id uuid,
    tipo text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid,
    requested_channel text,
    force_refresh_bureau boolean DEFAULT false,
    score_eqpi integer,
    risk_band text,
    parecer text,
    pdf_path text,
    cost_brl numeric(10,2) DEFAULT 0,
    price_brl numeric(10,2),
    error text,
    created_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    CONSTRAINT report_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'collecting'::text, 'rendering'::text, 'done'::text, 'done_partial'::text, 'failed'::text, 'canceled'::text]))),
    CONSTRAINT report_requests_tipo_check CHECK ((tipo = ANY (ARRAY['light'::text, 'full'::text])))
);


--
-- Name: rfq_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfq_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    message text,
    price numeric(18,2),
    status text DEFAULT 'SENT'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rfq_responses_status_check CHECK ((status = ANY (ARRAY['SENT'::text, 'READ'::text, 'ACCEPTED'::text, 'DECLINED'::text])))
);


--
-- Name: rfqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid,
    supplier_id uuid,
    category text,
    message text,
    status text DEFAULT 'SENT'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    client_id uuid,
    title text,
    description text,
    category_id integer,
    deadline timestamp with time zone,
    requester_role text DEFAULT 'BUYER'::text,
    CONSTRAINT rfqs_requester_role_check CHECK ((requester_role = ANY (ARRAY['BUYER'::text, 'CLIENT'::text]))),
    CONSTRAINT rfqs_status_check CHECK ((status = ANY (ARRAY['SENT'::text, 'VIEWED'::text, 'RESPONDED'::text, 'CONVERTED'::text, 'CLOSED'::text])))
);


--
-- Name: seals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    level text DEFAULT 'Simples'::text,
    status text DEFAULT 'PENDING'::text,
    score integer DEFAULT 0,
    issued_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    suspended_reason text,
    issued_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    notification_sent boolean DEFAULT false,
    rejection_reason text,
    client_id uuid,
    seal_name text,
    client_suspended_at timestamp with time zone,
    client_suspended_reason text,
    hoc_process_id integer,
    hoc_expiry_date date,
    hoc_resultado text,
    seal_type text,
    billing_cycle text DEFAULT 'anual'::text,
    reputation_tier text,
    hoc_questionario jsonb,
    exception boolean DEFAULT false NOT NULL,
    exception_note text,
    flow_id uuid,
    cert_code text GENERATED ALWAYS AS (('ELOS-'::text || upper(substr(replace((id)::text, '-'::text, ''::text), 1, 12)))) STORED,
    CONSTRAINT seals_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['anual'::text, 'mensal'::text]))),
    CONSTRAINT seals_level_check CHECK ((level = ANY (ARRAY['Simples'::text, 'Premium'::text, 'HOC'::text]))),
    CONSTRAINT seals_reputation_tier_check CHECK ((reputation_tier = ANY (ARRAY['bronze'::text, 'prata'::text, 'ouro'::text]))),
    CONSTRAINT seals_seal_type_check CHECK ((seal_type = ANY (ARRAY['verificado'::text, 'homologado'::text]))),
    CONSTRAINT seals_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PENDING'::text, 'SUSPENDED'::text, 'EXPIRED'::text])))
);


--
-- Name: source_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    cnpj text NOT NULL,
    connector text NOT NULL,
    route text NOT NULL,
    status text NOT NULL,
    parsed jsonb,
    raw jsonb,
    result_flag text,
    cost_brl numeric(10,4) DEFAULT 0,
    valid_until timestamp with time zone,
    protocol text,
    reused_from uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT source_results_route_check CHECK ((route = ANY (ARRAY['free'::text, 'infosimples'::text, 'assertiva'::text, 'local_db'::text]))),
    CONSTRAINT source_results_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'not_found'::text, 'failed_soft'::text, 'failed'::text])))
);


--
-- Name: supplier_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    bank_name text,
    bank_code text,
    bank_agency text,
    bank_account text,
    account_type text,
    pix_key text,
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hoc_id integer,
    CONSTRAINT supplier_bank_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['corrente'::text, 'poupanca'::text])))
);


--
-- Name: supplier_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    category_id integer,
    selected_at timestamp with time zone DEFAULT now(),
    cnae text,
    cnae_validated_at timestamp with time zone,
    cnae_validated_by uuid
);


--
-- Name: supplier_category_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_category_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    seal_id uuid NOT NULL,
    category_id integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    client_id uuid,
    letter_path text,
    letter_name text,
    client_note text,
    requested_by uuid,
    CONSTRAINT supplier_category_approvals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'REJECTED'::text, 'SUSPENDED'::text])))
);


--
-- Name: supplier_financials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    year integer NOT NULL,
    receita numeric(18,2),
    ativo numeric(18,2),
    passivo numeric(18,2),
    lucro numeric(18,2),
    ebitda numeric(18,2),
    estoque numeric(18,2),
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    client_id uuid NOT NULL,
    message text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_interests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'DISMISSED'::text])))
);


--
-- Name: supplier_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    document_id uuid,
    tipo text,
    cpf_cnpj text,
    nome text NOT NULL,
    cargo text,
    nacionalidade text,
    participacao numeric(5,2),
    registered_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    hoc_id integer,
    enriched_from text,
    enriched_at timestamp with time zone,
    telefone text,
    CONSTRAINT supplier_partners_tipo_check CHECK ((tipo = ANY (ARRAY['pf'::text, 'pj'::text, 'estrangeiro'::text])))
);


--
-- Name: supplier_sanctions_manual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_sanctions_manual (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    tipo text,
    data_final date,
    orgao text,
    uf character(2),
    registered_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cnpj text NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    cnae_main text,
    cnae_list text[] DEFAULT '{}'::text[],
    state text,
    city text,
    address jsonb,
    phone text,
    employee_range text,
    revenue_range text,
    services text[] DEFAULT '{}'::text[],
    certifications text[] DEFAULT '{}'::text[],
    status text DEFAULT 'PENDING'::text,
    sanctions_checked boolean DEFAULT false,
    sanctions_result jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    terms_accepted boolean DEFAULT false,
    terms_accepted_at timestamp with time zone,
    data_sharing_accepted boolean DEFAULT false,
    hoc_id integer,
    email text,
    contact_name text,
    regime_tributario text,
    capital_social numeric(18,2),
    simples_nacional boolean,
    latitude numeric(10,7),
    longitude numeric(10,7),
    archived_at timestamp with time zone,
    archived_by uuid,
    archive_reason text,
    inscricao_estadual text,
    inscricao_municipal text,
    data_abertura date,
    tipo_empresa text,
    email_financeiro text,
    hoc_extra jsonb,
    enriched_from text,
    enriched_at timestamp with time zone,
    cnae_main_digits text GENERATED ALWAYS AS (regexp_replace(COALESCE(cnae_main, ''::text), '[^0-9]'::text, ''::text, 'g'::text)) STORED,
    cnae_all_digits text GENERATED ALWAYS AS (public.arr_digits(cnae_list)) STORED,
    CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PENDING'::text, 'SUSPENDED'::text, 'INACTIVE'::text])))
);


--
-- Name: sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_state (
    entity text NOT NULL,
    watermark text,
    last_id bigint,
    last_run_at timestamp with time zone,
    rows_read integer,
    rows_written integer,
    status text,
    error text,
    duration_s numeric
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role text NOT NULL,
    supplier_id uuid,
    buyer_id uuid,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    client_id uuid,
    invited_by uuid,
    is_active boolean DEFAULT true,
    buyer_plan text DEFAULT 'free'::text,
    buyer_plan_expires_at timestamp with time zone,
    buyer_stripe_sub_id text,
    buyer_stripe_customer_id text,
    access_profile text DEFAULT 'full'::text NOT NULL,
    access_profile_id uuid,
    CONSTRAINT user_roles_access_profile_check CHECK ((access_profile = ANY (ARRAY['full'::text, 'analyst'::text, 'readonly'::text]))),
    CONSTRAINT user_roles_buyer_plan_check CHECK ((buyer_plan = ANY (ARRAY['free'::text, 'pro'::text]))),
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['SUPPLIER'::text, 'BUYER'::text, 'ADMIN'::text, 'CLIENT'::text])))
);


--
-- Name: COLUMN user_roles.access_profile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.access_profile IS 'full = acesso completo | analyst = ADMIN restrito a análises | readonly = CLIENT somente leitura';


--
-- Name: v_count; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.v_count (
    count bigint
);


--
-- Name: rejection_reasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rejection_reasons ALTER COLUMN id SET DEFAULT nextval('public.rejection_reasons_id_seq'::regclass);


--
-- Name: access_profiles access_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_pkey PRIMARY KEY (id);


--
-- Name: access_profiles access_profiles_role_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_role_type_name_key UNIQUE (role_type, name);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: assertiva_reports assertiva_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assertiva_reports
    ADD CONSTRAINT assertiva_reports_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: bc_config bc_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_config
    ADD CONSTRAINT bc_config_pkey PRIMARY KEY (key);


--
-- Name: buyers buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyers
    ADD CONSTRAINT buyers_pkey PRIMARY KEY (id);


--
-- Name: buyers buyers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyers
    ADD CONSTRAINT buyers_user_id_key UNIQUE (user_id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: category_documents category_documents_category_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_documents
    ADD CONSTRAINT category_documents_category_id_document_id_key UNIQUE (category_id, document_id);


--
-- Name: category_documents category_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_documents
    ADD CONSTRAINT category_documents_pkey PRIMARY KEY (id);


--
-- Name: client_document_flows client_document_flows_client_id_category_id_catalog_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_client_id_category_id_catalog_id_key UNIQUE (client_id, category_id, catalog_id);


--
-- Name: client_document_flows client_document_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_pkey PRIMARY KEY (id);


--
-- Name: client_flow_categories client_flow_categories_flow_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flow_categories
    ADD CONSTRAINT client_flow_categories_flow_id_category_id_key UNIQUE (flow_id, category_id);


--
-- Name: client_flow_categories client_flow_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flow_categories
    ADD CONSTRAINT client_flow_categories_pkey PRIMARY KEY (id);


--
-- Name: client_flows client_flows_client_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flows
    ADD CONSTRAINT client_flows_client_id_name_key UNIQUE (client_id, name);


--
-- Name: client_flows client_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flows
    ADD CONSTRAINT client_flows_pkey PRIMARY KEY (id);


--
-- Name: client_landing_pages client_landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_landing_pages
    ADD CONSTRAINT client_landing_pages_pkey PRIMARY KEY (id);


--
-- Name: client_landing_pages client_landing_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_landing_pages
    ADD CONSTRAINT client_landing_pages_slug_key UNIQUE (slug);


--
-- Name: client_term_acceptances client_term_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_term_acceptances
    ADD CONSTRAINT client_term_acceptances_pkey PRIMARY KEY (id);


--
-- Name: client_terms_items client_terms_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_terms_items
    ADD CONSTRAINT client_terms_items_pkey PRIMARY KEY (id);


--
-- Name: clients clients_hoc_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_hoc_id_key UNIQUE (hoc_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_key UNIQUE (user_id);


--
-- Name: cnaes cnaes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cnaes
    ADD CONSTRAINT cnaes_pkey PRIMARY KEY (codigo);


--
-- Name: cnpj_consultations cnpj_consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cnpj_consultations
    ADD CONSTRAINT cnpj_consultations_pkey PRIMARY KEY (id);


--
-- Name: document_history document_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history
    ADD CONSTRAINT document_history_pkey PRIMARY KEY (id);


--
-- Name: documents_catalog documents_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents_catalog
    ADD CONSTRAINT documents_catalog_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_supplier_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_supplier_type_unique UNIQUE (supplier_id, type);


--
-- Name: holidays holidays_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_data_key UNIQUE (data);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_key UNIQUE (token);


--
-- Name: nfe_invoices nfe_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_invoices
    ADD CONSTRAINT nfe_invoices_pkey PRIMARY KEY (id);


--
-- Name: nfe_invoices nfe_invoices_stripe_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_invoices
    ADD CONSTRAINT nfe_invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);


--
-- Name: nfe_invoices nfe_invoices_stripe_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_invoices
    ADD CONSTRAINT nfe_invoices_stripe_session_id_key UNIQUE (stripe_session_id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: plans plans_supplier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_supplier_id_key UNIQUE (supplier_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_answers questionnaire_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_pkey PRIMARY KEY (id);


--
-- Name: questionnaire_answers questionnaire_answers_question_id_supplier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_question_id_supplier_id_key UNIQUE (question_id, supplier_id);


--
-- Name: questionnaire_questions questionnaire_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_pkey PRIMARY KEY (id);


--
-- Name: questionnaires questionnaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires
    ADD CONSTRAINT questionnaires_pkey PRIMARY KEY (id);


--
-- Name: rejection_reasons rejection_reasons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rejection_reasons
    ADD CONSTRAINT rejection_reasons_code_key UNIQUE (code);


--
-- Name: rejection_reasons rejection_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rejection_reasons
    ADD CONSTRAINT rejection_reasons_pkey PRIMARY KEY (id);


--
-- Name: report_evidences report_evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_evidences
    ADD CONSTRAINT report_evidences_pkey PRIMARY KEY (id);


--
-- Name: report_requests report_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_requests
    ADD CONSTRAINT report_requests_pkey PRIMARY KEY (id);


--
-- Name: rfq_responses rfq_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_responses
    ADD CONSTRAINT rfq_responses_pkey PRIMARY KEY (id);


--
-- Name: rfq_responses rfq_responses_rfq_id_supplier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_responses
    ADD CONSTRAINT rfq_responses_rfq_id_supplier_id_key UNIQUE (rfq_id, supplier_id);


--
-- Name: rfqs rfqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_pkey PRIMARY KEY (id);


--
-- Name: seals seals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seals
    ADD CONSTRAINT seals_pkey PRIMARY KEY (id);


--
-- Name: source_results source_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_results
    ADD CONSTRAINT source_results_pkey PRIMARY KEY (id);


--
-- Name: supplier_bank_accounts supplier_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bank_accounts
    ADD CONSTRAINT supplier_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: supplier_bank_accounts supplier_bank_accounts_supplier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bank_accounts
    ADD CONSTRAINT supplier_bank_accounts_supplier_id_key UNIQUE (supplier_id);


--
-- Name: supplier_categories supplier_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_pkey PRIMARY KEY (id);


--
-- Name: supplier_categories supplier_categories_supplier_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_supplier_id_category_id_key UNIQUE (supplier_id, category_id);


--
-- Name: supplier_category_approvals supplier_category_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_pkey PRIMARY KEY (id);


--
-- Name: supplier_category_approvals supplier_category_approvals_supplier_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_supplier_id_category_id_key UNIQUE (supplier_id, category_id);


--
-- Name: supplier_financials supplier_financials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_financials
    ADD CONSTRAINT supplier_financials_pkey PRIMARY KEY (id);


--
-- Name: supplier_financials supplier_financials_supplier_id_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_financials
    ADD CONSTRAINT supplier_financials_supplier_id_year_key UNIQUE (supplier_id, year);


--
-- Name: supplier_interests supplier_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_interests
    ADD CONSTRAINT supplier_interests_pkey PRIMARY KEY (id);


--
-- Name: supplier_interests supplier_interests_supplier_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_interests
    ADD CONSTRAINT supplier_interests_supplier_id_client_id_key UNIQUE (supplier_id, client_id);


--
-- Name: supplier_partners supplier_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_partners
    ADD CONSTRAINT supplier_partners_pkey PRIMARY KEY (id);


--
-- Name: supplier_sanctions_manual supplier_sanctions_manual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sanctions_manual
    ADD CONSTRAINT supplier_sanctions_manual_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_cnpj_key UNIQUE (cnpj);


--
-- Name: suppliers suppliers_hoc_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_hoc_id_key UNIQUE (hoc_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: sync_state sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_state
    ADD CONSTRAINT sync_state_pkey PRIMARY KEY (entity);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: assertiva_reports_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assertiva_reports_supplier_idx ON public.assertiva_reports USING btree (supplier_id, generated_at DESC);


--
-- Name: audit_log_entity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_created_idx ON public.audit_log USING btree (entity_id, created_at DESC);


--
-- Name: categories_hoc_client_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_hoc_client_unique ON public.categories USING btree (hoc_id) WHERE (hoc_id IS NOT NULL);


--
-- Name: client_document_flows_flow_catalog_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_document_flows_flow_catalog_unique ON public.client_document_flows USING btree (flow_id, catalog_id) WHERE (flow_id IS NOT NULL);


--
-- Name: client_flows_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_flows_one_default ON public.client_flows USING btree (client_id) WHERE is_default;


--
-- Name: idx_catdocs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catdocs_category ON public.category_documents USING btree (category_id);


--
-- Name: idx_categories_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_client ON public.categories USING btree (client_id) WHERE (client_id IS NOT NULL);


--
-- Name: idx_categories_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_norm_name ON public.categories USING btree (lower(TRIM(BOTH FROM name))) WHERE (client_id IS NOT NULL);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);


--
-- Name: idx_client_lp_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_lp_slug ON public.client_landing_pages USING btree (slug);


--
-- Name: idx_clientflows_catcat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientflows_catcat ON public.client_document_flows USING btree (category_id, catalog_id);


--
-- Name: idx_clientflows_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientflows_client ON public.client_document_flows USING btree (client_id);


--
-- Name: idx_dochist_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dochist_document ON public.document_history USING btree (document_id, created_at DESC);


--
-- Name: idx_dochist_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dochist_supplier ON public.document_history USING btree (supplier_id, type, created_at DESC);


--
-- Name: idx_invitations_buyer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_buyer_id ON public.invitations USING btree (buyer_id);


--
-- Name: idx_invitations_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_client_id ON public.invitations USING btree (client_id);


--
-- Name: idx_invitations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_created_at ON public.invitations USING btree (created_at DESC);


--
-- Name: idx_invitations_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_supplier_id ON public.invitations USING btree (supplier_id);


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token ON public.invitations USING btree (token);


--
-- Name: idx_rejection_reasons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rejection_reasons_code ON public.rejection_reasons USING btree (code);


--
-- Name: idx_report_requests_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_requests_cnpj ON public.report_requests USING btree (cnpj, created_at DESC);


--
-- Name: idx_report_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_requests_status ON public.report_requests USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'collecting'::text, 'rendering'::text]));


--
-- Name: idx_rfqr_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqr_rfq ON public.rfq_responses USING btree (rfq_id);


--
-- Name: idx_rfqr_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqr_supplier ON public.rfq_responses USING btree (supplier_id);


--
-- Name: idx_sba_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sba_supplier ON public.supplier_bank_accounts USING btree (supplier_id);


--
-- Name: idx_sca_seal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sca_seal ON public.supplier_category_approvals USING btree (seal_id);


--
-- Name: idx_sca_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sca_supplier ON public.supplier_category_approvals USING btree (supplier_id);


--
-- Name: idx_seals_active_funnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seals_active_funnel ON public.seals USING btree (supplier_id, seal_type, client_id) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_seals_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seals_client_id ON public.seals USING btree (client_id);


--
-- Name: idx_seals_seal_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seals_seal_type ON public.seals USING btree (seal_type);


--
-- Name: idx_seals_supplier_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seals_supplier_status ON public.seals USING btree (supplier_id, status);


--
-- Name: idx_sf_supplier_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sf_supplier_year ON public.supplier_financials USING btree (supplier_id, year DESC);


--
-- Name: idx_source_results_cache; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_results_cache ON public.source_results USING btree (cnpj, connector, created_at DESC);


--
-- Name: idx_supplier_categories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_categories_category ON public.supplier_categories USING btree (category_id);


--
-- Name: idx_suppliers_cnae_all_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_cnae_all_trgm ON public.suppliers USING gin (cnae_all_digits public.gin_trgm_ops);


--
-- Name: idx_suppliers_cnae_main_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_cnae_main_trgm ON public.suppliers USING gin (cnae_main_digits public.gin_trgm_ops);


--
-- Name: idx_suppliers_cnpj_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_cnpj_trgm ON public.suppliers USING gin (cnpj public.gin_trgm_ops);


--
-- Name: idx_suppliers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_created_at ON public.suppliers USING btree (created_at);


--
-- Name: idx_suppliers_razao_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_razao_trgm ON public.suppliers USING gin (razao_social public.gin_trgm_ops);


--
-- Name: idx_suppliers_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_state ON public.suppliers USING btree (state);


--
-- Name: idx_suppliers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_status ON public.suppliers USING btree (status);


--
-- Name: idx_term_acc_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_term_acc_item ON public.client_term_acceptances USING btree (item_id);


--
-- Name: idx_term_acc_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_term_acc_supplier ON public.client_term_acceptances USING btree (supplier_id);


--
-- Name: idx_terms_items_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_terms_items_client ON public.client_terms_items USING btree (client_id) WHERE active;


--
-- Name: nfe_invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nfe_invoices_status_idx ON public.nfe_invoices USING btree (status);


--
-- Name: sca_seal_category_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sca_seal_category_unique ON public.supplier_category_approvals USING btree (seal_id, category_id);


--
-- Name: seals_cert_code_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX seals_cert_code_uniq ON public.seals USING btree (cert_code);


--
-- Name: seals_supplier_client_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX seals_supplier_client_unique ON public.seals USING btree (supplier_id, client_id) WHERE (client_id IS NOT NULL);


--
-- Name: seals_supplier_simples_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX seals_supplier_simples_unique ON public.seals USING btree (supplier_id) WHERE (client_id IS NULL);


--
-- Name: supplier_partners_hoc_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_partners_hoc_unique ON public.supplier_partners USING btree (hoc_id);


--
-- Name: client_landing_pages client_landing_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER client_landing_pages_updated_at BEFORE UPDATE ON public.client_landing_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: clients clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: documents documents_submitted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_submitted BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_submitted();


--
-- Name: documents documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: plans plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: rfqs rfqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rfqs_updated_at BEFORE UPDATE ON public.rfqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: seals seals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seals_updated_at BEFORE UPDATE ON public.seals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: suppliers suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: invitations trg_auto_create_process_seal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_create_process_seal AFTER UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_process_seal();


--
-- Name: documents trg_document_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_history AFTER INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.fn_document_history_snapshot();


--
-- Name: user_roles trg_supplier_user_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supplier_user_limit BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.fn_check_supplier_user_limit();


--
-- Name: access_profiles access_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: assertiva_reports assertiva_reports_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assertiva_reports
    ADD CONSTRAINT assertiva_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES auth.users(id);


--
-- Name: assertiva_reports assertiva_reports_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assertiva_reports
    ADD CONSTRAINT assertiva_reports_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: banners banners_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: buyers buyers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyers
    ADD CONSTRAINT buyers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: categories categories_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: categories categories_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: category_documents category_documents_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_documents
    ADD CONSTRAINT category_documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: category_documents category_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_documents
    ADD CONSTRAINT category_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents_catalog(id) ON DELETE CASCADE;


--
-- Name: client_document_flows client_document_flows_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.documents_catalog(id) ON DELETE CASCADE;


--
-- Name: client_document_flows client_document_flows_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: client_document_flows client_document_flows_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_document_flows client_document_flows_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_document_flows
    ADD CONSTRAINT client_document_flows_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.client_flows(id) ON DELETE CASCADE;


--
-- Name: client_flow_categories client_flow_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flow_categories
    ADD CONSTRAINT client_flow_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: client_flow_categories client_flow_categories_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flow_categories
    ADD CONSTRAINT client_flow_categories_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.client_flows(id) ON DELETE CASCADE;


--
-- Name: client_flows client_flows_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flows
    ADD CONSTRAINT client_flows_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_flows client_flows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_flows
    ADD CONSTRAINT client_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: client_landing_pages client_landing_pages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_landing_pages
    ADD CONSTRAINT client_landing_pages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_term_acceptances client_term_acceptances_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_term_acceptances
    ADD CONSTRAINT client_term_acceptances_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.client_terms_items(id) ON DELETE RESTRICT;


--
-- Name: client_term_acceptances client_term_acceptances_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_term_acceptances
    ADD CONSTRAINT client_term_acceptances_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: client_terms_items client_terms_items_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_terms_items
    ADD CONSTRAINT client_terms_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cnpj_consultations cnpj_consultations_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cnpj_consultations
    ADD CONSTRAINT cnpj_consultations_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: document_history document_history_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history
    ADD CONSTRAINT document_history_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: documents documents_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: documents documents_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: holidays holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: invitations invitations_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyers(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.client_flows(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: nfe_invoices nfe_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfe_invoices
    ADD CONSTRAINT nfe_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: plans plans_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: questionnaire_answers questionnaire_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questionnaire_questions(id);


--
-- Name: questionnaire_answers questionnaire_answers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_answers
    ADD CONSTRAINT questionnaire_answers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: questionnaire_questions questionnaire_questions_questionnaire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaire_questions
    ADD CONSTRAINT questionnaire_questions_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES public.questionnaires(id);


--
-- Name: questionnaires questionnaires_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires
    ADD CONSTRAINT questionnaires_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: report_evidences report_evidences_source_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_evidences
    ADD CONSTRAINT report_evidences_source_result_id_fkey FOREIGN KEY (source_result_id) REFERENCES public.source_results(id);


--
-- Name: report_requests report_requests_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_requests
    ADD CONSTRAINT report_requests_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: rfq_responses rfq_responses_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_responses
    ADD CONSTRAINT rfq_responses_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON DELETE CASCADE;


--
-- Name: rfq_responses rfq_responses_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_responses
    ADD CONSTRAINT rfq_responses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: rfqs rfqs_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyers(id) ON DELETE SET NULL;


--
-- Name: rfqs rfqs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: rfqs rfqs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: rfqs rfqs_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: seals seals_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seals
    ADD CONSTRAINT seals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: seals seals_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seals
    ADD CONSTRAINT seals_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.client_flows(id) ON DELETE SET NULL;


--
-- Name: seals seals_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seals
    ADD CONSTRAINT seals_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES auth.users(id);


--
-- Name: seals seals_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seals
    ADD CONSTRAINT seals_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: source_results source_results_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_results
    ADD CONSTRAINT source_results_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.report_requests(id);


--
-- Name: supplier_bank_accounts supplier_bank_accounts_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bank_accounts
    ADD CONSTRAINT supplier_bank_accounts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_bank_accounts supplier_bank_accounts_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bank_accounts
    ADD CONSTRAINT supplier_bank_accounts_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: supplier_categories supplier_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: supplier_categories supplier_categories_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_categories
    ADD CONSTRAINT supplier_categories_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_category_approvals supplier_category_approvals_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: supplier_category_approvals supplier_category_approvals_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: supplier_category_approvals supplier_category_approvals_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: supplier_category_approvals supplier_category_approvals_seal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_seal_id_fkey FOREIGN KEY (seal_id) REFERENCES public.seals(id) ON DELETE CASCADE;


--
-- Name: supplier_category_approvals supplier_category_approvals_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_category_approvals
    ADD CONSTRAINT supplier_category_approvals_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_financials supplier_financials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_financials
    ADD CONSTRAINT supplier_financials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_financials supplier_financials_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_financials
    ADD CONSTRAINT supplier_financials_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: supplier_interests supplier_interests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_interests
    ADD CONSTRAINT supplier_interests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: supplier_interests supplier_interests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_interests
    ADD CONSTRAINT supplier_interests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: supplier_interests supplier_interests_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_interests
    ADD CONSTRAINT supplier_interests_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_partners supplier_partners_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_partners
    ADD CONSTRAINT supplier_partners_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: supplier_partners supplier_partners_registered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_partners
    ADD CONSTRAINT supplier_partners_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES auth.users(id);


--
-- Name: supplier_partners supplier_partners_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_partners
    ADD CONSTRAINT supplier_partners_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_sanctions_manual supplier_sanctions_manual_registered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sanctions_manual
    ADD CONSTRAINT supplier_sanctions_manual_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES auth.users(id);


--
-- Name: supplier_sanctions_manual supplier_sanctions_manual_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sanctions_manual
    ADD CONSTRAINT supplier_sanctions_manual_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id);


--
-- Name: suppliers suppliers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_access_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_access_profile_id_fkey FOREIGN KEY (access_profile_id) REFERENCES public.access_profiles(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyers(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: access_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: access_profiles access_profiles_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY access_profiles_admin_write ON public.access_profiles TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: access_profiles access_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY access_profiles_read ON public.access_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_admin_write ON public.app_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: app_settings app_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: assertiva_reports assertiva_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assertiva_admin ON public.assertiva_reports USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: assertiva_reports assertiva_client_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assertiva_client_read ON public.assertiva_reports FOR SELECT USING ((supplier_id IN ( SELECT i.supplier_id
   FROM public.invitations i
  WHERE ((i.client_id IN ( SELECT user_roles.client_id
           FROM public.user_roles
          WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))) AND (i.supplier_id IS NOT NULL)))));


--
-- Name: assertiva_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assertiva_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: assertiva_reports assertiva_supplier_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assertiva_supplier_own ON public.assertiva_reports FOR SELECT USING ((supplier_id IN ( SELECT profiles.supplier_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: audit_log audit_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_admin ON public.audit_log USING (public.is_admin());


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

--
-- Name: banners banners_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_admin_write ON public.banners USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: banners banners_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_read_all ON public.banners FOR SELECT USING (true);


--
-- Name: bc_config bc_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_admin ON public.bc_config FOR SELECT USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: bc_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bc_config ENABLE ROW LEVEL SECURITY;

--
-- Name: buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: buyers buyers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyers_insert ON public.buyers FOR INSERT WITH CHECK (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: buyers buyers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyers_select ON public.buyers FOR SELECT USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: category_documents cat_docs_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_docs_admin ON public.category_documents USING (public.is_admin());


--
-- Name: category_documents cat_docs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_docs_read ON public.category_documents FOR SELECT USING (true);


--
-- Name: documents_catalog catalog_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_admin ON public.documents_catalog USING (public.is_admin());


--
-- Name: documents_catalog catalog_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_admin_write ON public.documents_catalog TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: documents_catalog catalog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_read ON public.documents_catalog FOR SELECT USING (true);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_admin ON public.categories USING (public.is_admin());


--
-- Name: categories categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_read ON public.categories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: categories categories_read_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_read_anon ON public.categories FOR SELECT TO anon USING (((client_id IS NULL) AND (active = true)));


--
-- Name: categories categories_supplier_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_supplier_insert ON public.categories FOR INSERT WITH CHECK ((is_custom = true));


--
-- Name: category_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: category_documents category_documents_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY category_documents_read ON public.category_documents FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: client_flow_categories cfc_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cfc_admin_write ON public.client_flow_categories TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: client_flow_categories cfc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cfc_read ON public.client_flow_categories FOR SELECT TO authenticated USING (true);


--
-- Name: client_document_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_document_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: client_flow_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_flow_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: client_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: client_flows client_flows_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_flows_admin_write ON public.client_flows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: client_flows client_flows_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_flows_anon_read ON public.client_flows FOR SELECT TO anon USING ((active = true));


--
-- Name: client_document_flows client_flows_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_flows_own ON public.client_document_flows USING (((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = client_document_flows.client_id)))) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))));


--
-- Name: client_flows client_flows_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_flows_own ON public.client_flows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = client_flows.client_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = client_flows.client_id)))));


--
-- Name: client_flows client_flows_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_flows_read ON public.client_flows FOR SELECT TO authenticated USING (true);


--
-- Name: client_landing_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_landing_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: cnpj_consultations client_read_invited_cnpj_consultations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_invited_cnpj_consultations ON public.cnpj_consultations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invitations i
  WHERE ((i.supplier_id = cnpj_consultations.supplier_id) AND (i.client_id IN ( SELECT ur.client_id
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.client_id IS NOT NULL))))))));


--
-- Name: documents client_read_invited_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_invited_documents ON public.documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invitations i
  WHERE ((i.supplier_id = documents.supplier_id) AND (i.client_id IN ( SELECT ur.client_id
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.client_id IS NOT NULL))))))));


--
-- Name: seals client_read_invited_seals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_invited_seals ON public.seals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invitations i
  WHERE ((i.supplier_id = seals.supplier_id) AND (i.client_id IN ( SELECT ur.client_id
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.client_id IS NOT NULL))))))));


--
-- Name: supplier_categories client_read_invited_supplier_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_invited_supplier_categories ON public.supplier_categories FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invitations i
  WHERE ((i.supplier_id = supplier_categories.supplier_id) AND (i.client_id IN ( SELECT ur.client_id
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.client_id IS NOT NULL))))))));


--
-- Name: suppliers client_read_invited_suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_invited_suppliers ON public.suppliers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invitations i
  WHERE ((i.supplier_id = suppliers.id) AND (i.client_id IN ( SELECT ur.client_id
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND (ur.client_id IS NOT NULL))))))));


--
-- Name: client_term_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_term_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: client_terms_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_terms_items ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_read_linked_supplier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_linked_supplier ON public.clients FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.seals s ON ((s.supplier_id = ur.supplier_id)))
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (s.client_id = clients.id)))) OR (EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.invitations i ON ((i.supplier_id = ur.supplier_id)))
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (i.client_id = clients.id))))));


--
-- Name: clients clients_self_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_self_all ON public.clients USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))));


--
-- Name: cnaes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cnaes ENABLE ROW LEVEL SECURITY;

--
-- Name: cnaes cnaes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cnaes_read ON public.cnaes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: cnpj_consultations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cnpj_consultations ENABLE ROW LEVEL SECURITY;

--
-- Name: cnpj_consultations cnpj_consultations_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cnpj_consultations_authenticated_read ON public.cnpj_consultations FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: cnpj_consultations cnpj_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cnpj_insert ON public.cnpj_consultations FOR INSERT WITH CHECK (true);


--
-- Name: cnpj_consultations cnpj_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cnpj_select ON public.cnpj_consultations FOR SELECT USING (public.is_admin());


--
-- Name: document_history dochist_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dochist_admin_read ON public.document_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: document_history dochist_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dochist_supplier_read ON public.document_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (ur.supplier_id = document_history.supplier_id)))));


--
-- Name: document_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: documents_catalog documents_catalog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_catalog_read ON public.documents_catalog FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: documents documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_insert ON public.documents FOR INSERT WITH CHECK ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = documents.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: documents documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_select ON public.documents FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = documents.supplier_id) AND (s.user_id = auth.uid())))) OR ((status = 'VALID'::text) AND (public.get_user_role() = 'BUYER'::text))));


--
-- Name: documents documents_team_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_team_all ON public.documents TO authenticated USING ((supplier_id IN ( SELECT public.my_supplier_ids() AS my_supplier_ids))) WITH CHECK ((supplier_id IN ( SELECT public.my_supplier_ids() AS my_supplier_ids)));


--
-- Name: documents documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_update ON public.documents FOR UPDATE USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = documents.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays holidays_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY holidays_admin_write ON public.holidays TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: holidays holidays_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY holidays_read ON public.holidays FOR SELECT TO authenticated USING (true);


--
-- Name: supplier_interests interests_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interests_admin_read ON public.supplier_interests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: supplier_interests interests_client_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interests_client_read ON public.supplier_interests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = supplier_interests.client_id)))));


--
-- Name: supplier_interests interests_client_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interests_client_update ON public.supplier_interests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = supplier_interests.client_id)))));


--
-- Name: supplier_interests interests_supplier_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interests_supplier_all ON public.supplier_interests TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (ur.supplier_id = supplier_interests.supplier_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (ur.supplier_id = supplier_interests.supplier_id)))));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select ON public.invitations FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))) OR (EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.buyers b ON ((b.id = ur.buyer_id)))
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'BUYER'::text) AND (b.id = invitations.buyer_id)))) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = invitations.client_id))))));


--
-- Name: invitations invitations_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_supplier_read ON public.invitations FOR SELECT USING ((supplier_id IN ( SELECT profiles.supplier_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_landing_pages lp_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lp_admin_all ON public.client_landing_pages USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: client_landing_pages lp_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lp_owner_write ON public.client_landing_pages USING ((client_id IN ( SELECT user_roles.client_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))));


--
-- Name: client_landing_pages lp_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lp_public_read ON public.client_landing_pages FOR SELECT USING ((is_active = true));


--
-- Name: nfe_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nfe_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: nfe_invoices nfe_invoices_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nfe_invoices_admin_read ON public.nfe_invoices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: plans plans_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_insert ON public.plans FOR INSERT WITH CHECK ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = plans.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: plans plans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_select ON public.plans FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = plans.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: plans plans_team_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_team_select ON public.plans FOR SELECT TO authenticated USING ((supplier_id IN ( SELECT public.my_supplier_ids() AS my_supplier_ids)));


--
-- Name: plans plans_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_update ON public.plans FOR UPDATE USING (public.is_admin());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_own ON public.profiles FOR SELECT USING (((id = auth.uid()) OR public.is_admin()));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: questionnaire_answers qa_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qa_admin ON public.questionnaire_answers USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: questionnaire_answers qa_client_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qa_client_read ON public.questionnaire_answers FOR SELECT USING ((supplier_id IN ( SELECT i.supplier_id
   FROM public.invitations i
  WHERE ((i.client_id IN ( SELECT user_roles.client_id
           FROM public.user_roles
          WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))) AND (i.supplier_id IS NOT NULL)))));


--
-- Name: questionnaire_answers qa_supplier_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qa_supplier_own ON public.questionnaire_answers USING ((supplier_id IN ( SELECT profiles.supplier_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: questionnaire_questions qq_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qq_admin ON public.questionnaire_questions USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: questionnaire_questions qq_client_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qq_client_own ON public.questionnaire_questions USING ((questionnaire_id IN ( SELECT q.id
   FROM public.questionnaires q
  WHERE (q.client_id IN ( SELECT user_roles.client_id
           FROM public.user_roles
          WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))))));


--
-- Name: questionnaire_questions qq_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qq_supplier_read ON public.questionnaire_questions FOR SELECT USING ((questionnaire_id IN ( SELECT q.id
   FROM (public.questionnaires q
     JOIN public.invitations i ON ((i.client_id = q.client_id)))
  WHERE ((i.supplier_id IN ( SELECT profiles.supplier_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (q.active = true)))));


--
-- Name: questionnaire_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questionnaire_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: questionnaire_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questionnaire_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: questionnaires; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questionnaires ENABLE ROW LEVEL SECURITY;

--
-- Name: questionnaires questionnaires_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY questionnaires_admin ON public.questionnaires USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: questionnaires questionnaires_client_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY questionnaires_client_own ON public.questionnaires USING ((client_id IN ( SELECT user_roles.client_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))));


--
-- Name: questionnaires questionnaires_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY questionnaires_supplier_read ON public.questionnaires FOR SELECT USING ((client_id IN ( SELECT i.client_id
   FROM public.invitations i
  WHERE ((i.supplier_id IN ( SELECT profiles.supplier_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) AND (i.client_id IS NOT NULL)))));


--
-- Name: report_evidences re_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY re_admin ON public.report_evidences FOR SELECT USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: rejection_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rejection_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: report_evidences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_evidences ENABLE ROW LEVEL SECURITY;

--
-- Name: report_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: rfq_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfq_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: rfq_responses rfqr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqr_admin ON public.rfq_responses USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: rfq_responses rfqr_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqr_client ON public.rfq_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.rfqs r
     JOIN public.user_roles ur ON (((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = r.client_id))))
  WHERE (r.id = rfq_responses.rfq_id))));


--
-- Name: rfq_responses rfqr_supplier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqr_supplier ON public.rfq_responses USING ((EXISTS ( SELECT 1
   FROM (public.suppliers s
     JOIN public.user_roles ur ON (((ur.supplier_id = s.id) AND (ur.user_id = auth.uid()))))
  WHERE (s.id = ur.supplier_id))));


--
-- Name: rfqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

--
-- Name: rfqs rfqs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqs_insert ON public.rfqs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.buyers b
  WHERE ((b.id = rfqs.buyer_id) AND (b.user_id = auth.uid())))));


--
-- Name: rfqs rfqs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqs_select ON public.rfqs FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.buyers b
  WHERE ((b.id = rfqs.buyer_id) AND (b.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = rfqs.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: rejection_reasons rr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rr_admin ON public.rejection_reasons USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: report_requests rr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rr_admin ON public.report_requests FOR SELECT USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: rejection_reasons rr_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rr_read ON public.rejection_reasons FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: supplier_bank_accounts sba_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_admin ON public.supplier_bank_accounts USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_bank_accounts sba_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_client ON public.supplier_bank_accounts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.invitations i
     JOIN public.user_roles ur ON (((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = i.client_id))))
  WHERE (i.supplier_id = supplier_bank_accounts.supplier_id))));


--
-- Name: supplier_bank_accounts sba_supplier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sba_supplier ON public.supplier_bank_accounts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.suppliers s
     JOIN public.user_roles ur ON (((ur.supplier_id = s.id) AND (ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text))))
  WHERE (s.id = ur.supplier_id))));


--
-- Name: supplier_categories sc_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_admin ON public.supplier_categories USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_categories sc_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_supplier_read ON public.supplier_categories FOR SELECT USING ((supplier_id IN ( SELECT user_roles.supplier_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'SUPPLIER'::text)))));


--
-- Name: supplier_category_approvals sca_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sca_admin ON public.supplier_category_approvals USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_category_approvals sca_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sca_admin_all ON public.supplier_category_approvals TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: supplier_category_approvals sca_client_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sca_client_own ON public.supplier_category_approvals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = supplier_category_approvals.client_id)))));


--
-- Name: supplier_category_approvals sca_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sca_supplier_read ON public.supplier_category_approvals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (ur.supplier_id = supplier_category_approvals.supplier_id)))));


--
-- Name: seals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seals ENABLE ROW LEVEL SECURITY;

--
-- Name: seals seals_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_admin ON public.seals USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: seals seals_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_admin_update ON public.seals FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'ADMIN'::text)))));


--
-- Name: seals seals_buyer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_buyer_read ON public.seals FOR SELECT USING (((status = 'ACTIVE'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['BUYER'::text, 'ADMIN'::text])))))));


--
-- Name: seals seals_client_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_client_read ON public.seals FOR SELECT USING (((client_id IN ( SELECT user_roles.client_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))) OR (supplier_id IN ( SELECT i.supplier_id
   FROM public.invitations i
  WHERE (i.client_id IN ( SELECT user_roles.client_id
           FROM public.user_roles
          WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text))))))));


--
-- Name: seals seals_client_suspend; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_client_suspend ON public.seals FOR UPDATE USING ((client_id IN ( SELECT user_roles.client_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'CLIENT'::text)))));


--
-- Name: seals seals_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seals_supplier_read ON public.seals FOR SELECT USING ((supplier_id IN ( SELECT user_roles.supplier_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'SUPPLIER'::text)))));


--
-- Name: supplier_financials sf_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sf_admin ON public.supplier_financials USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_financials sf_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sf_client ON public.supplier_financials FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.invitations i
     JOIN public.user_roles ur ON (((ur.user_id = auth.uid()) AND (ur.role = 'CLIENT'::text) AND (ur.client_id = i.client_id))))
  WHERE (i.supplier_id = supplier_financials.supplier_id))));


--
-- Name: supplier_financials sf_supplier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sf_supplier ON public.supplier_financials FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.suppliers s
     JOIN public.user_roles ur ON (((ur.supplier_id = s.id) AND (ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text))))
  WHERE (s.id = ur.supplier_id))));


--
-- Name: source_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_results ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_partners sp_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_admin_all ON public.supplier_partners USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_partners sp_supplier_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_supplier_read ON public.supplier_partners FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'SUPPLIER'::text) AND (ur.supplier_id = supplier_partners.supplier_id)))));


--
-- Name: source_results sr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sr_admin ON public.source_results FOR SELECT USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: supplier_sanctions_manual ssm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ssm_admin_all ON public.supplier_sanctions_manual USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'ADMIN'::text)))));


--
-- Name: supplier_categories sup_cats_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sup_cats_own ON public.supplier_categories USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = supplier_categories.supplier_id) AND (s.user_id = auth.uid()))))));


--
-- Name: supplier_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_category_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_category_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_financials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_financials ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_sanctions_manual; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_sanctions_manual ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_admin_update ON public.suppliers FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'ADMIN'::text)))));


--
-- Name: suppliers suppliers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT WITH CHECK (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: suppliers suppliers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin) OR ((status = 'ACTIVE'::text) AND (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['BUYER'::text, 'ADMIN'::text])))));


--
-- Name: suppliers suppliers_team_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_team_select ON public.suppliers FOR SELECT TO authenticated USING ((id IN ( SELECT public.my_supplier_ids() AS my_supplier_ids)));


--
-- Name: suppliers suppliers_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_team_update ON public.suppliers FOR UPDATE TO authenticated USING ((id IN ( SELECT public.my_supplier_ids() AS my_supplier_ids)));


--
-- Name: suppliers suppliers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_state sync_state_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sync_state_admin_read ON public.sync_state FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'ADMIN'::text)))));


--
-- Name: client_term_acceptances term_acc_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY term_acc_admin ON public.client_term_acceptances FOR SELECT USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: client_term_acceptances term_acc_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY term_acc_client ON public.client_term_acceptances FOR SELECT USING ((client_id IN ( SELECT ur.client_id
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = 'CLIENT'::text)))));


--
-- Name: client_terms_items terms_items_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_items_admin ON public.client_terms_items USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: client_terms_items terms_items_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_items_client ON public.client_terms_items USING ((client_id IN ( SELECT ur.client_id
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = 'CLIENT'::text)))));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_delete_own ON public.user_roles FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_roles user_roles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_insert_own ON public.user_roles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_roles user_roles_modify_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_modify_own ON public.user_roles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_roles user_roles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: v_count; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.v_count ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


