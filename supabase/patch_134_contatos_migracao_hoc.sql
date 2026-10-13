-- patch_134 — Contatos da migração HOC → ELOS (13/10/2026)
-- Lista dos usuários ATIVOS no HOC (clientes e fornecedores dos 4 clientes que
-- migram em 17/10) que recebem as 4 comunicações e terão o login recriado no
-- ELOS. Uma linha por e-mail. Controla o envio de cada comunicado (envios) e
-- o vínculo com a conta criada no ELOS (elos_user_id). Só backoffice/servidor.

CREATE TABLE IF NOT EXISTS public.hoc_migration_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  nome             text,
  tipo             text NOT NULL CHECK (tipo IN ('CLIENT', 'SUPPLIER')),
  hoc_user_ids     int[] NOT NULL DEFAULT '{}',
  hoc_client_ids   int[] NOT NULL DEFAULT '{}',     -- clientes do HOC ligados (usuário do cliente ou processos do fornecedor)
  clientes         text[] NOT NULL DEFAULT '{}',    -- nomes para personalizar o e-mail
  supplier_hoc_ids int[] NOT NULL DEFAULT '{}',     -- fornecedores (HOC) do usuário
  hoc_group_id     int,                             -- grupo de permissão no HOC (de/para de perfil)
  elos_user_id     uuid,                            -- conta criada/vinculada no ELOS
  envios           jsonb NOT NULL DEFAULT '{}',     -- {"1": {"em": ts, "id": resend_id}, "2": …}
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hoc_migration_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hmc_admin ON public.hoc_migration_contacts;
CREATE POLICY hmc_admin ON public.hoc_migration_contacts FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
