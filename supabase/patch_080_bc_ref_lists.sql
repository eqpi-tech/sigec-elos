-- patch_080_bc_ref_lists.sql — BC Report, Estágio 3 (18/09)
-- Listas restritivas ingeridas (rota A local_db) + matcher por nome.
-- Handoff §7: ingestões semanais → tabelas ref_* com data da versão da lista.
-- Nota 18/09: /acordos-leniencia SAIU da API da Transparência (conferido no
-- swagger v3) — acordos de leniência agora são dump para download, então o
-- conector 'leniencia' muda de route 'free' para 'local_db' (ref_leniencia).

-- versão de cada lista (aparece no PDF: "Lista atualizada em ...")
create table if not exists ref_list_versions (
  list text primary key,             -- 'trabalho_escravo','ofac','onu','leniencia',...
  list_date date,                    -- data da versão publicada pela fonte
  source_url text,
  rows int,
  ingested_at timestamptz default now()
);

-- Lista Suja do Trabalho Escravo (MTE) — match determinístico por documento
create table if not exists ref_trabalho_escravo (
  id bigint generated always as identity primary key,
  doc_digits text not null,          -- CNPJ/CPF só dígitos (como publicado)
  cnpj_root text,                    -- 8 primeiros dígitos quando CNPJ
  nome text not null,
  nome_norm text not null,
  uf text,
  ano_acao text,
  meta jsonb
);
create index if not exists idx_ref_te_doc on ref_trabalho_escravo (doc_digits);
create index if not exists idx_ref_te_root on ref_trabalho_escravo (cnpj_root);

-- OFAC SDN (EUA) — match por nome (fuzzy)
create table if not exists ref_ofac (
  id bigint generated always as identity primary key,
  uid text,                          -- ent_num do SDN
  nome text not null,
  nome_norm text not null,
  tipo text,                         -- 'Entity' | 'Individual' | alias ('aka')
  programs text,
  meta jsonb
);
create index if not exists idx_ref_ofac_trgm on ref_ofac using gin (nome_norm public.gin_trgm_ops);

-- ONU Consolidated Sanctions — match por nome (fuzzy)
create table if not exists ref_onu (
  id bigint generated always as identity primary key,
  uid text,                          -- dataid
  nome text not null,
  nome_norm text not null,
  tipo text,                         -- 'entity' | 'individual'
  listed_on date,
  meta jsonb
);
create index if not exists idx_ref_onu_trgm on ref_onu using gin (nome_norm public.gin_trgm_ops);

-- Acordos de Leniência (CGU, dump do Portal da Transparência)
create table if not exists ref_leniencia (
  id bigint generated always as identity primary key,
  cnpj_digits text,
  cnpj_root text,
  nome text,
  nome_norm text,
  situacao text,
  data_inicio date,
  data_fim date,
  meta jsonb
);
create index if not exists idx_ref_len_doc on ref_leniencia (cnpj_digits);
create index if not exists idx_ref_len_root on ref_leniencia (cnpj_root);

-- normalização de nomes p/ matching: sem acento, caixa alta, sem sufixo legal
create or replace function bc_norm_name(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      upper(translate(coalesce(p,''),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
      '\m(LTDA|EIRELI|EPP|MEI?|S[/.]?A\.?|SA|SOCIEDADE ANONIMA|CIA\.?|COMPANHIA|EM RECUPERACAO JUDICIAL)\M\.?', ' ', 'g'),
    '[^A-Z0-9 ]| {2,}', ' ', 'g'))
$$;

-- matcher por nome nas listas OFAC/ONU: similaridade trigram + substring.
-- Chamado só pelas Netlify Functions (service_role); fuzzy → flag 'verificar',
-- nunca 'apontamento' automático (decisão fica com o analista).
create or replace function bc_match_names(p_list text, p_names text[])
returns table (query_name text, nome text, tipo text, extra text, sim real)
language plpgsql stable as $$
declare qn text; qnorm text;
begin
  foreach qn in array p_names loop
    qnorm := bc_norm_name(qn);
    continue when length(qnorm) < 5;
    if p_list = 'ofac' then
      return query
        select qn, o.nome, o.tipo, o.programs,
               similarity(o.nome_norm, qnorm)
        from ref_ofac o
        where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'onu' then
      return query
        select qn, o.nome, o.tipo, to_char(o.listed_on,'YYYY-MM-DD'),
               similarity(o.nome_norm, qnorm)
        from ref_onu o
        where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    end if;
  end loop;
end $$;

-- RLS: mesmas regras do patch_079 — escrita só service_role, ADMIN lê
alter table ref_list_versions   enable row level security;
alter table ref_trabalho_escravo enable row level security;
alter table ref_ofac             enable row level security;
alter table ref_onu              enable row level security;
alter table ref_leniencia        enable row level security;
drop policy if exists rlv_admin on ref_list_versions;
create policy rlv_admin on ref_list_versions for select using ((select public.is_admin()));
drop policy if exists rte_admin on ref_trabalho_escravo;
create policy rte_admin on ref_trabalho_escravo for select using ((select public.is_admin()));
drop policy if exists rof_admin on ref_ofac;
create policy rof_admin on ref_ofac for select using ((select public.is_admin()));
drop policy if exists ron_admin on ref_onu;
create policy ron_admin on ref_onu for select using ((select public.is_admin()));
drop policy if exists rle_admin on ref_leniencia;
create policy rle_admin on ref_leniencia for select using ((select public.is_admin()));

-- bc_config: leniência vira local_db; URLs das fontes de ingestão editáveis
-- sem deploy (a da Lista Suja muda a cada atualização do MTE)
update bc_config
   set value = value || '{"route":"local_db","ttl_days":7,"api":null}'::jsonb
 where key = 'connector:leniencia';

insert into bc_config (key, value) values
  ('ingest:ofac', '{"url":"https://www.treasury.gov/ofac/downloads/sdn.csv","alt_url":"https://www.treasury.gov/ofac/downloads/alt.csv"}'),
  ('ingest:onu',  '{"url":"https://scsanctions.un.org/resources/xml/en/consolidated.xml"}'),
  ('ingest:trabalho_escravo', '{"url":"https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.xlsx","nota":"XLSX oficial (URL estavel, atualizado no lugar); gov.br exige UA de navegador"}'),
  ('ingest:leniencia', '{"url":"","url_template":"https://portaldatransparencia.gov.br/download-de-dados/acordos-leniencia/{date}","nota":"snapshot datado YYYYMMDD; redireciona p/ zip da CGU; o script tenta D-0..D-7"}')
on conflict (key) do nothing;
