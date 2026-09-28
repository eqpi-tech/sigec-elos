-- patch_106_client_reads_own_company.sql — todo usuário de um cliente lê o
-- cadastro da PRÓPRIA empresa (28/09). Antes só o usuário principal
-- (clients.user_id) lia: para os demais o nome vinha vazio e o convite saía
-- "A Nossa empresa convida…" (10 de 12 convites do cliente âncora no dia).
drop policy if exists clients_member_read on clients;
create policy clients_member_read on clients for select
  using (id in (select ur.client_id from user_roles ur
                where ur.user_id = (select auth.uid()) and ur.role = 'CLIENT' and ur.client_id is not null));
