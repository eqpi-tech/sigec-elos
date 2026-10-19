-- patch_151 — Verificação em duas etapas: lembrar o navegador (19/10/2026)
--
-- Pedido do Luiz (19/10): o código do autenticador era pedido a cada novo
-- login, várias vezes por dia.
--   · backoffice (ADMIN): checkbox "Lembrar este navegador por 30 dias"
--   · fornecedor, cliente e comprador: o navegador fica lembrado por 24 horas
-- A confiança é concedida pelo SERVIDOR só numa sessão que acabou de passar
-- pelo código (aal2) e fica registrada aqui: tem prazo, pode ser revogada
-- (o reset da verificação pelo backoffice revoga todas) e só o hash do token
-- é guardado. O navegador guarda o token; nada é exposto a outros usuários.

CREATE TABLE IF NOT EXISTS public.mfa_trusted_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS mfa_trusted_devices_user_idx ON public.mfa_trusted_devices (user_id);
ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;   -- sem policy: só pelas funções abaixo

-- concede: só com a sessão AAL2 (código acabou de ser validado)
--   ADMIN: 30 dias, e só se marcou "lembrar" · demais perfis: sempre 24 horas
CREATE OR REPLACE FUNCTION public.mfa_trust_device(p_remember boolean, p_user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_uid uuid := auth.uid(); v_token text; v_until timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501'; END IF;
  IF coalesce(auth.jwt()->>'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'verificação em duas etapas não concluída nesta sessão' USING ERRCODE = '42501';
  END IF;
  IF public.is_admin() THEN
    IF NOT coalesce(p_remember, false) THEN RETURN NULL; END IF;
    v_until := now() + interval '30 days';
  ELSE
    v_until := now() + interval '24 hours';
  END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO mfa_trusted_devices (user_id, token_hash, expires_at, user_agent)
  VALUES (v_uid, encode(digest(v_token, 'sha256'), 'hex'), v_until, left(p_user_agent, 300));
  -- limpeza: vencidos há mais de 30 dias
  DELETE FROM mfa_trusted_devices WHERE user_id = v_uid AND expires_at < now() - interval '30 days';
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_until);
END $$;

-- confere: token deste usuário, no prazo e não revogado
CREATE OR REPLACE FUNCTION public.mfa_device_trusted(p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR coalesce(p_token, '') = '' THEN RETURN false; END IF;
  SELECT id INTO v_id FROM mfa_trusted_devices
   WHERE user_id = auth.uid() AND token_hash = encode(digest(p_token, 'sha256'), 'hex')
     AND expires_at > now() AND revoked_at IS NULL;
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE mfa_trusted_devices SET last_used_at = now() WHERE id = v_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.mfa_trust_device(boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mfa_device_trusted(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_trust_device(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfa_device_trusted(text) TO authenticated;
