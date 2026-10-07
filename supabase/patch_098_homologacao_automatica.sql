-- patch_098_homologacao_automatica.sql — Homologação automática, fase 1
-- (Rota A). Spec: SPEC_HOMOLOGACAO_AUTOMATICA.md. Aplicar PRIMEIRO no staging.
--
-- Princípio (28/09): a tecnologia prepara, a equipe decide. Nada aqui aprova
-- ou reprova sozinho — os documentos coletados entram PENDING.
--
-- 1. seals.stage: estágio do processo, SEPARADO do status (ACTIVE/PENDING/
--    SUSPENDED/EXPIRED continua igual — dezenas de telas dependem dele).
-- 2. documents_catalog.route / validation_mode: a "chave de confiança" por
--    tipo de documento (manual → assistido → automático).
-- 3. auto_collect_jobs: fila da coleta nas fontes oficiais (com novas
--    tentativas e fallback para upload).
-- 4. recompute_seal_stage(): o estágio é CALCULADO no banco, disparado por
--    gatilhos — nunca fica inconsistente, seja qual for o caminho que alterou
--    o processo. Só processos do ELOS (hoc_process_id IS NULL).

-- ── 1. estágio do processo ────────────────────────────────────────────────
alter table seals add column if not exists stage text,
                  add column if not exists stage_changed_at timestamptz;
alter table seals drop constraint if exists seals_stage_check;
alter table seals add constraint seals_stage_check check (stage is null or stage in
  ('coleta_automatica','aguardando_fornecedor','pre_analise','analise_backoffice'));

-- ── 2. chave de confiança por tipo de documento ──────────────────────────
alter table documents_catalog add column if not exists route text,
                              add column if not exists validation_mode text not null default 'manual';
alter table documents_catalog drop constraint if exists documents_catalog_route_check;
alter table documents_catalog add constraint documents_catalog_route_check
  check (route is null or route in ('A','A*','B','C'));
alter table documents_catalog drop constraint if exists documents_catalog_validation_mode_check;
alter table documents_catalog add constraint documents_catalog_validation_mode_check
  check (validation_mode in ('manual','assistido','automatico'));

-- tipos da fase 1 (conector pronto) começam em 'assistido': coletados, humano confirma
update documents_catalog set route = 'A',  validation_mode = 'assistido' where id in (37, 62, 10001, 42, 7, 8, 10038, 10002);
update documents_catalog set route = 'A*', validation_mode = 'assistido' where id in (16, 6, 10040, 150);

