-- patch_073_terms_compliance.sql — demandas VIX generalizadas (18/09)
-- 1) Termos de aceite viram COLEÇÃO por cliente (texto ou documento hospedado),
--    com trilha de aceite por item/versão no cadastro do fornecedor.
-- 2) Questionários ganham parametrização de COMPLIANCE por pergunta (respostas
--    que disparam revisão da área de compliance, sem travar a homologação)
--    + RPC do relatório "não compliance" para a visão cliente.

-- ── 1a. Coleção de itens de aceite ────────────────────────────────────────
create table if not exists client_terms_items (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  title        text not null,
  kind         text not null check (kind in ('TEXT','DOCUMENT')),
  content      text,            -- kind TEXT: o texto integral
  storage_path text,            -- kind DOCUMENT: caminho no bucket client-terms
  file_name    text,
  version      int  not null default 1,   -- editar conteúdo => version+1
  required     boolean not null default true,
  active       boolean not null default true,
  sort         int  not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_terms_items_client on client_terms_items(client_id) where active;

create table if not exists client_term_acceptances (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references client_terms_items(id) on delete restrict,
  item_version  int  not null,
  client_id     uuid not null,
  supplier_id   uuid references suppliers(id) on delete set null,
  invitation_id uuid,
  accepted_name  text,
  accepted_email text,
  accepted_ip    text,
  accepted_at   timestamptz not null default now()
);
create index if not exists idx_term_acc_item     on client_term_acceptances(item_id);
create index if not exists idx_term_acc_supplier on client_term_acceptances(supplier_id);

-- RLS: leitura/gestão pelo CLIENTE dono e ADMIN; fornecedores interagem
-- apenas via Netlify functions (service role) durante o onboarding.
alter table client_terms_items enable row level security;
alter table client_term_acceptances enable row level security;

drop policy if exists terms_items_admin on client_terms_items;
create policy terms_items_admin on client_terms_items
  for all using ((select public.is_admin()));
drop policy if exists terms_items_client on client_terms_items;
create policy terms_items_client on client_terms_items
  for all using (client_id in (
    select ur.client_id from user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'CLIENT'));

drop policy if exists term_acc_admin on client_term_acceptances;
create policy term_acc_admin on client_term_acceptances
  for select using ((select public.is_admin()));
drop policy if exists term_acc_client on client_term_acceptances;
create policy term_acc_client on client_term_acceptances
  for select using (client_id in (
    select ur.client_id from user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'CLIENT'));

-- bucket privado p/ os documentos (upload/download via functions)
insert into storage.buckets (id, name, public)
values ('client-terms', 'client-terms', false)
on conflict (id) do nothing;

-- ── 2a. Parametrização de compliance por pergunta ─────────────────────────
-- Valores de resposta que disparam alerta (ex.: {'SIM'} ou {'NÃO'} para
-- boolean — comparado com Sim/Não —, ou opções específicas de um select).
alter table questionnaire_questions
  add column if not exists compliance_alert text[];

-- ── 2b. Relatório "não compliance" do cliente ─────────────────────────────
create or replace function public.client_compliance_report()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare cid uuid; r jsonb;
begin
  select ur.client_id into cid from user_roles ur
  where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null
  limit 1;
  if cid is null then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'supplier_id', t.supplier_id,
      'razao_social', t.razao_social,
      'cnpj', t.cnpj,
      'questionario', t.q_title,
      'pergunta', t.q_text,
      'resposta', t.resposta,
      'respondido_em', t.answered_at
    ) order by t.razao_social, t.q_text), '[]'::jsonb) into r
  from (
    select s.supplier_id, sup.razao_social, sup.cnpj,
           qn.title q_title, qq.text q_text, qa.answered_at,
           case when qq.type = 'boolean'
                then case when qa.answer_boolean then 'Sim' else 'Não' end
                else qa.answer_text end resposta
    from questionnaire_answers qa
    join questionnaire_questions qq on qq.id = qa.question_id
    join questionnaires qn on qn.id = qq.questionnaire_id and qn.client_id = cid
    join seals s on s.supplier_id = qa.supplier_id and s.client_id = cid
               and s.status in ('ACTIVE','PENDING')
    join suppliers sup on sup.id = qa.supplier_id
    where qq.compliance_alert is not null
      and (
        (qq.type = 'boolean' and
          ((qa.answer_boolean is true  and exists (select 1 from unnest(qq.compliance_alert) v where upper(v) in ('SIM','TRUE')))
        or (qa.answer_boolean is false and exists (select 1 from unnest(qq.compliance_alert) v where upper(v) in ('NÃO','NAO','FALSE')))))
        or
        (qq.type <> 'boolean' and qa.answer_text is not null
          and exists (select 1 from unnest(qq.compliance_alert) v
                      where position(lower(v) in lower(qa.answer_text)) > 0))
      )
  ) t;
  return r;
end $$;

revoke all on function public.client_compliance_report() from public;
grant execute on function public.client_compliance_report() to authenticated;
