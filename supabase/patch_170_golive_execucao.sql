-- patch_170 — Go-live VIXPAR 04/11: o que a execução automática precisa (29/10/2026)
-- 1) admin_user_id_by_email: achar o login pelo e-mail (a listagem do Auth é
--    paginada e erra com muitos usuários). Só service_role.
-- 2) invitations.operational_emails: os e-mails "Operacional" da empresa (2º e-mail
--    em diante da planilha) — ao concluir o cadastro pelo convite, cada um vira
--    usuário com o perfil Operacional e recebe o próprio acesso.
-- 3) golive_suppliers.user_id: o login (Acesso Total) do pré-cadastro.
create or replace function public.admin_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke all on function public.admin_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_user_id_by_email(text) to service_role;

alter table invitations add column if not exists operational_emails text[];
alter table golive_suppliers add column if not exists user_id uuid;
