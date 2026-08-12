-- ============================================================
-- PATCH 029 — Histórico Documental
-- Trilha de versões de cada documento: todo INSERT/UPDATE em
-- `documents` gera um snapshot em `document_history` via trigger.
-- Captura upload, aprovação, rejeição, revogação e coleta
-- automática — independente do caminho de código.
-- Executar no SQL Editor do Supabase Dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL,                -- sem FK: preserva histórico se o doc for excluído
  supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  label              TEXT,
  event              TEXT NOT NULL CHECK (event IN ('CREATED','UPLOADED','APPROVED','REJECTED','REVOKED','EXPIRED','UPDATED')),
  status             TEXT,
  source             TEXT,
  storage_path       TEXT,
  expires_at         TIMESTAMPTZ,
  issued_at          TIMESTAMPTZ,
  review_note        TEXT,
  reviewed_by        UUID,
  inscription_number TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dochist_supplier ON document_history(supplier_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dochist_document ON document_history(document_id, created_at DESC);

ALTER TABLE document_history ENABLE ROW LEVEL SECURITY;

-- Fornecedor lê o próprio histórico
DROP POLICY IF EXISTS dochist_supplier_read ON document_history;
CREATE POLICY dochist_supplier_read ON document_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'SUPPLIER'
      AND ur.supplier_id = document_history.supplier_id
  ));

-- ADMIN lê tudo
DROP POLICY IF EXISTS dochist_admin_read ON document_history;
CREATE POLICY dochist_admin_read ON document_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
  ));

-- Escrita apenas via trigger (SECURITY DEFINER) — nenhuma policy de INSERT p/ clientes

-- ── Trigger de snapshot ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_document_history_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'CREATED';
  ELSE
    -- Deriva o evento da transição de estado
    IF NEW.status = 'VALID'    AND OLD.status IS DISTINCT FROM 'VALID'    THEN v_event := 'APPROVED';
    ELSIF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN v_event := 'REJECTED';
    ELSIF NEW.status = 'EXPIRED'  AND OLD.status IS DISTINCT FROM 'EXPIRED'  THEN v_event := 'EXPIRED';
    ELSIF OLD.status = 'VALID' AND NEW.status IN ('PENDING','MISSING')       THEN v_event := 'REVOKED';
    ELSIF NEW.storage_path IS DISTINCT FROM OLD.storage_path                 THEN v_event := 'UPLOADED';
    ELSE
      -- Ignora updates sem mudança relevante (ex.: só updated_at)
      IF NEW.status IS NOT DISTINCT FROM OLD.status
         AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
         AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note
         AND NEW.inscription_number IS NOT DISTINCT FROM OLD.inscription_number THEN
        RETURN NEW;
      END IF;
      v_event := 'UPDATED';
    END IF;
  END IF;

  INSERT INTO document_history
    (document_id, supplier_id, type, label, event, status, source, storage_path,
     expires_at, issued_at, review_note, reviewed_by, inscription_number)
  VALUES
    (NEW.id, NEW.supplier_id, NEW.type, NEW.label, v_event, NEW.status, NEW.source, NEW.storage_path,
     NEW.expires_at, NEW.issued_at, NEW.review_note, NEW.reviewed_by, NEW.inscription_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_history ON documents;
CREATE TRIGGER trg_document_history
  AFTER INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION fn_document_history_snapshot();

-- Snapshot inicial do estado atual (marca como CREATED para ter linha de base)
INSERT INTO document_history
  (document_id, supplier_id, type, label, event, status, source, storage_path,
   expires_at, issued_at, review_note, reviewed_by, inscription_number)
SELECT id, supplier_id, type, label, 'CREATED', status, source, storage_path,
       expires_at, issued_at, review_note, reviewed_by, inscription_number
FROM documents
WHERE NOT EXISTS (SELECT 1 FROM document_history dh WHERE dh.document_id = documents.id);
