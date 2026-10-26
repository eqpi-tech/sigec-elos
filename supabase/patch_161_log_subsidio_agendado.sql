-- patch_161 — Log do processo (cliente): troca para subsidiado agendada e anulada (26/10/2026)
-- Complementa patch_159/160: o cliente vê no log quando pediu o subsídio com
-- boleto em aberto (agendado) e, se o fornecedor pagou antes do vencimento, que
-- o pedido foi anulado (vale o pagamento do fornecedor; o cliente não é cobrado).

CREATE OR REPLACE FUNCTION public.client_process_log(p_supplier uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_q text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, action text, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                       'DOC_PENDING_REMINDER','AUTO_COLLECT_DONE','SEAL_RENAMED','INVITATION_SUBSIDIZED',
                       'INVITATION_SUBSIDY_SCHEDULED','INVITATION_SUBSIDY_VOIDED')
          AND (a.entity_id = ANY (v_seals) OR a.metadata->>'seal_id' = ANY (v_seals::text[])
               OR a.metadata->>'client_id' = cid::text OR v_single))
      OR a.action IN ('SUPPLIER_PROFILE_UPDATED','SUPPLIER_PARTNER_ADDED','SUPPLIER_PARTNER_UPDATED',
                      'SUPPLIER_PARTNER_DELETED','DOCUMENT_REPLACED','DOCUMENT_EXPIRY_CHANGED')
    )
    AND (coalesce(trim(p_q), '') = '' OR a.action ILIKE '%' || p_q || '%' OR a.metadata::text ILIKE '%' || p_q || '%')
  ORDER BY a.created_at DESC
  LIMIT 300;
END $function$;
