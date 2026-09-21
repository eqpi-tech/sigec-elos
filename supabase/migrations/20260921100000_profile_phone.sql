-- patch_088_profile_phone.sql — Minha Conta (21/09)
-- Telefone do usuário no próprio perfil (base p/ o MFA que vem em breve).
-- O usuário edita a própria linha (policy profiles_update já existe).
alter table profiles add column if not exists phone text;
