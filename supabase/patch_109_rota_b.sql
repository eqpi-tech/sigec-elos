-- patch_109_rota_b.sql — Rota B: pré-análise por IA dos documentos enviados
-- pelo fornecedor (SPEC_ROTA_B.md). Aplicar PRIMEIRO no staging.
--
-- A IA sugere aprovar/reprovar/revisar com checklist e evidências; quem
-- decide é o analista (validation_mode 'assistido'). Nada aqui muda o status
-- de um documento.
--
-- 1. Tipos habilitados: só os que passaram no piloto (28/09) — 40 Alvará e
--    19 Licença de Operação. 39 Contrato Social fica marcado como Rota B, mas
--    em 'manual' até as regras pendentes serem decididas (piloto v2: 17% de
--    falsa aprovação).
-- 2. ai_review_jobs: fila + resultado + decisão do analista. O resultado fica
--    AQUI, não em documents.metadata: o fornecedor lê os próprios documentos
--    e não deve ver a sugestão da IA nesta fase (premissa 5 da spec); além
--    disso, um novo envio sobrescreve metadata.
-- 3. Gatilhos: novo arquivo de tipo habilitado → entra na fila; decisão do
--    analista → registrada contra a sugestão (concordância).
-- 4. Estágio 'pre_analise': documentos completos e pré-análise ainda rodando.

-- ── 1. tipos da Rota B ────────────────────────────────────────────────────
update documents_catalog set route = 'B', validation_mode = 'assistido' where id in (40, 19);
update documents_catalog set route = 'B' where id = 39 and validation_mode = 'manual';

-- ── 2. fila e resultado ───────────────────────────────────────────────────
create table if not exists ai_review_jobs (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references suppliers(id) on delete cascade,
  document_id      uuid not null references documents(id) on delete cascade,
  doc_type         text not null,
  storage_path     text not null,                 -- a versão do arquivo analisada
  status           text not null default 'queued'
                   check (status in ('queued','running','done','retry','skipped','error')),
  attempts         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  verdict          text check (verdict is null or verdict in ('aprovar','reprovar','revisar')),
  confidence       numeric(4,3),
  result           jsonb,                         -- saída estruturada completa (checklist, datas, motivo)
  input_mode       text,                          -- texto (PII mascarada) | pdf | imagem
  pages            int,
  model            text,
  prompt_version   text,
  cost_brl         numeric(10,4) not null default 0,
  requested_by     uuid,                          -- analista que pediu reanálise (null = automático)
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  -- decisão do analista sobre ESTA versão do arquivo (concordância)
  analyst_decision text,
  analyst_note     text,
  analyst_id       uuid,
  decided_at       timestamptz,
  unique (document_id, storage_path)
);
create index if not exists idx_ai_review_jobs_due
  on ai_review_jobs (next_attempt_at) where status in ('queued','retry');
create index if not exists idx_ai_review_jobs_supplier on ai_review_jobs (supplier_id);

-- só o backoffice: o fornecedor não vê a sugestão da IA nesta fase
alter table ai_review_jobs enable row level security;
drop policy if exists arj_admin on ai_review_jobs;
create policy arj_admin on ai_review_jobs for all
  using ((select is_admin())) with check ((select is_admin()));

-- ── 3a. novo arquivo de tipo habilitado → fila ───────────────────────────
create or replace function public.trg_ai_review_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'PENDING' or new.storage_path is null
     or coalesce(new.source, 'MANUAL') = 'AUTO'          -- Rota A: veio da fonte oficial
     or new.type !~ '^\d+$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
     and old.status is not distinct from 'PENDING' then
    return new;                                           -- nada de novo para analisar
  end if;
  if not exists (select 1 from documents_catalog dc
                 where dc.id = new.type::int and dc.route = 'B' and dc.validation_mode <> 'manual') then
    return new;
  end if;
  -- versão anterior ainda na fila: não vale mais a pena analisar
  update ai_review_jobs set status = 'skipped', last_error = 'arquivo substituído pelo fornecedor', finished_at = now()
   where document_id = new.id and status in ('queued','retry') and storage_path <> new.storage_path;
  insert into ai_review_jobs (supplier_id, document_id, doc_type, storage_path)
  values (new.supplier_id, new.id, new.type, new.storage_path)
  on conflict (document_id, storage_path) do nothing;
  return new;
end $$;

drop trigger if exists trg_ai_review_enqueue on documents;
create trigger trg_ai_review_enqueue after insert or update of storage_path, status on documents
  for each row execute function public.trg_ai_review_enqueue();

-- ── 3b. decisão do analista → registrada contra a sugestão ───────────────
create or replace function public.trg_ai_review_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'PENDING' and new.status in ('VALID','REJECTED','NOT_APPLICABLE') then
    update ai_review_jobs
       set analyst_decision = new.status, analyst_note = new.review_note,
           analyst_id = new.reviewed_by, decided_at = now()
     where document_id = new.id and storage_path is not distinct from new.storage_path
       and analyst_decision is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_ai_review_decision on documents;
create trigger trg_ai_review_decision after update of status on documents
  for each row execute function public.trg_ai_review_decision();

-- ── 4. estágio 'pre_analise' ──────────────────────────────────────────────
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
    -- tudo enviado; a IA ainda está pré-analisando algum arquivo do fornecedor
    if exists (select 1 from ai_review_jobs r
               where r.supplier_id = s.supplier_id and r.status in ('queued','running','retry')) then
      novo := 'pre_analise';
    else
      novo := 'analise_backoffice';
    end if;
  else
    novo := 'aguardando_fornecedor';
  end if;
  if novo is distinct from s.stage then
    update seals set stage = novo, stage_changed_at = now() where id = s.id;
  end if;
end $$;

create or replace function public.trg_stage_from_ai_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  for sid in select id from seals
             where supplier_id = new.supplier_id and status = 'PENDING' and hoc_process_id is null loop
    perform recompute_seal_stage(sid);
  end loop;
  return new;
end $$;

drop trigger if exists trg_seal_stage_ai_review on ai_review_jobs;
create trigger trg_seal_stage_ai_review after insert or update of status on ai_review_jobs
  for each row execute function public.trg_stage_from_ai_review();

-- ── 5. concordância IA × analista (evidência da Rota B) ──────────────────
create or replace view ai_review_agreement with (security_invoker = true) as
select j.doc_type,
       count(*) filter (where j.status = 'done')                                   as analisados,
       count(*) filter (where j.analyst_decision is not null and j.status = 'done') as decididos,
       count(*) filter (where j.verdict = 'aprovar'  and j.analyst_decision = 'VALID')    as aprovar_ok,
       count(*) filter (where j.verdict = 'aprovar'  and j.analyst_decision = 'REJECTED') as falsa_aprovacao,
       count(*) filter (where j.verdict = 'reprovar' and j.analyst_decision = 'REJECTED') as reprovar_ok,
       count(*) filter (where j.verdict = 'reprovar' and j.analyst_decision = 'VALID')    as falsa_reprovacao,
       count(*) filter (where j.verdict = 'revisar'  and j.analyst_decision is not null)  as revisar,
       round(sum(j.cost_brl), 2)                                                   as custo_brl
from ai_review_jobs j
group by j.doc_type;
