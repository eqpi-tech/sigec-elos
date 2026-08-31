-- PATCH 058: código do certificado materializado + verificação pública
-- O certificado imprime 'ELOS-' + 12 primeiros hex do UUID do selo
-- (Certificate.jsx). Materializa a MESMA derivação em coluna gerada, para
-- certificados já emitidos continuarem verificáveis, e indexa para a
-- consulta pública (função verify-certificate).
ALTER TABLE seals ADD COLUMN IF NOT EXISTS cert_code text
  GENERATED ALWAYS AS ('ELOS-' || upper(substr(replace(id::text, '-', ''), 1, 12))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS seals_cert_code_uniq ON seals(cert_code);
