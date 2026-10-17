-- patch_149 — Virada da onda A: cliente inativado (histórico) e cliente ativo (17/10/2026)
--
-- Decisões do Luiz (17/10):
--   · Cliente ativo migra completo. Processo pago (boleto pago/subsidiado) segue
--     ativo; boleto do HOC a vencer → conferido todo dia no HOC até compensar;
--     sem boleto (ou boleto vencido) → o fornecedor paga pelo ELOS.
--   · Cliente inativado: os processos vêm só como HISTÓRICO
--     (sem análise, sem rotinas automáticas); os parados sem nenhum documento
--     são encerrados.
-- O processo do HOC que ainda não foi pago vira processo do ELOS aguardando
-- pagamento (hoc_process_id nulo — é assim que a trava de pagamento, as telas
-- e o Stripe o reconhecem); a origem fica em hoc_origin_process_id.

ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS hoc_origin_process_id integer,   -- processo do HOC que este continua
  ADD COLUMN IF NOT EXISTS hoc_boleto_status text,          -- boleto emitido no HOC antes da virada
  ADD COLUMN IF NOT EXISTS hoc_boleto_due date;
ALTER TABLE public.seals DROP CONSTRAINT IF EXISTS seals_hoc_boleto_status_check;
ALTER TABLE public.seals ADD CONSTRAINT seals_hoc_boleto_status_check
  CHECK (hoc_boleto_status IS NULL OR hoc_boleto_status IN ('A_VENCER', 'PAGO', 'VENCIDO'));

-- filas automáticas (patch_146) só para cliente ATIVO — cliente inativado
-- fica como histórico, mesmo migrado (regra de operável, §7.8)
CREATE OR REPLACE FUNCTION public.seal_automation_eligible(p_seal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT s.status IN ('ACTIVE','PENDING') AND s.released_at IS NOT NULL AND s.client_suspended_at IS NULL
       AND (s.client_id IS NULL OR c.active IS NOT FALSE)
       AND (s.hoc_process_id IS NULL OR c.hoc_migrated_at IS NOT NULL)
    FROM seals s LEFT JOIN clients c ON c.id = s.client_id WHERE s.id = p_seal), false)
$$;

CREATE OR REPLACE FUNCTION public.automation_doc_ids(p_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT id, supplier_id, type FROM documents WHERE id = ANY (p_ids)),
  es AS (
    SELECT s.id, s.supplier_id, s.client_id FROM seals s LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.supplier_id IN (SELECT supplier_id FROM d)
      AND s.status IN ('ACTIVE','PENDING') AND s.released_at IS NOT NULL AND s.client_suspended_at IS NULL
      AND (s.client_id IS NULL OR c.active IS NOT FALSE)
      AND (s.hoc_process_id IS NULL OR c.hoc_migrated_at IS NOT NULL)
  ),
  er AS (SELECT es.*, public.seal_required_doc_ids(es.id) AS req FROM es)
  SELECT DISTINCT d.id FROM d JOIN er ON er.supplier_id = d.supplier_id
  WHERE public.doc_relevant(er.client_id, er.req, d.type)
$$;
REVOKE ALL ON FUNCTION public.automation_doc_ids(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_automation_eligible(uuid) FROM PUBLIC, anon, authenticated;
