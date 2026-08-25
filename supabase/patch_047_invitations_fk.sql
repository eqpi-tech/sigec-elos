
-- PATCH 047: FK invitations.client_id → clients (habilita o join embutido
-- do PostgREST usado em invitation-reminders e admin-approve-document)
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_client_id_fkey;
ALTER TABLE invitations ADD CONSTRAINT invitations_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
