-- patch_142 — Um master por empresa e troca de master (14/10/2026)
--
-- Antes: master do fornecedor = titular (suppliers.user_id) OU qualquer
-- vínculo com is_primary. is_primary também escolhe o perfil inicial do
-- usuário e é dado a quase todos — 424 empresas tinham 2+ masters (todos
-- convidam e nenhum consegue desativar o outro).
-- Agora: master = titular; is_primary só vale quando a empresa NÃO tem titular.
-- Cliente segue igual (titular = clients.user_id).
-- Troca: team_transfer_master — backoffice (Usuários) ou o próprio master
-- (Equipe), para outro usuário ATIVO da mesma empresa. Fica no audit_log.

CREATE OR REPLACE FUNCTION public.team_is_master(p_role text, p_company uuid, p_user uuid, p_is_primary boolean)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE p_role
    WHEN 'CLIENT'   THEN EXISTS (SELECT 1 FROM clients WHERE id = p_company AND user_id = p_user)
    WHEN 'SUPPLIER' THEN EXISTS (SELECT 1 FROM suppliers WHERE id = p_company
                                 AND (user_id = p_user OR (user_id IS NULL AND coalesce(p_is_primary, false))))
    ELSE false END
$function$;

-- empresas com usuários e SEM titular (1.026 em 14/10, contas da campanha e
-- da migração): titular = usuário ativo que entrou por último no ELOS; sem
-- acesso de ninguém, o vínculo mais antigo. O suporte troca se precisar.
UPDATE suppliers s SET user_id = x.user_id
FROM (
  SELECT DISTINCT ON (r.supplier_id) r.supplier_id, r.user_id
  FROM user_roles r JOIN auth.users u ON u.id = r.user_id
  WHERE r.role = 'SUPPLIER' AND r.supplier_id IS NOT NULL AND coalesce(r.is_active, true)
  ORDER BY r.supplier_id, u.last_sign_in_at DESC NULLS LAST, r.created_at
) x
WHERE s.id = x.supplier_id AND s.user_id IS NULL;

-- a trava de escrita em suppliers (patch_124) aceita a RPC da equipe
CREATE OR REPLACE FUNCTION public.trg_block_end_user_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin()
     AND coalesce(current_setting('app.team_rpc', true), '') <> '1' THEN
    RAISE EXCEPTION 'Alteração não permitida: % só é alterado pelo sistema', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.team_transfer_master(p_role text, p_company uuid, p_new_user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old uuid; v_me record;
BEGIN
  IF p_role NOT IN ('SUPPLIER', 'CLIENT') THEN RAISE EXCEPTION 'Papel inválido'; END IF;
  IF p_role = 'SUPPLIER' THEN SELECT user_id INTO v_old FROM suppliers WHERE id = p_company;
  ELSE SELECT user_id INTO v_old FROM clients WHERE id = p_company; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;
  -- quem pode: backoffice ou o master atual
  SELECT ur.is_primary INTO v_me FROM user_roles ur
   WHERE ur.user_id = auth.uid() AND ur.role = p_role
     AND CASE p_role WHEN 'CLIENT' THEN ur.client_id ELSE ur.supplier_id END = p_company
     AND coalesce(ur.is_active, true) LIMIT 1;
  IF NOT public.is_admin() AND NOT (v_me IS NOT NULL AND public.team_is_master(p_role, p_company, auth.uid(), v_me.is_primary)) THEN
    RAISE EXCEPTION 'Só o master da empresa ou o backoffice podem trocar o master' USING ERRCODE = '42501';
  END IF;
  -- o novo master precisa ser usuário ATIVO da mesma empresa
  IF NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p_new_user AND ur.role = p_role
                   AND CASE p_role WHEN 'CLIENT' THEN ur.client_id ELSE ur.supplier_id END = p_company
                   AND coalesce(ur.is_active, true)) THEN
    RAISE EXCEPTION 'O novo master precisa ser um usuário ativo desta empresa';
  END IF;
  IF v_old = p_new_user THEN RETURN; END IF;
  PERFORM set_config('app.team_rpc', '1', true);
  IF p_role = 'SUPPLIER' THEN UPDATE suppliers SET user_id = p_new_user WHERE id = p_company;
  ELSE UPDATE clients SET user_id = p_new_user WHERE id = p_company; END IF;
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'TEAM_MASTER_TRANSFER', lower(p_role), p_company,
          jsonb_build_object('de', v_old, 'para', p_new_user, 'por_backoffice', public.is_admin()));
END $function$;
GRANT EXECUTE ON FUNCTION public.team_transfer_master(text, uuid, uuid) TO authenticated;
