-- patch_086_profile_counts.sql — contagem de usuários por perfil (20/09)
-- A tela de Perfis contava user_roles client-side, mas as policies são
-- "cada usuário vê o próprio vínculo" → o admin via contagem 0/1. Padrão
-- do projeto: RPC SECURITY DEFINER guardada por is_admin() (§7.6).
create or replace function admin_profile_user_counts()
returns table (access_profile_id uuid, users bigint)
language sql stable security definer set search_path = public as $$
  select ur.access_profile_id, count(distinct ur.user_id)
  from user_roles ur
  where ur.access_profile_id is not null
    and (select public.is_admin())
  group by ur.access_profile_id
$$;
grant execute on function admin_profile_user_counts() to authenticated;
