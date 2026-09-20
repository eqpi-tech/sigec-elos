-- patch_084_profiles_admin_buyer.sql — perfis de acesso p/ BACKOFFICE e
-- COMPRADOR (20/09). O sistema de perfis (patch_038) cobria só CLIENT/
-- SUPPLIER; o CHECK passa a aceitar os 4 papéis. O plumbing (user_roles.
-- access_profile_id → modules) já é agnóstico de papel. Fallbacks
-- permissivos preservados (usuário sem perfil vê tudo — regra de ouro §4).
alter table access_profiles drop constraint if exists access_profiles_role_type_check;
alter table access_profiles add constraint access_profiles_role_type_check
  check (role_type in ('CLIENT', 'SUPPLIER', 'ADMIN', 'BUYER'));
