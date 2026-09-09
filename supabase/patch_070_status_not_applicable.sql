-- PATCH 070: documents_status_check aceita NOT_APPLICABLE
-- A UI/admin-approve usam 'Não se aplica' desde patch_043, mas o CHECK
-- nunca foi atualizado — o insert direto era o único caminho que batia nele.
ALTER TABLE documents DROP CONSTRAINT documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK
  (status = ANY (ARRAY['VALID','EXPIRING','EXPIRED','MISSING','PENDING','REJECTED','NOT_APPLICABLE']));
