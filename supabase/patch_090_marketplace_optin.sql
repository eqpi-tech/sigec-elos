-- patch_090_marketplace_optin.sql — opt-in do Marketplace (22/09, imersão)
-- O aceite de publicação no marketplace deixa de ser obrigatório no
-- cadastro. Quem NEGAR (false) não aparece nas buscas de compradores e
-- clientes. Base existente = true (aceitou no modelo antigo obrigatório;
-- migrados HOC são a vitrine da Vendor List).
alter table suppliers add column if not exists marketplace_optin boolean not null default true;
create index if not exists idx_suppliers_mkt_optin on suppliers (marketplace_optin) where marketplace_optin = false;
