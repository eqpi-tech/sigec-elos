-- patch_178 — e-mail do login para as rotinas de aviso (13/11/2026)
-- pending-docs-reminders-background e check-expiring-docs chamavam
-- get_user_emails_by_ids, que NUNCA foi criada: sem ela os avisos só iam para
-- o e-mail do cadastro da empresa — 135 de 154 processos da VIX (pré-cadastro e
-- convites usam só o login) ficavam sem lembrete de documentos. Só service_role.
create or replace function public.get_user_emails_by_ids(user_ids uuid[])
returns table(id uuid, email text) language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text from auth.users u where u.id = any(user_ids)
$$;
revoke all on function public.get_user_emails_by_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.get_user_emails_by_ids(uuid[]) to service_role;
