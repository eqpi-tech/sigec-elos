-- patch_074_analyst_queue.sql — Fila do analista fiel ao HOC (18/09)
-- 1) Dias úteis + data-limite de análise (submissão + 3 dias úteis, regra HOC)
-- 2) Prontidão do processo ELOS-nativo: fornecedor só entra na fila quando
--    enviou TODOS os docs exigidos (responsabilidade fornecedor) e respondeu
--    o questionário do cliente (perguntas obrigatórias), espelhando o
--    data_fim/boleto do HOC. Selos espelhados do HOC seguem o estado do HOC.
-- 3) Farol reformulado: buckets Passados/Hoje/Futuros por DATA-LIMITE DE
--    ANÁLISE de docs AGUARDANDO ANÁLISE (não vencimento) — cores HOC.
-- 4) Fila (admin_list_documents): buckets do farol + data_limite no retorno.
-- 5) Vínculo CNAE×categoria na validação do doc 61 (supplier_categories.cnae)
-- 6) Motivos de reprovação reais do HOC (79, extraídos do log de processos)

-- ── 1. dias úteis ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_business_days(d date, n int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $fn$
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
END $fn$;

-- submitted_at: quando o doc ficou aguardando análise (base da data-limite)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
UPDATE documents SET submitted_at = coalesce(updated_at, created_at)
 WHERE submitted_at IS NULL AND status = 'PENDING';

CREATE OR REPLACE FUNCTION public.trg_documents_submitted()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status = 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PENDING') THEN
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS documents_submitted ON documents;
CREATE TRIGGER documents_submitted BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION public.trg_documents_submitted();

-- ── 2. prontidão do processo (fornecedor completou a parte dele?) ────────
CREATE OR REPLACE FUNCTION public.supplier_ready_for_analysis(p_supplier uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
END $fn$;

-- ── 3. Farol do analista (regra HOC: data-limite da ANÁLISE) ─────────────
CREATE OR REPLACE FUNCTION public.admin_document_farol() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH eligible AS (
    SELECT t.sid FROM analysable_supplier_ids() AS t(sid)
    WHERE supplier_ready_for_analysis(t.sid)
  ),
  docs AS (
    SELECT d.id, d.label, d.expires_at, d.status, d.supplier_id,
           add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3) AS analysis_due,
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
END $fn$;

-- ── 4. Fila de análise com buckets do farol ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_documents(
  p_doc_type text DEFAULT NULL, p_status text DEFAULT 'fila',
  p_expires_until date DEFAULT NULL, p_search text DEFAULT NULL,
  p_sort text DEFAULT 'due_asc', p_page int DEFAULT 0, p_size int DEFAULT 50
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE digits text := regexp_replace(coalesce(p_search,''), '\D', '', 'g');
        result json;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH ready AS (
    SELECT t.sid FROM analysable_supplier_ids() AS t(sid)
    WHERE supplier_ready_for_analysis(t.sid)
  ),
  base AS (
    SELECT d.*, sup.razao_social sup_razao, sup.cnpj sup_cnpj,
           add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3) AS analysis_due
    FROM documents d JOIN suppliers sup ON sup.id = d.supplier_id
    WHERE d.label IS NOT NULL
      AND d.supplier_id IN (SELECT analysable_supplier_ids())
      AND (p_doc_type IS NULL OR d.type = p_doc_type)
      AND (p_expires_until IS NULL OR (d.expires_at IS NOT NULL AND d.expires_at::date <= p_expires_until))
      AND (coalesce(p_search,'') = '' OR
           (length(digits) >= 8 AND sup.cnpj ILIKE '%'||digits||'%') OR
           (length(digits) < 8 AND sup.razao_social ILIKE '%'||trim(p_search)||'%'))
      AND CASE coalesce(p_status,'todos')
            -- fila do analista (HOC): aguardando análise, fornecedor pronto
            WHEN 'fila'          THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
            WHEN 'fila_passados' THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                      AND add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3) < current_date
            WHEN 'fila_hoje'     THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                      AND add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3) = current_date
            WHEN 'fila_futuros'  THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
                                      AND add_business_days(coalesce(d.submitted_at, d.updated_at, d.created_at)::date, 3) > current_date
            WHEN 'vencido'  THEN d.expires_at IS NOT NULL AND d.expires_at < now()
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'hoje'     THEN d.expires_at::date = current_date
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN '5dias'    THEN d.expires_at::date > current_date AND d.expires_at::date <= current_date + 5
                                 AND d.status NOT IN ('REJECTED','NOT_APPLICABLE','MISSING')
            WHEN 'pendente' THEN d.status = 'PENDING'
            WHEN 'analise'  THEN d.status = 'PENDING' AND d.supplier_id IN (SELECT sid FROM ready)
            WHEN 'todos'    THEN true
            ELSE d.status = p_status
          END
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
END $fn$;

-- ── 5. vínculo CNAE × categoria (validação do doc 61) ────────────────────
ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS cnae text;
ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS cnae_validated_at timestamptz;
ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS cnae_validated_by uuid;

-- ── 6. motivos de reprovação do HOC (79, por uso real no log) ────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_rejection_reasons_code ON rejection_reasons(code);
INSERT INTO rejection_reasons (code, label, applies_to, active) VALUES
  ('HOC_001', 'Documento diferente do solicitado', 'document', true),
  ('HOC_002', 'Documento Vencido', 'document', true),
  ('HOC_003', 'Informações insuficientes para a emissão de certidão', 'document', true),
  ('HOC_004', 'Não abrange os requisitos (verificar se os campos foram preenchidos e justificados corretamente) caso informe que possua documento anexá-lo', 'document', true),
  ('HOC_005', 'Não Inscrito', 'document', true),
  ('HOC_006', 'Informações insuficientes para a emissão de certidão (procure o órgão responsável)', 'document', true),
  ('HOC_007', 'CNPJ e/ou Razão divergente (deve ser pertinente ao CNPJ de cadastrado)', 'document', true),
  ('HOC_008', 'Não possui abrangência da Taxa de Funcionamento', 'document', true),
  ('HOC_009', 'CNPJ e/ou Razão divergente', 'document', true),
  ('HOC_010', 'Ausência do preenchimento das informações', 'document', true),
  ('HOC_011', 'Atividade licenciada e/ou isenta é divergente da categoria selecionada', 'document', true),
  ('HOC_012', 'Ausência dos dados da Diretoria e/ou do Presidente (Termo de posse)', 'document', true),
  ('HOC_013', 'Ausência do Balanço ou DRE', 'document', true),
  ('HOC_014', 'Certidão positiva e/ou constam débitos', 'document', true),
  ('HOC_015', 'CNPJ e/ou Razão divergente (o documento deverá ser pertinente ao CNPJ que esta sendo cadastrado)', 'document', true),
  ('HOC_016', 'Documento recusado devido Comprovante Bancário ter sido recusado ou não foi anexado', 'document', true),
  ('HOC_017', 'Fornecedor solicita recusa', 'document', true),
  ('HOC_018', 'Quantidade de páginas incompletas', 'document', true),
  ('HOC_019', 'Documento divergente (realizar download no portal, preencher, assinar e anexar)', 'document', true),
  ('HOC_020', 'Ausência do preenchimento das informações (todos os campos devem ser preenchidos)', 'document', true),
  ('HOC_021', 'Ausência do Balanço ou DRE (Zipar os dois arquivos)', 'document', true),
  ('HOC_022', 'Informações divergentes dos dados bancários cadastrado', 'document', true),
  ('HOC_023', 'Não possui documento solicitado', 'document', true),
  ('HOC_024', 'Ausencia do CNPJ e/ou razão social', 'document', true),
  ('HOC_025', 'Ausência dos anexos assinalados', 'document', true),
  ('HOC_026', 'Mandato de diretoria vencido', 'document', true),
  ('HOC_027', 'Ausência da assinatura do representante legal da empresa', 'document', true),
  ('HOC_028', 'Não optante pelo Simples Nacional', 'document', true),
  ('HOC_029', 'Atividade(s) relacionada no CNAE, não vinculam a(s) atividade(s) do Decreto / Declaração', 'document', true),
  ('HOC_030', 'Documento desatualizado. Favor baixar novo arquivo', 'document', true),
  ('HOC_031', 'Ausência do selo da Junta Comercial ou Registro Cartório ou Averbação', 'document', true),
  ('HOC_032', 'Anexou declaração que não se aplica', 'document', true),
  ('HOC_033', 'Relação de meses incompleta', 'document', true),
  ('HOC_034', 'Ausência de preenchimento / anexos', 'document', true),
  ('HOC_035', 'Ausência da Constituição e as demais alterações', 'document', true),
  ('HOC_036', 'Enviou declaração que não se aplica', 'document', true),
  ('HOC_037', 'Ausência do número da Inscrição Municipal', 'document', true),
  ('HOC_038', 'Ausência da Guia e/ou Comprovante de pagamento', 'document', true),
  ('HOC_039', 'Não emitido pelo Município ou Estado de cadastro', 'document', true),
  ('HOC_040', 'Anexou Protocolo de Renovação e/ou Requerimento', 'document', true),
  ('HOC_041', 'Ausência do nome do Banco', 'document', true),
  ('HOC_042', 'Ausência do Reconhecimento de Firma e/ou assinatura digital', 'document', true),
  ('HOC_043', 'Ausência agência e/ou conta', 'document', true),
  ('HOC_044', 'Quantidade de páginas incompletas (Anexar todas as páginas)', 'document', true),
  ('HOC_045', 'Anexar somente uma opção de conta', 'document', true),
  ('HOC_046', 'Formato de arquivo não reconhecido e/ou arquivo corrompido', 'document', true),
  ('HOC_047', 'Não possui abrangência (TFE ou TFA TLIF TFL DAM DAMSP DUAM)', 'document', true),
  ('HOC_048', 'Ausência de Consolidação', 'document', true),
  ('HOC_049', 'Documento em branco', 'document', true),
  ('HOC_050', 'Documento recusado devido Comp. Bancário ter sido recusado', 'document', true),
  ('HOC_051', 'Ausência do Questionário de Autoavaliação e/ou anexos', 'document', true),
  ('HOC_052', 'Tipo de empresa divergente', 'document', true),
  ('HOC_053', 'Ausência das informações da agência e/ou conta', 'document', true),
  ('HOC_054', 'Ausência do número do CNPJ (Endereço é divergente do cartão CNPJ)', 'document', true),
  ('HOC_055', 'Dados dos sócios incompletos', 'document', true),
  ('HOC_056', 'Documento Ilegível', 'document', true),
  ('HOC_057', 'Ausência de preenchimento e anexo assinalado', 'document', true),
  ('HOC_058', 'Ausência da CRF PGE RJ ou CND Estadual', 'document', true),
  ('HOC_059', 'Ausência da assinatura ou assinatura digital', 'document', true),
  ('HOC_060', 'Ausência de preenchimento e assinatura', 'document', true),
  ('HOC_061', 'Ausência do n° do CNPJ (End divergente do cartão CNPJ)', 'document', true),
  ('HOC_062', 'Certidão/Documento desatualizado (Favor anexar consulta pelo menos 1 mês anterior )', 'document', true),
  ('HOC_063', 'Informações insuficientes para a emissão de certidão (procure a Receita Federal para sanar pendência)', 'document', true),
  ('HOC_064', 'CNPJ BAIXADO, INAPTA ou RECUPERAÇÃO JUDICIAL', 'document', true),
  ('HOC_065', 'Ausência da Guia e/ou Comprovante de pagamento (Anexar ambos)', 'document', true),
  ('HOC_066', 'Ausência do Recibo de Entrega e/ou Declaração', 'document', true),
  ('HOC_067', 'Documento não emitido pelo forum de Domicilio', 'document', true),
  ('HOC_068', 'Pagamento não localizado - Anexar comprovante', 'document', true),
  ('HOC_069', 'Consta sanção', 'document', true),
  ('HOC_070', 'Certidão positiva', 'document', true),
  ('HOC_071', 'Ausência da assinatura do contador e/ou Identificação do CRC', 'document', true),
  ('HOC_072', 'Opções não assinaladas', 'document', true),
  ('HOC_073', 'Documento incompleto (ausência de informações)', 'document', true),
  ('HOC_074', 'Ausência da assinatura do contador', 'document', true),
  ('HOC_075', 'Documento recusado devido Comprovante Bancário ter sido recusado', 'document', true),
  ('HOC_076', 'Ausência do Reconhecimento de Firma', 'document', true),
  ('HOC_077', 'Não possui informações de conta Jurídica e/ou Empresarial', 'document', true),
  ('HOC_078', 'Documento Modificado', 'document', true),
  ('HOC_079', 'Ausência da Ata de Eleição ou Estatuto Social', 'document', true)
ON CONFLICT (code) DO NOTHING;