-- ── 3. fila da coleta ─────────────────────────────────────────────────────
create table if not exists auto_collect_jobs (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references suppliers(id) on delete cascade,
  seal_id         uuid not null references seals(id) on delete cascade,
  doc_type        text not null,
  status          text not null default 'queued'
                  check (status in ('queued','running','done','retry','fallback')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  cost_brl        numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (seal_id, doc_type)
);
create index if not exists idx_auto_collect_jobs_due
  on auto_collect_jobs (next_attempt_at) where status in ('queued','retry');

alter table auto_collect_jobs enable row level security;
drop policy if exists acj_admin on auto_collect_jobs;
create policy acj_admin on auto_collect_jobs for all
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists acj_supplier_read on auto_collect_jobs;
create policy acj_supplier_read on auto_collect_jobs for select
  using (supplier_id in (select my_supplier_ids()));

-- ── 4. prontidão POR PROCESSO e cálculo do estágio ───────────────────────
-- supplier_ready_for_analysis() olha o fornecedor inteiro e devolve true se
-- houver QUALQUER selo ativo — erraria para quem já é homologado e abre um
-- processo novo. Esta versão avalia um selo só, conta REJEITADO/VENCIDO como
-- pendência do fornecedor e inclui a mobilidade (PF faltante nunca parece pronto).
create or replace function public.seal_ready_for_analysis(p_seal uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare s record; req_ids int[]; faltam int; q_faltam int; cnpj_forn text;
begin
  select * into s from seals where id = p_seal;
  if not found then return false; end if;

  -- exigência: categorias do fornecedor dentro do cliente; fallback: fluxo; ELOS Verificado
  select array_agg(distinct cd.document_id) into req_ids
  from supplier_categories sc
  join categories c on c.id = sc.category_id and c.client_id = s.client_id
  join category_documents cd on cd.category_id = sc.category_id and cd.required
  where sc.supplier_id = s.supplier_id;
  if req_ids is null and s.flow_id is not null then
    select array_agg(distinct cd.document_id) into req_ids
    from client_flow_categories fc
    join category_documents cd on cd.category_id = fc.category_id and cd.required
    where fc.flow_id = s.flow_id;
  end if;
  if s.client_id is null or req_ids is null then req_ids := array[37,61,62,7,42,8]; end if;

  -- documentos do fornecedor que ainda faltam (sem linha, ou não enviado/reprovado/vencido)
  select count(*) into faltam
  from unnest(req_ids) rid
  join documents_catalog dc on dc.id = rid
  where coalesce(dc.responsibility,'fornecedor') = 'fornecedor'
    and not exists (select 1 from documents d
                    where d.supplier_id = s.supplier_id and d.type = rid::text
                      and d.status in ('PENDING','VALID','NOT_APPLICABLE','EXPIRING'));
  if faltam > 0 then return false; end if;

  -- questionário do cliente
  if s.client_id is not null then
    select count(*) into q_faltam
    from questionnaire_questions qq
    join questionnaires qn on qn.id = qq.questionnaire_id
    where qn.client_id = s.client_id and qn.active is not false and qq.required
      and not exists (select 1 from questionnaire_answers qa
                      where qa.question_id = qq.id and qa.supplier_id = s.supplier_id);
    if q_faltam > 0 then return false; end if;
  end if;

  -- mobilidade: pessoas cadastradas e documentos de PF enviados, por posto
  select cnpj into cnpj_forn from suppliers where id = s.supplier_id;
  if exists (
    select 1 from mobility_posts p
    where p.active and p.client_id = s.client_id and p.supplier_cnpj = cnpj_forn
      and p.qty_people > (select count(*) from mobility_people mp where mp.post_id = p.id and mp.active)
  ) then return false; end if;
  if exists (
    select 1
    from mobility_posts p
    join category_mobility_documents m on m.category_id = p.category_id and m.required
    left join mobility_people mp on m.escopo = 'pessoa' and mp.post_id = p.id and mp.active
    where p.active and p.client_id = s.client_id and p.supplier_cnpj = cnpj_forn
      and (m.escopo = 'posto' and (m.document_id <> 10017 or p.armado)
           or m.escopo = 'pessoa' and mp.id is not null)
      and not exists (select 1 from documents d
                      where d.supplier_id = s.supplier_id
                        and d.type = case when m.escopo = 'posto'
                                          then 'mob:' || m.document_id || ':s:' || p.id
                                          else 'mob:' || m.document_id || ':p:' || mp.id end
                        and d.status in ('PENDING','VALID','NOT_APPLICABLE','EXPIRING'))
  ) then return false; end if;

  return true;
end $$;

create or replace function public.recompute_seal_stage(p_seal uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; novo text;
begin
  select id, supplier_id, status, hoc_process_id, stage into s from seals where id = p_seal;
  if not found or s.hoc_process_id is not null then return; end if;   -- HOC manda no processo dele
  if s.status <> 'PENDING' then
    novo := null;                                                        -- homologado/reprovado/vencido
  elsif exists (select 1 from auto_collect_jobs j
                where j.seal_id = s.id and j.status in ('queued','running','retry')) then
    novo := 'coleta_automatica';
  elsif seal_ready_for_analysis(s.id) then
    novo := 'analise_backoffice';
  else
    novo := 'aguardando_fornecedor';
  end if;
  if novo is distinct from s.stage then
    update seals set stage = novo, stage_changed_at = now() where id = s.id;
  end if;
end $$;

-- gatilhos: qualquer mudança relevante recalcula o estágio dos processos abertos
create or replace function public.trg_stage_from_supplier()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid; forn uuid;
begin
  forn := case tg_table_name when 'documents'             then new.supplier_id
                             when 'mobility_people'       then new.supplier_id
                             when 'questionnaire_answers' then new.supplier_id end;
  for sid in select id from seals
             where supplier_id = forn and status = 'PENDING' and hoc_process_id is null loop
    perform recompute_seal_stage(sid);
  end loop;
  return new;
end $$;

create or replace function public.trg_stage_from_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform recompute_seal_stage(new.seal_id); return new; end $$;

create or replace function public.trg_stage_from_seal()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform recompute_seal_stage(new.id); return new; end $$;

drop trigger if exists trg_seal_stage_documents on documents;
create trigger trg_seal_stage_documents after insert or update of status on documents
  for each row execute function public.trg_stage_from_supplier();

drop trigger if exists trg_seal_stage_mobility_people on mobility_people;
create trigger trg_seal_stage_mobility_people after insert or update of active on mobility_people
  for each row execute function public.trg_stage_from_supplier();

-- o questionário do cliente também é parte do que o fornecedor deve
drop trigger if exists trg_seal_stage_questionnaire on questionnaire_answers;
create trigger trg_seal_stage_questionnaire after insert on questionnaire_answers
  for each row execute function public.trg_stage_from_supplier();

drop trigger if exists trg_seal_stage_jobs on auto_collect_jobs;
create trigger trg_seal_stage_jobs after insert or update of status on auto_collect_jobs
  for each row execute function public.trg_stage_from_job();

-- só UPDATE OF status: a própria atualização de stage não redispara (sem recursão)
drop trigger if exists trg_seal_stage_status on seals;
create trigger trg_seal_stage_status after insert or update of status on seals
  for each row execute function public.trg_stage_from_seal();
