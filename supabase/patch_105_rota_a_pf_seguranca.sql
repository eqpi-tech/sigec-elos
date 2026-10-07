-- patch_105_rota_a_pf_seguranca.sql — Rota A, fase 1b: doc 166 (Registro e
-- autorização de funcionamento da Polícia Federal — segurança privada).
-- A consulta da PF exige login gov.br com o e-CNPJ A1 da EQPI. Guardamos só
-- o CIFRADO que a Infosimples exige (docs/certificados.md): o certificado e a
-- senha nunca são gravados abertos; a chave que decifra fica fora do ELOS
-- (conta Infosimples). Tabela sem nenhuma policy: só service_role lê.
-- Aplicar só no staging por enquanto (depende do patch_098).
create table if not exists integration_secrets (
  key        text primary key,
  value      text not null,
  note       text,
  expires_at date,
  updated_at timestamptz not null default now()
);
alter table integration_secrets enable row level security;
revoke all on integration_secrets from anon, authenticated;

update documents_catalog set route = 'A', validation_mode = 'assistido' where id = 166;
