-- PATCH 052: flag LGPD no catálogo de documentos (docs de pessoa física:
-- CNH, ASO, CNV — armazenar só no escopo do processo, sem reuso público)
ALTER TABLE documents_catalog ADD COLUMN IF NOT EXISTS dado_pessoal BOOLEAN NOT NULL DEFAULT FALSE;
