-- patch_079_bc_report.sql — BC Report Automatizado, Estágio 1 (18/09)
-- Fonte: docs/BC_REPORT_AUTO_HANDOFF.md §5 (schema) + §7 (catálogo) + L5 (preços)

-- fila / cabeçalho do relatório
create table if not exists report_requests (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  supplier_id uuid references suppliers(id),
  tipo text not null check (tipo in ('light','full')),
  status text not null default 'pending'
    check (status in ('pending','collecting','rendering','done','done_partial','failed','canceled')),
  requested_by uuid,
  requested_channel text,
  force_refresh_bureau boolean default false,
  score_eqpi int,
  risk_band text,
  parecer text,
  pdf_path text,
  cost_brl numeric(10,2) default 0,
  price_brl numeric(10,2),
  error text,
  created_at timestamptz default now(),
  finished_at timestamptz
);
create index if not exists idx_report_requests_cnpj on report_requests (cnpj, created_at desc);
create index if not exists idx_report_requests_status on report_requests (status) where status in ('pending','collecting','rendering');

-- resultado por fonte (cache + auditoria)
create table if not exists source_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references report_requests(id),
  cnpj text not null,
  connector text not null,
  route text not null check (route in ('free','infosimples','assertiva','local_db')),
  status text not null check (status in ('ok','not_found','failed_soft','failed')),
  parsed jsonb,
  raw jsonb,
  result_flag text,
  cost_brl numeric(10,4) default 0,
  valid_until timestamptz,
  protocol text,
  reused_from uuid,                 -- cache: aponta o source_result original (custo 0)
  created_at timestamptz default now()
);
create index if not exists idx_source_results_cache on source_results (cnpj, connector, created_at desc);

-- evidências persistidas (receipts Infosimples expiram — baixar na hora, L6)
create table if not exists report_evidences (
  id uuid primary key default gen_random_uuid(),
  source_result_id uuid references source_results(id),
  kind text,
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz default now()
);

-- config sem redeploy: preços de venda + catálogo de conectores + pesos do score
create table if not exists bc_config (
  key text primary key,
  value jsonb
);

-- RLS: acesso só via Netlify Functions (service_role); ADMIN lê para as telas
alter table report_requests enable row level security;
alter table source_results  enable row level security;
alter table report_evidences enable row level security;
alter table bc_config        enable row level security;
drop policy if exists rr_admin on report_requests;
create policy rr_admin on report_requests for select using ((select public.is_admin()));
drop policy if exists sr_admin on source_results;
create policy sr_admin on source_results for select using ((select public.is_admin()));
drop policy if exists re_admin on report_evidences;
create policy re_admin on report_evidences for select using ((select public.is_admin()));
drop policy if exists bc_admin on bc_config;
create policy bc_admin on bc_config for select using ((select public.is_admin()));

-- bucket privado dos PDFs/evidências
insert into storage.buckets (id, name, public)
values ('bc-reports', 'bc-reports', false)
on conflict (id) do nothing;

-- ── Seeds ─────────────────────────────────────────────────────────────────
-- Preços de venda (L5 — tabela aprovada p/ CEO)
insert into bc_config (key, value) values
  ('price_light',     '{"brl": 59}'),
  ('price_full',      '{"brl": 299}'),
  ('price_full_conv', '{"brl": 249, "regra": "Full ate 30d apos Light"}'),
  ('price_monitor',   '{"brl": 29, "ciclo": "mensal"}')
on conflict (key) do nothing;

