-- patch_171 — Redefinição de senha com link do próprio ELOS (10/11/2026)
-- O link de recuperação do Supabase (…supabase.co/auth/v1/verify) é de uso
-- único e é consumido pelos filtros de e-mail corporativos (Defender, Mimecast,
-- Proofpoint), que abrem os links segundos após a entrega — caso VIX 09/11:
-- 3 links consumidos por IPs da AWS em 4 s; para a usuária "expirado".
-- Agora: link elos.eqpitech.com.br/redefinir-senha?t=… — abrir não consome;
-- a senha só é gravada quando a pessoa digita e confirma (password-reset.js).
-- Guardamos só o hash do token. Só service_role.
create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  origem      text not null default 'esqueci' check (origem in ('esqueci', 'backoffice')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_pwd_reset_user on public.password_reset_tokens(user_id, created_at desc);
alter table public.password_reset_tokens enable row level security;   -- sem policies: só service_role
