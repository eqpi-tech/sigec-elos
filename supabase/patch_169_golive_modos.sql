-- patch_169 — Go-live VIXPAR: o texto do comunicado depende de como a pessoa entra
-- (29/10/2026, decisões do Luiz): 'convite' (Acesso Total de 1 empresa — convite
-- normal em 04/11), 'operacional' (2º e-mail — recebe o acesso quando a empresa se
-- cadastra), 'precadastro' (e-mail com 2+ empresas — a EQPI cadastra todas e manda
-- UM acesso em 04/11). E a fila do go-live por EMPRESA (golive_suppliers): o envio
-- de 04/11 lê daqui (convite ou pré-cadastro), com o fluxo e os e-mails.
alter table golive_contacts add column if not exists modo text check (modo in ('convite','operacional','precadastro'));
alter table golive_contacts add column if not exists empresas int;
create table if not exists golive_suppliers (
  id            uuid primary key default gen_random_uuid(),
  campanha      text not null,
  cnpj          text not null,
  razao_social  text,
  nome          text,
  subcategoria  text,
  flow_name     text not null,
  master_email  text not null,
  operacionais  text[] not null default '{}',
  modo          text not null check (modo in ('convite','precadastro')),
  linhas        int[],                 -- linhas da planilha (rastreabilidade)
  status        text not null default 'PENDENTE' check (status in ('PENDENTE','ENVIADO','CADASTRADO','ERRO','SUSPENSO')),
  invitation_id uuid,
  supplier_id   uuid,
  erro          text,
  processado_em timestamptz,
  created_at    timestamptz not null default now(),
  unique (campanha, cnpj)
);
alter table golive_suppliers enable row level security;   -- só service_role
