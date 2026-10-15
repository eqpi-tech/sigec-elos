-- patch_144 — Log do processo na visão do cliente (15/10/2026)
--
-- Pedido dos clientes: ver o LOG do processo como o backoffice vê. O log do
-- fornecedor é um só (audit_log por entity_id) e mistura processos de vários
-- clientes — o cliente só pode ver o DELE:
--   · registros do HOC (HOC_LOG) dos processos deste cliente — a importação
--     não guardou o processo; a ligação registro → cliente do HOC fica em
--     hoc_log_cliente (carga dos 4 clientes da migração) e, nos registros
--     novos, no próprio metadata (hoc_cliente_id, gravado pelo sync diário)
--   · eventos do ELOS do processo deste cliente (análise, aprovação,
--     reprovação, reabertura, prioridade, lembretes, coleta automática)
--   · mudanças do cadastro do fornecedor (dados, sócios, documentos)
-- Eventos internos da EQPI (arquivamento, MFA, campanhas, migração,
-- subsídio manual, troca de master) ficam de fora.

CREATE TABLE IF NOT EXISTS public.hoc_log_cliente (
  hoc_log_id     integer PRIMARY KEY,
  hoc_cliente_id integer NOT NULL
);
ALTER TABLE public.hoc_log_cliente ENABLE ROW LEVEL SECURITY;   -- sem políticas: só funções do servidor

CREATE OR REPLACE FUNCTION public.client_process_log(p_supplier uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_q text DEFAULT NULL)
RETURNS TABLE(id uuid, action text, metadata jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; chid int; v_seals uuid[]; v_single boolean;
        d0 timestamptz := coalesce(p_from::timestamptz, '-infinity'::timestamptz);
        d1 timestamptz := coalesce((p_to + 1)::timestamptz, 'infinity'::timestamptz);
BEGIN
  SELECT ur.client_id INTO cid FROM user_roles ur
   WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id IS NOT NULL AND coalesce(ur.is_active, true)
   LIMIT 1;
  IF cid IS NULL OR NOT EXISTS (SELECT 1 FROM seals WHERE supplier_id = p_supplier AND client_id = cid) THEN
    RAISE EXCEPTION 'Sem acesso a este processo' USING ERRCODE = '42501';
  END IF;
  SELECT hoc_id INTO chid FROM clients WHERE clients.id = cid;
  v_seals := ARRAY(SELECT s.id FROM seals s WHERE s.supplier_id = p_supplier AND s.client_id = cid);
  -- evento antigo sem processo registrado: só entra se o fornecedor tem só este cliente
  v_single := (SELECT count(DISTINCT s.client_id) FROM seals s WHERE s.supplier_id = p_supplier AND s.client_id IS NOT NULL) <= 1;
  RETURN QUERY
  SELECT a.id, a.action, a.metadata, a.created_at
  FROM audit_log a
  LEFT JOIN hoc_log_cliente m ON a.action = 'HOC_LOG' AND m.hoc_log_id = (a.metadata->>'hoc_log_id')::int
  WHERE (a.entity_id = p_supplier OR a.entity_id = ANY (v_seals))
    AND a.created_at >= d0 AND a.created_at < d1
    AND (
      (a.action = 'HOC_LOG' AND chid IS NOT NULL
        AND coalesce((a.metadata->>'hoc_cliente_id')::int, m.hoc_cliente_id) = chid)
      OR (a.action IN ('ANALYSIS_STARTED','SEAL_APPROVED','SEAL_REJECTED','SEAL_REVERTED','SEAL_AUTO_APPROVED',
                       'SEAL_AUTO_REJECTED','PROCESS_REOPENED','DOCUMENT_DECISION_REVERTED','PRIORITY_REQUESTED',
                       'DOC_PENDING_REMINDER','AUTO_COLLECT_DONE','SEAL_RENAMED')
          AND (a.entity_id = ANY (v_seals) OR a.metadata->>'seal_id' = ANY (v_seals::text[])
               OR a.metadata->>'client_id' = cid::text OR v_single))
      OR a.action IN ('SUPPLIER_PROFILE_UPDATED','SUPPLIER_PARTNER_ADDED','SUPPLIER_PARTNER_UPDATED',
                      'SUPPLIER_PARTNER_DELETED','DOCUMENT_REPLACED','DOCUMENT_EXPIRY_CHANGED')
    )
    AND (coalesce(trim(p_q), '') = '' OR a.action ILIKE '%' || p_q || '%' OR a.metadata::text ILIKE '%' || p_q || '%')
  ORDER BY a.created_at DESC
  LIMIT 300;
END $$;
GRANT EXECUTE ON FUNCTION public.client_process_log(uuid, date, date, text) TO authenticated;
