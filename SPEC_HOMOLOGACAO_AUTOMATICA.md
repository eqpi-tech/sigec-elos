# SPEC — Homologação automática (Rota A → Rota B)

> Status: **DRAFT — aguardando confirmação das premissas (§9)**. Branch: `staging`.
> Base: `docs/ESTUDO_HOMOLOGACAO_AUTOMATICA.md`. Code/identifiers in English,
> UI copy in pt-BR.

**Guiding principle (decided 28/09):** technology prepares, the team decides.
During the trust period every document — automatically collected or AI-analysed
— still gets a human confirmation. Automatic approval is switched on **per
document type**, only after it proves itself.

## 1. Target process

```
Convite → Cadastro → Coleta automática (Rota A) → Aviso do que falta
       → Fornecedor complementa → Pré-análise por IA (Rota B)
       → Backoffice valida tudo (A e B) → Homologado | Reprovado
```

Stored as a new `seals.stage` (the 4-value `seals.status` stays untouched — many
screens and RPCs depend on it):

| `stage` | Meaning | Entered when | Leaves when |
| --- | --- | --- | --- |
| `coleta_automatica` | Querying official sources | signup finishes (process created) | all Route-A jobs finished (ok or fallback) |
| `aguardando_fornecedor` | Supplier owes documents/answers | collection done and something is missing | everything required was sent |
| `pre_analise` | AI pre-analysing uploads (Phase 2) | all sent and any Route-B doc pending | AI verdicts written (Phase 1: skipped) |
| `analise_backoffice` | Team validating everything | nothing owed, pre-analysis done | final decision |
| *(final)* | `status` ACTIVE (homologado) / SUSPENDED (reprovado) | as today | — |

Transitions are written server-side only (collector, upload hook, AI worker,
approve function). A document rejected in `analise_backoffice` sends the process
back to `aguardando_fornecedor` (the reopen trigger from patch_096 already does
the equivalent for suspended processes).

## 2. What exists today (mapped 28/09)

- **Auto-approval without a human or evidence already happens** for three types:
  37 Cartão CNPJ and 62 Simples (created **in the supplier's browser** by
  `Documents.jsx → autoValidateDocs`, from BrasilAPI data, status VALID) and
  7 FGTS (`collect-document` → `fgts-crf-lookup`, a scraper of the Caixa site,
  status VALID, no file stored). `check-expiring-docs` renews them.
- **BC Report connectors** (`netlify/functions/lib/connectors/*`) already query
  Infosimples and return structured, deterministic fields — e.g. CNDT:
  `consta`, `validade_data`, `certidao_codigo`, `site_receipt`; PGFN: `tipo`,
  `situacao`, `validade_data`; FGTS: `situacao`, `validade_fim_data`; Sefaz:
  `certidao_negativa`, `validade_data`; Sintegra: `situacao_cadastral`. Every one
  returns `site_receipt` — the official receipt, usable as the document file.
- Measured cost R$ 0,24–0,40 per call, billed only when the source returns data.
- Constraints: `documents.source ∈ {MANUAL, AUTO}`, `documents.status` has 7
  values, `seals.status ∈ {ACTIVE, PENDING, SUSPENDED, EXPIRED}` — reuse, don't
  extend, where possible (pitfall §7.15).

## 3. Route A — scope of Phase 1

Required-document types that have a working connector today:

| Doc | Name | Connector | Approve when (client rule) | `expires_at` |
| --- | --- | --- | --- | --- |
| 37 | Cartão CNPJ | `cartao_cnpj` | situação ATIVA | analysis + 1 year |
| 10001 | Sintegra | `sintegra` | habilitada; isenta/não inscrita + só serviços | analysis + 1 year |
| 42 | CND Federal | `pgfn_cnd` | negativa ou positiva com efeito de negativa | `validade_data` |
| 7 | FGTS (CRF) | `fgts_crf` | regular | `validade_fim_data` |
| 8 | CNDT | `cndt` | negativa ou positiva com efeito de negativa | `validade_data` |
| 16 | CND Estadual | `sefaz_cnd` | negativa ou positiva c/ efeito (**A\*** — UF coverage) | `validade_data` |
| 6 / 10040 | CND Municipal | `pref_cnd` | negativa (**A\*** — municipality coverage) | `validade_data` — **no client rule registered; confirm** |
| 10038 | Dívida ativa federal | `pgfn_devedores` | não consta | **no client rule registered; confirm** |
| 10002 | Lista suja | `trabalho_escravo` (local, free) | não inscrito | analysis + 6 months |
| 150 | Falência | `falencia_rj` | negativa (**A\*** — source unstable) | **client rule ambiguous ("pelo menos um mês anterior"); confirm** |

Phase 1b (new connectors, same mechanism): 18 IBAMA CTF
(`ibama-certificado-regularidade`), 166 PF segurança privada
(`pf-regularidade-empresa`), CFM cadastro (cross-check for doctors).

### 3.1 Mechanism

