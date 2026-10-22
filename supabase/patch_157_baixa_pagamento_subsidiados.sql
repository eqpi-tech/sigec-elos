-- patch_157 — Baixa do pagamento do cliente nos processos subsidiados (22/10/2026)
--
-- O financeiro registra que o cliente (ex.: VIXPAR) já pagou por processos do
-- relatório de subsidiados: data do pagamento e referência (nota fiscal, boleto,
-- fatura). Um registro por processo; a baixa pode ser desfeita (fica no histórico).

CREATE TABLE IF NOT EXISTS public.subsidized_settlements (
  seal_id     uuid PRIMARY KEY REFERENCES public.seals(id) ON DELETE CASCADE,
  paid_on     date NOT NULL,
  reference   text,
  amount      numeric,
  settled_by  uuid REFERENCES auth.users(id),
  settled_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subsidized_settlements ENABLE ROW LEVEL SECURITY;   -- só pelas funções abaixo

-- registra a baixa de um ou mais processos (valor = o do relatório na data)
CREATE OR REPLACE FUNCTION public.admin_subsidized_settle(p_seals uuid[], p_paid_on date, p_reference text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_paid_on IS NULL THEN RAISE EXCEPTION 'Informe a data do pagamento'; END IF;
  INSERT INTO subsidized_settlements (seal_id, paid_on, reference, amount, settled_by)
  SELECT b.seal_id, p_paid_on, nullif(trim(coalesce(p_reference, '')), ''), b.valor, auth.uid()
    FROM admin_subsidized_billing() b WHERE b.seal_id = ANY (p_seals)
  ON CONFLICT (seal_id) DO UPDATE SET paid_on = excluded.paid_on, reference = excluded.reference,
    amount = excluded.amount, settled_by = excluded.settled_by, settled_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'SUBSIDY_SETTLED', 'seal', NULL,
          jsonb_build_object('seals', to_jsonb(p_seals), 'pago_em', p_paid_on, 'referencia', p_reference));
  RETURN n;
END $$;

-- desfaz a baixa
CREATE OR REPLACE FUNCTION public.admin_subsidized_unsettle(p_seals uuid[])
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM subsidized_settlements WHERE seal_id = ANY (p_seals);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'SUBSIDY_UNSETTLED', 'seal', NULL, jsonb_build_object('seals', to_jsonb(p_seals)));
  RETURN n;
END $$;

-- relatório com a situação do pagamento do cliente
DROP FUNCTION IF EXISTS public.admin_subsidized_billing();
CREATE FUNCTION public.admin_subsidized_billing()
RETURNS TABLE(seal_id uuid, client_name text, supplier_name text, cnpj text, flow_name text,
              valor numeric, queued_at timestamptz, status text, resultado text,
              pago_em date, referencia text, valor_pago numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.id, coalesce(c.nome_fantasia, c.razao_social)::text, sp.razao_social::text, sp.cnpj::text, f.name::text,
         coalesce(f.price_subsidized, f.price), s.queued_at, s.status::text,
         CASE WHEN s.status = 'ACTIVE' THEN 'Homologado'
              WHEN s.status = 'SUSPENDED' AND s.rejection_reason IS NOT NULL THEN 'Reprovado'
              WHEN s.status = 'EXPIRED' THEN 'Vencido'
              WHEN s.status = 'PENDING' THEN 'Em análise'
              ELSE s.status END::text,
         st.paid_on, st.reference, st.amount
  FROM seals s
  JOIN clients c ON c.id = s.client_id
  JOIN suppliers sp ON sp.id = s.supplier_id
  LEFT JOIN client_flows f ON f.id = s.flow_id
  LEFT JOIN subsidized_settlements st ON st.seal_id = s.id
  WHERE s.queued_at IS NOT NULL AND c.active
    AND (c.hoc_id IS NULL OR (c.hoc_migrated_at IS NOT NULL AND s.queued_at >= c.hoc_migrated_at))
    AND (coalesce(s.hoc_subsidized, false) OR EXISTS (
          SELECT 1 FROM invitations i WHERE i.client_id = s.client_id AND i.supplier_id = s.supplier_id
            AND i.subsidiado AND i.hoc_id IS NULL AND i.status NOT IN ('CANCELLED', 'SUPERSEDED')))
  ORDER BY s.queued_at;
END $$;

REVOKE ALL ON FUNCTION public.admin_subsidized_billing() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_subsidized_settle(uuid[], date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_subsidized_unsettle(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subsidized_billing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_subsidized_settle(uuid[], date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_subsidized_unsettle(uuid[]) TO authenticated;
