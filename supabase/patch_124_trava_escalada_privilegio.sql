-- patch_124 — Trava de escalada de privilégio (12/10/2026)
-- Achado na revisão do cadastro pelo portal: com a chave pública (anon) do
-- navegador, qualquer usuário conseguia virar ADMIN por 3 caminhos:
--   1. signUp com user_metadata { role: 'ADMIN' } → handle_new_user copiava o papel
--   2. UPDATE profiles SET role = 'ADMIN' no próprio perfil (policy profiles_update)
--   3. INSERT/UPDATE em user_roles do próprio usuário (role ADMIN/CLIENT, outro
--      supplier_id/client_id, plano de comprador pago sem pagar)
-- Regra: papel e vínculos só mudam pelo SERVIDOR (service_role nas Netlify
-- functions) ou por um ADMIN. O navegador continua podendo mudar o que é dele
-- de fato: nome, telefone, tour, carência do MFA, ativo/primário.
-- Pedidos sem JWT de usuário (service_role, SQL editor, scripts) não mudam.

-- 1. cadastro público: o metadata do usuário só escolhe SUPPLIER ou BUYER;
--    CLIENT/ADMIN são gravados pelas functions (upsert em profiles com service_role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data->>'role' IN ('SUPPLIER','BUYER')
         THEN NEW.raw_user_meta_data->>'role' ELSE 'SUPPLIER' END,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2. a requisição veio de um usuário final (JWT authenticated/anon)?
CREATE OR REPLACE FUNCTION public.is_end_user_request()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '')
         IN ('authenticated', 'anon');
$function$;

-- 3. profiles: papel e vínculos imutáveis pelo navegador
CREATE OR REPLACE FUNCTION public.trg_profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin() THEN
    IF NEW.id          IS DISTINCT FROM OLD.id
    OR NEW.role        IS DISTINCT FROM OLD.role
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.buyer_id    IS DISTINCT FROM OLD.buyer_id THEN
      RAISE EXCEPTION 'Alteração não permitida: papel e vínculos do perfil só mudam pelo sistema'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_guard ON public.profiles;
CREATE TRIGGER trg_profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_guard();

-- 4. user_roles: o navegador não cria vínculo e só altera ativo/primário
CREATE OR REPLACE FUNCTION public.trg_user_roles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin() THEN
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

DROP TRIGGER IF EXISTS trg_user_roles_guard ON public.user_roles;
CREATE TRIGGER trg_user_roles_guard BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_guard();
