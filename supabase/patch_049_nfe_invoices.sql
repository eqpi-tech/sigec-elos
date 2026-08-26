
-- ============================================================
-- PATCH 049 — Fila de emissão de NFSe (NFE.io) para pagamentos ELOS
-- Espelha o padrão do eqpi-nfe-emissor (HOC): fila de pagos-sem-nota,
-- idempotência por pagamento, falhas não-retryáveis marcadas.
-- Regra: só entra na fila pagamento EFETIVO (amount > 0 — cupom 100% não emite).
-- ============================================================
CREATE TABLE IF NOT EXISTS nfe_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID REFERENCES suppliers(id),
  source             TEXT NOT NULL DEFAULT 'STRIPE',
  stripe_invoice_id  TEXT UNIQUE,          -- invoice de assinatura (1ª cobrança e renovações)
  stripe_session_id  TEXT UNIQUE,          -- pagamento avulso (homologação convidado)
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'brl',
  plan_type          TEXT,
  description        TEXT,
  paid_at            TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | EMITTED | FAILED | SKIPPED_ZERO
  nfeio_id           TEXT,
  serie              TEXT,
  numero             TEXT,
  codigo_verificacao TEXT,
  nfe_status         TEXT,
  log_erro           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  emitted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nfe_invoices_status_idx ON nfe_invoices(status);
ALTER TABLE nfe_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nfe_invoices_admin_read ON nfe_invoices;
CREATE POLICY nfe_invoices_admin_read ON nfe_invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));