-- Catálogo de conectores v1 (§7): ttl_days, route, custos, escopo Light/Full
insert into bc_config (key, value) values
  -- rota A — grátis
  ('connector:cnpj_base',        '{"route":"free","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"Base CNPJ (Receita)"}'),
  ('connector:ceis',             '{"route":"free","ttl_days":1,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"CEIS — Empresas Inidôneas e Suspensas"}'),
  ('connector:cnep',             '{"route":"free","ttl_days":1,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"CNEP — Empresas Punidas"}'),
  ('connector:cepim',            '{"route":"free","ttl_days":1,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"CEPIM — Entidades Impedidas"}'),
  ('connector:ceaf',             '{"route":"free","ttl_days":1,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"CEAF — Expulsões da Adm. Federal"}'),
  ('connector:leniencia',        '{"route":"free","ttl_days":1,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"Acordos de Leniência"}'),
  ('connector:pep',              '{"route":"local_db","ttl_days":30,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"PEP — Pessoas Politicamente Expostas"}'),
  ('connector:trabalho_escravo', '{"route":"local_db","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"Lista Suja — Trabalho Escravo (MTE)"}'),
  ('connector:tse_candidaturas', '{"route":"local_db","ttl_days":9999,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"TSE — Candidaturas de sócios"}'),
  ('connector:ofac',             '{"route":"local_db","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"OFAC — SDN List (EUA)"}'),
  ('connector:onu',              '{"route":"local_db","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"ONU — Consolidated Sanctions"}'),
  ('connector:icij',             '{"route":"local_db","ttl_days":9999,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"ICIJ — Offshore Leaks"}'),
  ('connector:datajud',          '{"route":"free","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"DataJud (CNJ) — cobertura parcial"}'),
  ('connector:renuncias',        '{"route":"free","ttl_days":7,"cost_base":0,"cost_extra":0,"enabled":true,"in_light":false,"in_full":true,"nome":"Renúncias — relação c/ Gov. Federal"}'),
  -- rota B — Infosimples
  ('connector:pgfn_cnd',         '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.10,"enabled":true,"in_light":true,"in_full":true,"nome":"CND Federal (PGFN/RFB)","api":"receita-federal/pgfn"}'),
  ('connector:fgts_crf',         '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.06,"enabled":true,"in_light":true,"in_full":true,"nome":"CRF FGTS (Caixa)","api":"caixa/regularidade"}'),
  ('connector:cndt',             '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.08,"enabled":true,"in_light":true,"in_full":true,"nome":"CNDT (TST)","api":"mte/certidao-debitos"}'),
  ('connector:cartao_cnpj',      '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.04,"enabled":true,"in_light":true,"in_full":true,"nome":"Comprovante CNPJ + QSA","api":"receita-federal/cnpj"}'),
  ('connector:sefaz_cnd',        '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.20,"enabled":true,"in_light":false,"in_full":true,"nome":"CND Estadual (Sefaz UF sede)","api":"sefaz/certidao-debitos"}'),
  ('connector:pref_cnd',         '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.20,"enabled":true,"in_light":false,"in_full":true,"nome":"CND Municipal (prefeitura sede)","api":"pref/cnd"}'),
  ('connector:cgu_correcional',  '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.04,"enabled":true,"in_light":false,"in_full":true,"nome":"CGU — Certidão Correcional (CNC tipo 1)","api":"cgu/cnc-tipo1"}'),
  ('connector:cnj_improbidade',  '{"route":"infosimples","ttl_days":7,"cost_base":0.20,"cost_extra":0.04,"enabled":true,"in_light":false,"in_full":true,"nome":"CNJ — Improbidade Administrativa","api":"cnj/improbidade"}'),
  ('connector:mpt_cnf',          '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.04,"enabled":true,"in_light":false,"in_full":true,"nome":"MPT — Certidão de Feitos","api":"mpt/cnf-unificada"}'),
  ('connector:mpf_cn',           '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.06,"enabled":true,"in_light":false,"in_full":true,"nome":"MPF — Certidão Negativa","api":"mpf/certidao-negativa"}'),
  ('connector:ibama',            '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.06,"enabled":true,"in_light":false,"in_full":true,"nome":"IBAMA — Embargos + Regularidade","api":"ibama/certidao-embargos"}'),
  ('connector:simples',          '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.08,"enabled":true,"in_light":false,"in_full":true,"nome":"Simples Nacional","api":"receita-federal/simples"}'),
  ('connector:sintegra',         '{"route":"infosimples","ttl_days":30,"cost_base":0.20,"cost_extra":0.20,"enabled":true,"in_light":false,"in_full":true,"nome":"Sintegra (UF sede)","api":"sintegra"}'),
  ('connector:midia_negativa',   '{"route":"infosimples","ttl_days":7,"cost_base":0.20,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"Mídia negativa (busca padrão EQP)","api":"buscador/google"}'),
  -- rota C — Assertiva (L1/L2)
  ('connector:assertiva_pj',     '{"route":"assertiva","ttl_days":30,"cost_base":9.576,"cost_extra":0,"enabled":true,"in_light":true,"in_full":true,"nome":"Assertiva — Análise Restritiva PJ"}')
on conflict (key) do nothing;

-- Pesos do Score EQPI (§8) — ajustáveis sem deploy
insert into bc_config (key, value) values ('score_weights', '{
  "lista_critica": 60, "cnd_federal_positiva": 25, "cnd_federal_pen": 8,
  "crf_irregular": 15, "cndt_positiva": 15, "situacao_nao_ativa": 40,
  "protesto_baixo": 5, "protesto_alto": 20, "assertiva_ef": 20, "assertiva_d": 10,
  "acoes_1a3": 5, "acoes_muitas": 15, "ccf": 10, "pendencias_min": 5, "pendencias_max": 15,
  "empresa_2anos": 5, "empresa_1ano": 10, "pep": 10, "midia_negativa": 15,
  "faixas": {"baixo": 80, "medio": 60, "alto": 40}
}') on conflict (key) do nothing;
