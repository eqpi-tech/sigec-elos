-- patch_093_mobilidade.sql — Módulo de Mobilidade (SPEC_MOBILIDADE.md, 23/09)
-- Homologação de documentos de PF por posto/pessoa para serviços com mão de
-- obra alocada (vigilância, limpeza, portaria...). Três tabelas novas +
-- vínculo em documents + migração dos docs PF da matriz PJ para a matriz de
-- mobilidade. Idempotente.

-- ── Postos (slots abertos pelo backoffice, sempre a partir de um CNPJ) ────
create table if not exists mobility_posts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id),
  category_id   integer not null references categories(id),
  supplier_cnpj text not null,                 -- 14 dígitos; abre o slot antes do cadastro
  supplier_id   uuid references suppliers(id), -- resolvido quando o CNPJ entra na base
  site_city     text not null,
  site_uf       text not null,
  armado        boolean not null default false,
  qty_posts     int  not null default 1 check (qty_posts  > 0),
  qty_people    int  not null check (qty_people > 0),
  funcao_label  text,                          -- rótulo original da planilha (ex. "ASG 40%")
  active        boolean not null default true,
  source        text not null default 'manual' check (source in ('manual','import')),
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_mobility_posts_cnpj   on mobility_posts (supplier_cnpj);
create index if not exists idx_mobility_posts_client on mobility_posts (client_id);
-- idempotência da importação (e do CRUD): 1 slot por combinação
create unique index if not exists uq_mobility_posts_slot
  on mobility_posts (client_id, supplier_cnpj, category_id, site_city, site_uf, coalesce(funcao_label,''));

-- ── Pessoas alocadas num posto ────────────────────────────────────────────
create table if not exists mobility_people (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references mobility_posts(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  nome        text not null,
  cpf_digits  text not null check (cpf_digits ~ '^[0-9]{11}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (post_id, cpf_digits)
);
create index if not exists idx_mobility_people_supplier on mobility_people (supplier_id);

-- ── Matriz de Mobilidade (categoria → docs PF, com escopo) ────────────────
create table if not exists category_mobility_documents (
  id          bigint generated always as identity primary key,
  category_id integer not null references categories(id),
  document_id int    not null references documents_catalog(id),
  escopo      text   not null check (escopo in ('pessoa','posto')),
  required    boolean not null default true,
  blocking    boolean not null default true,
  unique (category_id, document_id)
);

-- ── documents: vínculo com pessoa/posto ───────────────────────────────────
alter table documents add column if not exists mobility_person_id uuid references mobility_people(id),
                      add column if not exists mobility_post_id   uuid references mobility_posts(id);
create index if not exists idx_documents_mobility_post on documents (mobility_post_id) where mobility_post_id is not null;

-- ── RLS (padrão das tabelas de matriz: admin ALL + leitura autenticada) ───
alter table mobility_posts              enable row level security;
alter table mobility_people             enable row level security;
alter table category_mobility_documents enable row level security;

drop policy if exists mob_posts_admin on mobility_posts;
create policy mob_posts_admin on mobility_posts for all
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists mob_posts_supplier_read on mobility_posts;
create policy mob_posts_supplier_read on mobility_posts for select
  using (supplier_id in (select my_supplier_ids())
      or supplier_cnpj in (select s.cnpj from suppliers s where s.id in (select my_supplier_ids())));
drop policy if exists mob_posts_client_read on mobility_posts;
create policy mob_posts_client_read on mobility_posts for select
  using (client_id in (select c.id from clients c where c.user_id = (select auth.uid())));

drop policy if exists mob_people_admin on mobility_people;
create policy mob_people_admin on mobility_people for all
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists mob_people_supplier on mobility_people;
create policy mob_people_supplier on mobility_people for all
  using (supplier_id in (select my_supplier_ids()))
  with check (supplier_id in (select my_supplier_ids()));

drop policy if exists cmd_admin on category_mobility_documents;
create policy cmd_admin on category_mobility_documents for all
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists cmd_read on category_mobility_documents;
create policy cmd_read on category_mobility_documents for select
  using (auth.role() = 'authenticated');

-- ── Catálogo: docs de pessoa marcados como dado pessoal ───────────────────
update documents_catalog set dado_pessoal = true where id in (10017, 10019) and dado_pessoal is distinct from true;

-- ── Migração: docs PF saem da matriz PJ → matriz de mobilidade ────────────
-- Regra (SPEC §3): os 5 docs PF (10012 CNH, 10016 ASO, 10017 Arma, 10018 CNV,
-- 10019 Curso) migram de TODAS as categorias onde estiverem (só existem em
-- categorias ELOS-native de cliente — nunca nas espelhadas do HOC, que o sync
-- reescreveria). PCMSO (545) e PGR (546) migram APENAS nas categorias que
-- também têm algum doc PF (i.e., categorias de mobilidade), com escopo 'posto'.
with pf as (
  select cd.category_id, cd.document_id, cd.required, cd.blocking,
         case when cd.document_id = 10017 then 'posto' else 'pessoa' end as escopo
  from category_documents cd
  where cd.document_id in (10012, 10016, 10017, 10018, 10019)
), programas as (
  select cd.category_id, cd.document_id, cd.required, cd.blocking, 'posto' as escopo
  from category_documents cd
  where cd.document_id in (545, 546)
    and cd.category_id in (select distinct category_id from pf)
)
insert into category_mobility_documents (category_id, document_id, escopo, required, blocking)
select category_id, document_id, escopo, coalesce(required, true), coalesce(blocking, true)
from (select * from pf union all select * from programas) m
on conflict (category_id, document_id) do nothing;

delete from category_documents cd
using category_mobility_documents cmd
where cmd.category_id = cd.category_id and cmd.document_id = cd.document_id;
