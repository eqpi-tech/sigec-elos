
-- PATCH 050: travas anti-duplicação na emissão de NFSe
-- (NFE.io bloqueia por reenvio constante — garantia: <=1 envio automático
--  por nota; ambiguidades vão p/ NEEDS_REVIEW e só voltam por decisão humana)
ALTER TABLE nfe_invoices ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nfe_invoices ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
