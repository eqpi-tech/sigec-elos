-- patch_138 — Multiempresa: um login com acesso a várias empresas fornecedoras (14/10/2026)
--
-- Antes: UNIQUE(user_id, role) → um único vínculo SUPPLIER por usuário. Na
-- migração do HOC há 209 e-mails ligados a mais de uma empresa (24 na onda A,
-- um deles com 23). Agora o usuário pode ter um vínculo SUPPLIER por empresa;
-- CLIENT, BUYER e ADMIN continuam com um vínculo só (supplier_id nulo, e
-- NULLS NOT DISTINCT trata os nulos como iguais).
-- A empresa ativa é escolhida no navegador (seletor no menu) e enviada às
-- funções; o banco já filtra por TODAS as empresas do usuário (my_supplier_ids).
--
-- 1) restrição única por (usuário, papel, empresa)
-- 2) as 5 políticas que liam profiles.supplier_id (uma empresa só) passam a
--    usar my_supplier_ids()
-- 3) team_members recebe a empresa da tela (antes: a primeira do usuário)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key') THEN
    ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_role_supplier_key') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_supplier_key
      UNIQUE NULLS NOT DISTINCT (user_id, role, supplier_id);
  END IF;
END $$;

DROP POLICY IF EXISTS invitations_supplier_read ON public.invitations;
CREATE POLICY invitations_supplier_read ON public.invitations FOR SELECT
  USING (supplier_id IN (SELECT public.my_supplier_ids()));

DROP POLICY IF EXISTS questionnaires_supplier_read ON public.questionnaires;
CREATE POLICY questionnaires_supplier_read ON public.questionnaires FOR SELECT
  USING (client_id IN (SELECT i.client_id FROM public.invitations i
                       WHERE i.supplier_id IN (SELECT public.my_supplier_ids()) AND i.client_id IS NOT NULL));

DROP POLICY IF EXISTS qq_supplier_read ON public.questionnaire_questions;
CREATE POLICY qq_supplier_read ON public.questionnaire_questions FOR SELECT
  USING (questionnaire_id IN (SELECT q.id FROM public.questionnaires q JOIN public.invitations i ON i.client_id = q.client_id
                              WHERE i.supplier_id IN (SELECT public.my_supplier_ids()) AND q.active = true));

DROP POLICY IF EXISTS qa_supplier_own ON public.questionnaire_answers;
CREATE POLICY qa_supplier_own ON public.questionnaire_answers FOR ALL
  USING (supplier_id IN (SELECT public.my_supplier_ids()));

DROP POLICY IF EXISTS assertiva_supplier_own ON public.assertiva_reports;
CREATE POLICY assertiva_supplier_own ON public.assertiva_reports FOR SELECT
  USING (supplier_id IN (SELECT public.my_supplier_ids()));

-- Equipe: lista a empresa pedida pela tela (se o usuário é dela); sem
-- parâmetro, a principal. A assinatura antiga (só p_role) some — o navegador
-- passa a mandar p_company, e o PostgREST resolve pelo default.
DROP FUNCTION IF EXISTS public.team_members(text);
CREATE OR REPLACE FUNCTION public.team_members(p_role text, p_company uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, is_primary boolean, is_active boolean, access_profile_id uuid, invited_by uuid, created_at timestamp with time zone, is_me boolean, is_master boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT CASE p_role WHEN 'CLIENT' THEN ur.client_id WHEN 'SUPPLIER' THEN ur.supplier_id END AS company
    FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = p_role AND p_role IN ('CLIENT','SUPPLIER')
      AND (p_company IS NULL OR CASE p_role WHEN 'CLIENT' THEN ur.client_id ELSE ur.supplier_id END = p_company)
    ORDER BY ur.is_primary DESC NULLS LAST, ur.created_at
    LIMIT 1
  )
  SELECT r.id, r.user_id, coalesce(p.name, split_part(u.email, '@', 1)), u.email::text,
         r.is_primary, r.is_active, r.access_profile_id, r.invited_by, r.created_at,
         r.user_id = auth.uid(),
         public.team_is_master(p_role, me.company, r.user_id, r.is_primary)
  FROM user_roles r
  JOIN me ON me.company IS NOT NULL
         AND CASE p_role WHEN 'CLIENT' THEN r.client_id ELSE r.supplier_id END = me.company
  LEFT JOIN profiles p ON p.id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.role = p_role
  ORDER BY public.team_is_master(p_role, me.company, r.user_id, r.is_primary) DESC, r.created_at
$function$;
GRANT EXECUTE ON FUNCTION public.team_members(text, uuid) TO authenticated;
