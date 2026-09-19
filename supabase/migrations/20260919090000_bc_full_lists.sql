-- patch_081_bc_full_lists.sql — BC Report, Estágio 8 (19/09)
-- Listas do Full: PEP (Transparência), TSE candidaturas e ICIJ Offshore
-- Leaks + extensão do matcher por nome. TSE/ICIJ são dumps grandes: as
-- tabelas ficam prontas e a ingestão é opt-in por URL em bc_config
-- ('ingest:tse', 'ingest:icij'); sem versão em ref_list_versions o
-- conector responde 'indisponivel — base não ingerida'.

create table if not exists ref_pep (
  id bigint generated always as identity primary key,
  cpf_masked text,                  -- Transparência publica CPF parcial
  nome text not null,
  nome_norm text not null,
  sigla_funcao text,
  descricao_funcao text,
  orgao text,
  uf text,
  meta jsonb
);
create index if not exists idx_ref_pep_trgm on ref_pep using gin (nome_norm public.gin_trgm_ops);

create table if not exists ref_tse (
  id bigint generated always as identity primary key,
  cpf_digits text,
  nome text not null,
  nome_norm text not null,
  ano text,
  cargo text,
  partido text,
  uf text,
  situacao text,
  meta jsonb
);
create index if not exists idx_ref_tse_trgm on ref_tse using gin (nome_norm public.gin_trgm_ops);
create index if not exists idx_ref_tse_cpf on ref_tse (cpf_digits);

create table if not exists ref_icij (
  id bigint generated always as identity primary key,
  uid text,
  nome text not null,
  nome_norm text not null,
  tipo text,                        -- entity | officer | intermediary
  fonte text,                       -- panama papers | paradise | pandora | offshore
  pais text,
  meta jsonb
);
create index if not exists idx_ref_icij_trgm on ref_icij using gin (nome_norm public.gin_trgm_ops);

-- matcher estendido (substitui a versão do patch_080 — mesmos contratos)
create or replace function bc_match_names(p_list text, p_names text[])
returns table (query_name text, nome text, tipo text, extra text, sim real)
language plpgsql stable as $$
declare qn text; qnorm text;
begin
  foreach qn in array p_names loop
    qnorm := bc_norm_name(qn);
    continue when length(qnorm) < 5;
    if p_list = 'ofac' then
      return query select qn, o.nome, o.tipo, o.programs, similarity(o.nome_norm, qnorm)
        from ref_ofac o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'onu' then
      return query select qn, o.nome, o.tipo, to_char(o.listed_on,'YYYY-MM-DD'), similarity(o.nome_norm, qnorm)
        from ref_onu o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'pep' then
      return query select qn, o.nome, coalesce(o.descricao_funcao, o.sigla_funcao), o.orgao, similarity(o.nome_norm, qnorm)
        from ref_pep o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'tse' then
      return query select qn, o.nome, o.cargo||' '||o.ano, o.partido||'/'||o.uf, similarity(o.nome_norm, qnorm)
        from ref_tse o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'icij' then
      return query select qn, o.nome, o.tipo||' · '||coalesce(o.fonte,''), o.pais, similarity(o.nome_norm, qnorm)
        from ref_icij o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    end if;
  end loop;
end $$;

alter table ref_pep  enable row level security;
alter table ref_tse  enable row level security;
alter table ref_icij enable row level security;
drop policy if exists rpep_admin on ref_pep;
create policy rpep_admin on ref_pep for select using ((select public.is_admin()));
drop policy if exists rtse_admin on ref_tse;
create policy rtse_admin on ref_tse for select using ((select public.is_admin()));
drop policy if exists ricij_admin on ref_icij;
create policy ricij_admin on ref_icij for select using ((select public.is_admin()));

-- fontes de ingestão. PEP mudou p/ consulta direta na API (/peps?nome=) —
-- o host de downloads da CGU levantou captcha em 19/09; a ref_pep fica
-- disponível como cache offline opcional.
insert into bc_config (key, value) values
  ('ingest:pep',  '{"url":"","url_template":"https://portaldatransparencia.gov.br/download-de-dados/pep/{date}","nota":"OPCIONAL (cache offline): snapshot MENSAL YYYYMM; o conector usa a API /peps"}'),
  ('ingest:tse',  '{"url":"","nota":"opt-in: CSV consulta_cand do TSE (por ano); sem URL a base fica vazia e o conector responde indisponivel"}'),
  ('ingest:icij', '{"url":"","nota":"opt-in: nodes-entities/officers do ICIJ Offshore Leaks; sem URL idem"}')
on conflict (key) do nothing;

-- caminhos reais validados por sonda 19/09 (602/606): MPT é POR UF e
-- prefeitura segue pref/{uf}/{municipio}/cnd — anotação no catálogo
update bc_config set value = value || '{"api":"mpt/{uf}/cnf","nota":"validado 19/09: cnf-unificada nao existe na API; usar UF da sede"}'::jsonb
 where key = 'connector:mpt_cnf';
update bc_config set value = value || '{"api":"pref/{uf}/{municipio}/cnd","nota":"validado 19/09; municipio fora da cobertura -> indisponivel"}'::jsonb
 where key = 'connector:pref_cnd';
update bc_config set value = value || '{"api":"sefaz/{uf}/certidao-debitos"}'::jsonb
 where key = 'connector:sefaz_cnd';
update bc_config set value = value || '{"api":"sintegra/{uf}"}'::jsonb
 where key = 'connector:sintegra';

-- PEP vira rota free (API /peps por nome de sócio) — validado 19/09
update bc_config set value = value || '{"route":"free","ttl_days":7,"api":"peps?nome=","nota":"API da Transparencia; dump da CGU atras de captcha"}'::jsonb
 where key = 'connector:pep';