1. `create-supplier` (end of signup) enqueues one `auto_collect_jobs` row per
   Route-A type in the process's required set, sets `stage =
   coleta_automatica` and fires `homolog-collect-background`.
2. The collector (background function, 15-min budget) runs each job through the
   registry `lib/route_a.js`: connector `fetch/parse` → client rule →
   document row:
   - `source = 'AUTO'`, `status = 'PENDING'` (**never VALID in Phase 1**),
     `expires_at` from the source, `metadata.route = 'A'`,
     `metadata.consulta = { fonte, resultado, codigo, emissao, validade,
     sugestao: 'aprovar'|'reprovar', motivo }`;
   - the `site_receipt` is downloaded (sha256) into the `documents` bucket as the
     document file — the analyst opens the official receipt, not an upload.
3. Source unavailable → retry with 15-min backoff, up to 3 attempts; after that
   the job becomes `fallback`: the document stays MISSING and the supplier is
   asked to upload it (normal Route-B path).
4. Positive certificate (apontamento) → still PENDING, `sugestao: 'reprovar'`
   with the reason. **The system never rejects on its own in Phase 1.**
5. When the last job finishes: stage → `aguardando_fornecedor` (or
   `analise_backoffice` if nothing is owed) and the supplier gets the e-mail
   "o que já conseguimos e o que falta" immediately (then the 3-day reminder
   cadence as today).
6. Renewals: the daily job re-queues Route-A documents close to expiry (replaces
   the Caixa scraper path for FGTS).

**Scope guard:** only ELOS-native processes (`seals.hoc_process_id IS NULL`).
HOC-owned processes are never touched (CLAUDE.md rule §7.2).

## 4. Screens

**Supplier (`Documents.jsx`)**
- Route-A documents show *"🔎 Consultado automaticamente na fonte oficial"* and
  no upload button; while `stage = coleta_automatica`: *"Consultando as fontes
  oficiais — isso leva alguns minutos."*
- Fallback: upload button appears with *"A fonte oficial não respondeu. Envie o
  documento para seguirmos."*
- The browser-side `autoValidateDocs` for 37/62 is removed (documents are no
  longer created from the browser).

**Backoffice (queue and process screen — same component, no divergence)**
- Route-A rows carry a badge *"Fonte oficial · Nada consta · válida até
  dd/mm/aaaa"* (or *"Fonte apontou pendência: <motivo>"* in orange) and the
  approve modal opens with the validity pre-filled from the source.
- Process screen shows the stage timeline.

## 5. Per-type mode (the trust dial)

`documents_catalog.validation_mode`: `manual` → `assistido` → `automatico`.
Route-A types start at `assistido` (collected, human confirms). Setting a type
to `automatico` makes the collector approve clean results by itself — a
per-type EQPI decision, logged in `audit_log`. Default for everything else:
`manual`.

## 6. Route B — Phase 2 (outline; own spec after Phase 1)

Upload → AI pre-analysis with the client rule (verdict aprovar/reprovar/revisar,
extracted fields, evidence page) → stored in `metadata.ia` → analyst confirms in
`analise_backoffice`. Prerequisites: eval set from historical decisions
(HOC + ELOS), CPF/RG masking before sending, no health data (ASO) to external
APIs, official Anthropic SDK + structured outputs + Batch API, one model adapter
so a self-hosted model can replace it per type.

## 7. Data model — `supabase/patch_098_homologacao_automatica.sql`

```sql
alter table seals add column stage text
  check (stage in ('coleta_automatica','aguardando_fornecedor','pre_analise','analise_backoffice')),
  add column stage_changed_at timestamptz;

alter table documents_catalog
  add column route text check (route in ('A','A*','B','C')),
  add column validation_mode text not null default 'manual'
    check (validation_mode in ('manual','assistido','automatico'));

create table auto_collect_jobs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  seal_id uuid not null references seals(id) on delete cascade,
  doc_type text not null,
  status text not null default 'queued'
    check (status in ('queued','running','done','retry','fallback')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  cost_brl numeric(10,2) default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (seal_id, doc_type)
);
-- RLS: admin all; supplier reads own (to show "consultando…")
```

## 8. Implementation steps (staging)

1. patch_098 + route/mode seed for the Phase-1 types (`assistido`).
2. `lib/route_a.js` registry (doc type → connector + rule → suggestion/validity).
3. `homolog-collect-background.js` (job runner) + hook in `create-supplier`.
4. Supplier screen states; remove browser-side creation of 37/62.
5. Backoffice badge + pre-filled approval (shared component).
6. "O que falta" e-mail at the end of collection.
7. Stage transitions in upload/approve paths.
8. Test in staging with three real CNPJs from the client list; measure
   hit rate per source, cost per process and analyst time per document.
9. Then Phase 1b connectors, then Route B spec.

## 9. Assumptions to confirm

1. **Route-A documents enter PENDING** and the analyst confirms with one click;
   nothing is auto-approved in Phase 1.
2. **The three types auto-approved today (37, 62, 7) move to the same model**
   (PENDING + official receipt + human confirmation) during the trust period.
   Alternative: keep 37 and 62 automatic (low risk, informational).
3. **Positive certificate never auto-rejects** — it becomes a suggestion to
   reject; the analyst decides.
4. **Unavailable source**: 3 attempts, 15 min apart, then fallback to supplier
   upload with notice.
5. **Only ELOS-native processes**; HOC processes untouched.
6. **The supplier does not upload Route-A documents** (upload only on fallback).
7. **Staging uses the real Infosimples token** unless Infosimples offers a test
   environment — ~R$ 0,30 per call, ~R$ 3 per test supplier.
8. **Stage as a new column**, status unchanged.
9. **Phase 1 = the 11 types with ready connectors**; IBAMA CTF, PF segurança
   privada and CFM in Phase 1b.
10. **Validity for 6, 10040, 10038 and 150** must come from the client before
   these types are collected: three have no rule registered and falência's rule
   is ambiguous. Until then they are collected but the analyst sets the date.
