-- patch_128 — Equipe (cliente e fornecedor) pelo servidor (12/10/2026)
-- As telas "Equipe" liam/gravavam user_roles direto do navegador, mas o RLS
-- só deixa cada usuário ver o PRÓPRIO vínculo: o master de um cliente com 14
-- usuários via 1 (ele mesmo), sem nomes, e trocar perfil / ativar-desativar
-- membro não gravava nada (e o patch_124 passou a recusar a troca de perfil
-- pelo navegador). Decisão do Luiz: a troca de perfil tem que ser permitida.
-- RPCs SECURITY DEFINER: listam a equipe da MESMA empresa do usuário e
-- alteram perfil/ativo de OUTRO membro, se quem pede pode gerir a equipe.

-- master da empresa: no CLIENTE is_primary vale para todos (é o perfil
-- principal do usuário, não "dono") — o master é clients.user_id; no
-- FORNECEDOR, suppliers.user_id ou o vínculo principal
CREATE OR REPLACE FUNCTION public.team_is_master(p_role text, p_company uuid, p_user uuid, p_is_primary boolean)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT CASE p_role
    WHEN 'CLIENT'   THEN EXISTS (SELECT 1 FROM clients   WHERE id = p_company AND user_id = p_user)
    WHEN 'SUPPLIER' THEN coalesce(p_is_primary, false)
                         OR EXISTS (SELECT 1 FROM suppliers WHERE id = p_company AND user_id = p_user)
    ELSE false END
$fn$;

-- quem pede pode gerir a equipe desta empresa? (vínculo ativo + principal ou
-- perfil com o módulo "equipe"; sem perfil / perfil sem módulos = permissivo,
-- mesma regra do hasModule no front — CLAUDE.md §4)
CREATE OR REPLACE FUNCTION public.can_manage_team(p_role text, p_company uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM user_roles ur
    LEFT JOIN access_profiles ap ON ap.id = ur.access_profile_id
    WHERE ur.user_id = auth.uid() AND ur.role = p_role AND coalesce(ur.is_active, true)
      AND CASE p_role WHEN 'CLIENT' THEN ur.client_id WHEN 'SUPPLIER' THEN ur.supplier_id END = p_company
      AND (public.team_is_master(p_role, p_company, ur.user_id, ur.is_primary) OR ap.id IS NULL OR coalesce(cardinality(ap.modules), 0) = 0
           OR 'equipe' = ANY(ap.modules)))
$fn$;

-- membros da empresa do usuário logado (p_role: 'CLIENT' | 'SUPPLIER')
CREATE OR REPLACE FUNCTION public.team_members(p_role text)
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, is_primary boolean, is_active boolean,
               access_profile_id uuid, invited_by uuid, created_at timestamptz, is_me boolean, is_master boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH me AS (
    SELECT CASE p_role WHEN 'CLIENT' THEN ur.client_id WHEN 'SUPPLIER' THEN ur.supplier_id END AS company
    FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = p_role AND p_role IN ('CLIENT','SUPPLIER')
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
$fn$;

-- troca de perfil e/ou ativo de um membro (nunca o próprio, nunca o master)
CREATE OR REPLACE FUNCTION public.team_update_member(p_member uuid, p_access_profile_id uuid DEFAULT NULL,
                                                     p_is_active boolean DEFAULT NULL, p_clear_profile boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r user_roles%ROWTYPE; company uuid;
BEGIN
  SELECT * INTO r FROM user_roles WHERE id = p_member;
  IF r.id IS NULL OR r.role NOT IN ('CLIENT','SUPPLIER') THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
  company := CASE r.role WHEN 'CLIENT' THEN r.client_id ELSE r.supplier_id END;
  IF NOT public.can_manage_team(r.role, company) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerir a equipe' USING ERRCODE = '42501';
  END IF;
  IF r.user_id = auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Não é possível alterar o próprio acesso — peça a outro gestor da equipe' USING ERRCODE = '42501';
  END IF;
  IF public.team_is_master(r.role, company, r.user_id, r.is_primary) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'O usuário master da empresa não pode ser alterado' USING ERRCODE = '42501';
  END IF;
  IF p_access_profile_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM access_profiles WHERE id = p_access_profile_id AND role_type = r.role) THEN
    RAISE EXCEPTION 'Perfil de acesso inválido';
  END IF;
  -- autoriza a trava do patch_124 só nesta transação (o navegador não chama
  -- set_config: o PostgREST só expõe funções do schema public)
  PERFORM set_config('app.team_rpc', '1', true);
  UPDATE user_roles SET
    access_profile_id = CASE WHEN p_clear_profile THEN NULL
                             ELSE coalesce(p_access_profile_id, access_profile_id) END,
    is_active = coalesce(p_is_active, is_active)
  WHERE id = p_member;
END $fn$;

-- trava do patch_124 aceita a alteração feita por team_update_member
CREATE OR REPLACE FUNCTION public.trg_user_roles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin()
     AND coalesce(current_setting('app.team_rpc', true), '') <> '1' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Alteração não permitida: vínculos de acesso só são criados pelo sistema'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id                  IS DISTINCT FROM OLD.user_id
    OR NEW.role                     IS DISTINCT FROM OLD.role
    OR NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id
    OR NEW.buyer_id                 IS DISTINCT FROM OLD.buyer_id
    OR NEW.client_id                IS DISTINCT FROM OLD.client_id
    OR NEW.invited_by               IS DISTINCT FROM OLD.invited_by
    OR NEW.buyer_plan               IS DISTINCT FROM OLD.buyer_plan
    OR NEW.buyer_plan_expires_at    IS DISTINCT FROM OLD.buyer_plan_expires_at
    OR NEW.buyer_stripe_sub_id      IS DISTINCT FROM OLD.buyer_stripe_sub_id
    OR NEW.buyer_stripe_customer_id IS DISTINCT FROM OLD.buyer_stripe_customer_id
    OR NEW.access_profile           IS DISTINCT FROM OLD.access_profile
    OR NEW.access_profile_id        IS DISTINCT FROM OLD.access_profile_id THEN
      RAISE EXCEPTION 'Alteração não permitida: papel, vínculo e plano só mudam pelo sistema'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.team_is_master(text, uuid, uuid, boolean) FROM public;
REVOKE ALL ON FUNCTION public.can_manage_team(text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.team_members(text) FROM public;
REVOKE ALL ON FUNCTION public.team_update_member(uuid, uuid, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.team_is_master(text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_team(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_members(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_update_member(uuid, uuid, boolean, boolean) TO authenticated;
