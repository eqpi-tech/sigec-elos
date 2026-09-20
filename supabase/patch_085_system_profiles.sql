-- patch_085_system_profiles.sql — perfis "Acesso Total" de sistema (20/09)
-- 4 perfis is_system (um por papel), com modules = {'*'} (sentinela: tudo
-- liberado, à prova de módulos futuros — hasModule/hasAction tratam '*').
-- Todos os vínculos user_roles sem perfil passam a apontar para o Acesso
-- Total do papel, e um trigger garante o default para usuários novos.

-- upsert: se já existir 'Acesso Total' criado à mão p/ o papel, PROMOVE a
-- perfil de sistema com o sentinela '*' (unique em role_type+name)
insert into access_profiles (name, role_type, modules, is_system)
select 'Acesso Total', rt, array['*'], true
from unnest(array['CLIENT','SUPPLIER','ADMIN','BUYER']) rt
on conflict (role_type, name)
do update set is_system = true, modules = array['*'];

-- indelével: bloqueia DELETE de perfil de sistema no banco (a UI já esconde)
create or replace function guard_system_profiles() returns trigger
language plpgsql as $$
begin
  if old.is_system then
    raise exception 'Perfil de sistema não pode ser excluído';
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_system_profiles on access_profiles;
create trigger trg_guard_system_profiles
  before delete on access_profiles
  for each row execute function guard_system_profiles();

-- backfill: todo vínculo sem perfil recebe o Acesso Total do próprio papel
update user_roles ur
   set access_profile_id = ap.id
  from access_profiles ap
 where ap.is_system and ap.name = 'Acesso Total' and ap.role_type = ur.role
   and ur.access_profile_id is null
   and ur.role in ('CLIENT','SUPPLIER','ADMIN','BUYER');

-- default automático para novos vínculos (qualquer fluxo de criação)
create or replace function default_access_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.access_profile_id is null then
    select id into new.access_profile_id
      from access_profiles
     where is_system and name = 'Acesso Total' and role_type = new.role
     limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_default_access_profile on user_roles;
create trigger trg_default_access_profile
  before insert on user_roles
  for each row execute function default_access_profile();
