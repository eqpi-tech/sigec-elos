-- patch_162 — Comunicados de go-live de cliente (29/10/2026; 1º uso: VIXPAR)
-- Lista de destinatários por campanha (planilha validada pelo cliente), com
-- exclusões (ex.: fornecedores que participaram dos testes NÃO recebem) e o
-- registro de cada envio — reexecutar não reenvia. Usada por
-- scripts/comunicados_golive/enviar.py. Só service_role (sem acesso do navegador).
create table if not exists golive_contacts (
  id              uuid primary key default gen_random_uuid(),
  campanha        text not null,                 -- ex.: 'VIX'
  cnpj            text,
  razao_social    text,
  email           text not null,
  nivel           text,                          -- fluxo/nível do convite (planilha final)
  excluido        boolean not null default false,
  motivo_exclusao text,
  envios          jsonb not null default '{}'::jsonb,   -- { "1": {"em": "...", "id": "resend"} }
  created_at      timestamptz not null default now(),
  unique (campanha, email)
);
alter table golive_contacts enable row level security;   -- sem policies: só service_role
