-- patch_126 — Pré-cadastro pelo portal do cliente (12/10/2026)
-- Quem entra pelo portal de um cliente (/portal/:slug) pode, no lugar de
-- pagar a homologação, fazer só um PRÉ-CADASTRO sem custo: cria login e a
-- empresa (dados gratuitos da Receita), responde o questionário do cliente e
-- usa o perfil Comprador Free — mas NÃO tem processo (selo): não envia
-- documentos, não entra na fila de análise nem nas automações.
-- O cliente vê os pré-cadastros numa aba própria, pode convidar ou arquivar.
-- Escritas só pelo servidor (create-supplier) e pela RPC de status do cliente.

CREATE TABLE IF NOT EXISTS public.client_pre_registrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id)   ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'ACTIVE',
  source       text NOT NULL DEFAULT 'PORTAL',
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  archived_by  uuid REFERENCES auth.users(id),
  CONSTRAINT client_pre_registrations_status_check CHECK (status IN ('ACTIVE','ARCHIVED')),
  CONSTRAINT client_pre_registrations_uniq UNIQUE (client_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS client_pre_registrations_supplier_idx ON public.client_pre_registrations(supplier_id);

ALTER TABLE public.client_pre_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pre_reg_admin_all ON public.client_pre_registrations;
CREATE POLICY pre_reg_admin_all ON public.client_pre_registrations FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pre_reg_client_read ON public.client_pre_registrations;
CREATE POLICY pre_reg_client_read ON public.client_pre_registrations FOR SELECT TO authenticated
  USING (client_id IN (SELECT ur.client_id FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'CLIENT'));

DROP POLICY IF EXISTS pre_reg_supplier_read ON public.client_pre_registrations;
CREATE POLICY pre_reg_supplier_read ON public.client_pre_registrations FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT public.my_supplier_ids()));

-- o fornecedor pré-cadastrado enxerga o questionário do cliente (patch_119)
CREATE OR REPLACE FUNCTION public.my_supplier_client_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT i.client_id FROM invitations i
  WHERE i.supplier_id IN (SELECT my_supplier_ids()) AND i.client_id IS NOT NULL
    AND (i.hoc_id IS NULL OR i.status = 'REGISTERED')
  UNION
  SELECT s.client_id FROM seals s
  WHERE s.supplier_id IN (SELECT my_supplier_ids()) AND s.client_id IS NOT NULL
  UNION
  SELECT p.client_id FROM client_pre_registrations p
  WHERE p.supplier_id IN (SELECT my_supplier_ids())
$fn$;

-- caller é CLIENTE deste cliente (ou ADMIN)?
CREATE OR REPLACE FUNCTION public.is_client_of(p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
      AND ur.client_id = p_client AND coalesce(ur.is_active, true))
$fn$;

