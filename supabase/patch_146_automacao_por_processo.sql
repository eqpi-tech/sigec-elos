-- patch_146 — Filas automáticas por PROCESSO e marca de cliente migrado (16/10/2026)
--
-- Regra do Luiz (16/10): o que decide é a origem do PROCESSO, não a do fornecedor.
--   · processo nascido no ELOS (seals.hoc_process_id nulo) → entra nas filas
--     automáticas (vencido, renovação Rota A, avisos de vencimento, lembretes)
--   · processo nascido no HOC → só depois que o CLIENTE do processo for migrado
--     oficialmente (clients.hoc_migrated_at). Só 4 migram: SPMar e Chemtrade
--     (17/10), MVV e Appian/Atlantic Nickel (21/11).
-- O documento é um só por fornecedor: entra quando ALGUM processo que o exige
-- está nas filas automáticas.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS hoc_migrated_at timestamptz;  -- preenchido na virada

-- processo nas filas automáticas?
CREATE OR REPLACE FUNCTION public.seal_automation_eligible(p_seal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT s.status IN ('ACTIVE','PENDING') AND s.released_at IS NOT NULL AND s.client_suspended_at IS NULL
       AND (s.hoc_process_id IS NULL OR c.hoc_migrated_at IS NOT NULL)
    FROM seals s LEFT JOIN clients c ON c.id = s.client_id WHERE s.id = p_seal), false)
$$;

-- dos documentos informados, os que são de algum processo nas filas automáticas
CREATE OR REPLACE FUNCTION public.automation_doc_ids(p_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT id, supplier_id, type FROM documents WHERE id = ANY (p_ids)),
  es AS (
    SELECT s.id, s.supplier_id, s.client_id FROM seals s LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.supplier_id IN (SELECT supplier_id FROM d)
      AND s.status IN ('ACTIVE','PENDING') AND s.released_at IS NOT NULL AND s.client_suspended_at IS NULL
      AND (s.hoc_process_id IS NULL OR c.hoc_migrated_at IS NOT NULL)
  ),
  er AS (SELECT es.*, public.seal_required_doc_ids(es.id) AS req FROM es)
  SELECT DISTINCT d.id FROM d JOIN er ON er.supplier_id = d.supplier_id
  WHERE public.doc_relevant(er.client_id, er.req, d.type)
$$;
REVOKE ALL ON FUNCTION public.automation_doc_ids(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_automation_eligible(uuid) FROM PUBLIC, anon, authenticated;

-- seleção já filtrada no banco: o PostgREST devolve no máximo 1.000 linhas e só
-- os VALID/EXPIRING vencidos passam de 1.500 (a maioria espelhada do HOC)
--   p_from/p_to: faixa inclusiva de expires_at · p_before: expires_at < p_before
CREATE OR REPLACE FUNCTION public.automation_docs(p_statuses text[], p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_types text[] DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x FROM (
    SELECT array_agg(id) AS ids FROM documents
    WHERE status = ANY (p_statuses)
      AND (p_from IS NULL OR expires_at >= p_from) AND (p_to IS NULL OR expires_at <= p_to)
      AND (p_before IS NULL OR expires_at < p_before) AND (p_types IS NULL OR type = ANY (p_types))
  ) c, public.automation_doc_ids(c.ids) x
$$;
REVOKE ALL ON FUNCTION public.automation_docs(text[], timestamptz, timestamptz, timestamptz, text[]) FROM PUBLIC, anon, authenticated;
