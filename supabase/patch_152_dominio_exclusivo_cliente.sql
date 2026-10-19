-- patch_152 — Domínio de e-mail exclusivo de um cliente (19/10/2026)
--
-- Usuários com e-mail de uma empresa que saiu do grupo de um cliente seguiam
-- ativos no HOC como usuários desse cliente. Regra do Luiz: um domínio pode ser
-- EXCLUSIVO de um cliente — usuário com esse e-mail só pode ser vinculado como
-- usuário (CLIENT) do(s) cliente(s) permitido(s). Vale para script, convite e
-- backoffice (trava no banco). Os domínios ficam em app_settings
-- ('dominio_exclusivo_cliente' = {"dominio": ["<client_id>", ...]}), fora do código.

CREATE OR REPLACE FUNCTION public.client_email_domain_allowed(p_email text, p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM app_settings s, jsonb_each(s.value) d
    WHERE s.key = 'dominio_exclusivo_cliente'
      AND lower(split_part(coalesce(p_email, ''), '@', 2)) = lower(d.key)
      AND NOT (d.value ? p_client::text))
$$;

CREATE OR REPLACE FUNCTION public.trg_user_roles_client_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NEW.role <> 'CLIENT' OR NEW.client_id IS NULL OR coalesce(NEW.is_active, true) = false THEN RETURN NEW; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  IF NOT public.client_email_domain_allowed(v_email, NEW.client_id) THEN
    RAISE EXCEPTION 'O e-mail % não pode ser usuário deste cliente (domínio exclusivo de outro cliente)', v_email
      USING ERRCODE = 'P0001', HINT = 'dominio_exclusivo_cliente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_roles_client_domain ON public.user_roles;
CREATE TRIGGER trg_user_roles_client_domain BEFORE INSERT OR UPDATE OF role, client_id, is_active, user_id
  ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_client_domain();