-- lista do cliente: dados da empresa + andamento do questionário + se já foi
-- convidado (convite do ELOS) ou já tem processo com o cliente
CREATE OR REPLACE FUNCTION public.client_pre_registrations_list(p_client uuid, p_status text DEFAULT 'ACTIVE')
 RETURNS TABLE(id uuid, supplier_id uuid, status text, created_at timestamptz, archived_at timestamptz,
               razao_social text, nome_fantasia text, cnpj text, city text, state text,
               email text, phone text, contact_name text, cnae_main text,
               q_total int, q_answered int, invited boolean, in_process boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.supplier_id, p.status, p.created_at, p.archived_at,
         s.razao_social, s.nome_fantasia, s.cnpj, s.city, s.state,
         s.email, s.phone, s.contact_name, s.cnae_main,
         (SELECT count(*)::int FROM questionnaire_questions qq JOIN questionnaires qn ON qn.id = qq.questionnaire_id
           WHERE qn.client_id = p.client_id AND qn.active IS NOT false),
         (SELECT count(*)::int FROM questionnaire_questions qq JOIN questionnaires qn ON qn.id = qq.questionnaire_id
           JOIN questionnaire_answers qa ON qa.question_id = qq.id AND qa.supplier_id = p.supplier_id
           WHERE qn.client_id = p.client_id AND qn.active IS NOT false),
         EXISTS (SELECT 1 FROM invitations i WHERE i.client_id = p.client_id AND i.hoc_id IS NULL
                   AND (i.supplier_id = p.supplier_id OR i.supplier_cnpj = s.cnpj)
                   AND i.status NOT IN ('CANCELLED','SUPERSEDED')),
         EXISTS (SELECT 1 FROM seals se WHERE se.client_id = p.client_id AND se.supplier_id = p.supplier_id)
  FROM client_pre_registrations p
  JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.client_id = p_client
    AND (coalesce(p_status, 'todos') = 'todos' OR p.status = p_status)
    AND public.is_client_of(p_client)
  ORDER BY p.created_at DESC
$fn$;

-- respostas do questionário de um pré-cadastrado (só os questionários do cliente)
CREATE OR REPLACE FUNCTION public.client_pre_registration_answers(p_client uuid, p_supplier uuid)
 RETURNS TABLE(questionnaire text, question text, type text, required boolean, order_index int,
               answer_boolean boolean, answer_text text, answered_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT qn.title, qq.text, qq.type, qq.required, qq.order_index,
         qa.answer_boolean, qa.answer_text, qa.answered_at
  FROM questionnaires qn
  JOIN questionnaire_questions qq ON qq.questionnaire_id = qn.id
  LEFT JOIN questionnaire_answers qa ON qa.question_id = qq.id AND qa.supplier_id = p_supplier
  WHERE qn.client_id = p_client AND qn.active IS NOT false
    AND public.is_client_of(p_client)
    AND EXISTS (SELECT 1 FROM client_pre_registrations p WHERE p.client_id = p_client AND p.supplier_id = p_supplier)
  ORDER BY qn.title, qq.order_index
$fn$;

-- arquivar / reativar (cliente do pré-cadastro ou ADMIN)
CREATE OR REPLACE FUNCTION public.client_set_pre_registration_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE cid uuid;
BEGIN
  IF p_status NOT IN ('ACTIVE','ARCHIVED') THEN RAISE EXCEPTION 'status inválido'; END IF;
  SELECT client_id INTO cid FROM client_pre_registrations WHERE id = p_id;
  IF cid IS NULL OR NOT public.is_client_of(cid) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE client_pre_registrations
     SET status = p_status,
         archived_at = CASE WHEN p_status = 'ARCHIVED' THEN now() END,
         archived_by = CASE WHEN p_status = 'ARCHIVED' THEN auth.uid() END
   WHERE id = p_id;
END $fn$;

-- painel do fornecedor: os pré-cadastros dele, com o portal do cliente
CREATE OR REPLACE FUNCTION public.my_pre_registrations()
 RETURNS TABLE(id uuid, client_id uuid, client_name text, slug text, created_at timestamptz,
               q_total int, q_answered int, in_process boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.client_id, coalesce(c.nome_fantasia, c.razao_social),
         (SELECT l.slug FROM client_landing_pages l WHERE l.client_id = p.client_id AND l.is_active LIMIT 1),
         p.created_at,
         (SELECT count(*)::int FROM questionnaire_questions qq JOIN questionnaires qn ON qn.id = qq.questionnaire_id
           WHERE qn.client_id = p.client_id AND qn.active IS NOT false),
         (SELECT count(*)::int FROM questionnaire_questions qq JOIN questionnaires qn ON qn.id = qq.questionnaire_id
           JOIN questionnaire_answers qa ON qa.question_id = qq.id AND qa.supplier_id = p.supplier_id
           WHERE qn.client_id = p.client_id AND qn.active IS NOT false),
         EXISTS (SELECT 1 FROM seals se WHERE se.client_id = p.client_id AND se.supplier_id = p.supplier_id)
  FROM client_pre_registrations p
  JOIN clients c ON c.id = p.client_id
  WHERE p.supplier_id IN (SELECT my_supplier_ids())
  ORDER BY p.created_at DESC
$fn$;

REVOKE ALL ON FUNCTION public.client_pre_registrations_list(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.client_pre_registration_answers(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.client_set_pre_registration_status(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.my_pre_registrations() FROM public;
GRANT EXECUTE ON FUNCTION public.client_pre_registrations_list(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_pre_registration_answers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_set_pre_registration_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pre_registrations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated;
