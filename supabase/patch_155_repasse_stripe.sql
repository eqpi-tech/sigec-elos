-- patch_155 — Previsão de repasse do Stripe por meio de pagamento (21/10/2026)
--
-- O relatório financeiro previa todo repasse em pagamento + 3 dias úteis. No
-- Brasil o Stripe libera cartão nacional em 30 dias corridos (internacional em
-- 5), Pix e boleto em 2 dias úteis, com repasse automático diário (conferido
-- na conta: delay_days = 30). Cada pagamento passa a guardar o meio e a data
-- de liberação informada pelo próprio Stripe (balance_transaction.available_on).
ALTER TABLE public.nfe_invoices
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS stripe_available_on timestamptz;
