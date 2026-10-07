# SPEC — Route B: AI pre-analysis of supplier-uploaded documents

Status: **implemented in staging** (28/09) — patch_109, `homolog-ai-review-background.js`,
backoffice components `RouteBReview` / `AiReviewPanel`. Enabled types: 40 Alvará and 19 LO
(passed the pilot); 39 Contrato Social is `route='B'` but stays `manual` until its rules are decided. Depends on Route A (SPEC_HOMOLOGACAO_AUTOMATICA.md,
patch_098). Staging first; nothing reaches production until the eval gate (§7) passes.

Principle (unchanged from Route A): **technology prepares, the team decides.** In this phase
the AI never approves or rejects on its own — it produces a suggestion, a checklist and
evidence for the analyst. Per-type autonomy is a later, measured decision (the trust dial, §8).

---

## 1. Where Route B sits in the process

```
Convite → Cadastro → Rota A (fontes oficiais) → aviso "o que falta" → fornecedor envia
       → Rota B: pré-análise por IA de cada arquivo enviado      ← THIS SPEC
       → analise_backoffice (equipe confirma A e B) → homologado / reprovado
```

A new intermediate stage `pre_analise` already exists in `seals.stage` (patch_098). It is
entered when every required document has been sent and at least one Route-B review is still
running; it ends when all reviews are done (→ `analise_backoffice`).

## 2. Scope — what the anchor client requires outside Route A (mapped 28/09)

39 required document types are outside Route A: 1 internal (Assertiva, already automatic),
1 filled by the client itself (internal technical report) and **37 uploaded by the supplier**.
Plus 7 mobility documents (per person / per post).

Grouped by what we can measure today:

| Group | Types | Historical decisions available (HOC, files still retrievable) | Phase-2 mode |
| --- | --- | --- | --- |
| **G1 — high volume** | 40 Alvará de Funcionamento · 39 Contrato Social · 19 Licença de Operação | thousands of approvals **and** rejections with a standard reason (see §6) | `assistido` after the eval gate |
| **G2 — some history** | 545 PCMSO · 546 PGR · 26 ANP · 67 ART · 157 PMOC · 239 FISPQ · 65 Conselho de classe | tens to a few hundred per type | `assistido` if the gate passes on the small sample, else extraction-only |
| **G3 — new types, no history** | 28 types created for the anchor client (calibration certificates, audiometry, sanitary licence of the lab, MTR/resíduos, experience, etc.) — **14 of them without a validation rule** | none | **extraction-only** (no verdict) until rules exist and ~30 labelled samples per type are collected |
| **Excluded from external AI** | 10016 ASO (health data) | — | manual, always (hard rule) |
| **Personal-data documents** | 10012 CNH · 10018 CNV · 10017 registro da arma · 10019 curso · 10036/10042/10043 (health professionals) | — | see assumption 4 |

## 3. What the AI returns (per file)

One structured result, validated against a JSON schema (structured outputs — no free-text
parsing like today's `ai-extract-document.js`):

```json
{
  "doc_type_match": true,                    // is this the document requested?
  "identity": { "cnpj_found": "…", "cnpj_matches": true, "razao_social_matches": true },
  "dates": { "issued_at": "2026-03-10", "valid_until": "2027-03-10", "expired": false },
  "legible": true,
  "checklist": [                              // one item per clause of the type's validation rule
    { "item": "Selo/registro da Junta Comercial", "ok": true,  "evidence": { "page": 1, "quote": "…" } },
    { "item": "Dados da diretoria",              "ok": false, "evidence": { "page": 3, "quote": "…" } }
  ],
  "verdict": "aprovar | reprovar | revisar",
  "reason_code": "DOC_INCOMPLETO",           // from rejection_reasons.code (90 codes)
  "reason_text": "Ausência dos dados da diretoria (pág. 3).",
  "confidence": 0.0
}
```

Stored in `ai_review_jobs.result` (not `documents.metadata`: the supplier can read its own
documents and must not see the AI verdict in this phase, and a re-upload overwrites metadata),
together with `model`, `prompt_version`, `cost_brl`, `finished_at`. A trigger records the
analyst's decision on the same row (`analyst_decision`) — agreement log, §7, view
`ai_review_agreement`.

Hard rules inside the prompt/checks: `doc_type_match=false` → never `aprovar`; identity
mismatch → `reprovar` with `DOC_DADOS_DIVERGENTES`; expired → `reprovar` `DOC_VENCIDO`;
unreadable → `revisar` (never `reprovar` for OCR failure alone).

## 4. Pipeline

1. Supplier uploads (existing flow) → document PENDING (unchanged).
2. Enqueue `ai_review_jobs` (new table, same pattern as `auto_collect_jobs`) for Route-B types
   whose `validation_mode <> 'manual'` and `route = 'B'`.
3. `homolog-ai-review-background.js` (same runner pattern as the Route-A collector, 15-min
   cron wrapper already in place for staging):
   - downloads the file (Storage or legacy S3 via the existing HOC file reader);
   - **pre-processing**: PDF text layer → mask CPF/RG patterns before sending; scanned pages go as
     images (masking impossible → see assumption 4);
   - one call to the model with the type's validation rule + the checklist template + the
     supplier's cadastral data (CNPJ, razão social, activity/category) as context;
   - **prompt caching** on the static part (instructions + rule), **Batch API** for non-urgent
     reviews (analysis SLA is days, not seconds);
   - stores `metadata.ia`; the stage trigger recalculates (`pre_analise` → `analise_backoffice`).
4. Official Anthropic SDK (`@anthropic-ai/sdk`), one adapter module (`lib/ai_review/model.js`)
   so a self-hosted model can replace it per type later (LGPD roadmap).

Models (initial, to be confirmed by the eval): `claude-sonnet-5` for the review;
`claude-haiku-4-5-20251001` for a cheap first pass (is this the right document? is it legible?)
that skips the full review when the answer is no.

## 5. Screens

- **Backoffice (queue + process screen, shared component like `RouteABadge`)**: "🤖 IA sugere
  aprovar/reprovar/revisar" + checklist with ✓/✗, each item clickable to the page/quote; on
  reject, the reason field is pre-filled with the AI's `reason_code`/`reason_text`. The analyst
  still clicks Approve/Reject.
- **Supplier**: no AI verdict shown in this phase (assumption 5). Status stays "Em análise".

## 6. Evaluation set (from HOC history — read-only)

HOC `historico_analise_documento` holds ~677k analyses (80,738 rejections), every rejection with
a standard reason (`resposta_analise`, 163 reasons). HOC keeps only the **current** file per
process document, so the clean labelled sample is:

- **negatives** — process documents whose current situation is still *rejected* (`NO`): the
  current file **is** the rejected one, with its reason;
- **positives** — current situation *approved* (`O`).

Available with file and reason (current state, 28/09):

| Type | Approved | Rejected | Rejected since 2024 |
| --- | --- | --- | --- |
| 40 Alvará | 10,237 | 8,815 | 2,284 |
| 39 Contrato Social | 19,463 | 4,221 | 1,130 |
| 19 Licença de Operação | 1,330 | 2,931 | 1,084 |
| 545 / 546 PCMSO / PGR | 180 / 202 | 99 / 84 | all |
| 26 ANP | 71 | 66 | 29 |

Top rejection reasons (they define the checklist): Alvará — "documento diferente do
solicitado", "vencido", "não possui abrangência da taxa de funcionamento", "CNPJ/razão
divergente"; Contrato Social — "ausência dos dados da diretoria", "documento diferente",
"ausência do selo da Junta", "ausência da constituição e alterações"; LO — "documento
diferente", "atividade licenciada divergente da categoria", "CNPJ/razão divergente", "vencido".

Sample per G1 type: 300 approved + 300 rejected (stratified by reason, since 2024), drawn
read-only from HOC; files read through the existing legacy-S3 reader; nothing written to HOC.

## 7. Eval gate (per type, before `assistido`)

| Metric | Target |
| --- | --- |
| **False approve** (AI says aprovar, team rejected) | **≤ 2 %** — the metric that matters |
| Recall on rejections (AI says reprovar or revisar when the team rejected) | ≥ 95 % |
| Agreement on the reason code (when both reject) | ≥ 70 % |
| `revisar` rate | ≤ 30 % (above that the AI is not saving time) |

Plus, in staging with real flow: analyst time per document with vs. without the suggestion.
After go-live, every analyst decision is logged against the AI verdict (agreement dashboard);
a type drops back to `manual` automatically if its false-approve rate exceeds the target over
the last 100 decisions.

## 8. Trust dial

`documents_catalog.validation_mode` (patch_098): `manual` → `assistido` (AI suggests, human
decides — this phase) → `automatico` (AI approves clean results alone). `automatico` is **out of
scope**: it requires ≥ 3 months in `assistido` with the targets met, and an explicit EQPI
decision per type recorded in `audit_log`.

## 9. Data model — `patch_109_rota_b.sql` (staging; as implemented: `ai_review_jobs` holds queue + result + analyst decision, `ai_review_agreement` view; checklist comes from the rule text — no `validation_checklist` column yet)

- `documents_catalog.route = 'B'` for G1/G2 types; `validation_rule` gains a structured
  checklist (`validation_checklist jsonb` — items derived from the rule text + top reasons) and
  `rule_version`.
- `ai_review_jobs` (supplier_id, seal_id, document_id, status queued/running/done/retry/skipped,
  attempts, model, cost_brl, created_at, finished_at).
- `ai_review_decisions` view: AI verdict × analyst decision per document (agreement metrics).
- `hoc_reason_map` (HOC `resposta_analise.id` → ELOS `rejection_reasons.code`) for the eval.

## 10. Cost (estimate — confirm in the eval)

Per file: 1–3 pages (alvará, LO) ≈ 5–8k input tokens; contrato social 8–15 pages ≈ 20–35k.
With `claude-sonnet-5` ($2 / $10 per MTok) + prompt caching + Batch (−50 %):
≈ R$ 0,05–0,20 per file, **≈ R$ 1–3 per process** at the anchor client's levels. The eval itself
(≈ 1,800 files for G1) ≈ R$ 150–300 one-off.

## 11. Implementation steps (staging)

1. Eval harness (script, local): draw the HOC sample read-only, fetch files, run the model,
   write metrics per type/reason — **before** any product code. Report back.
2. patch_106 + checklists for G1 (from rules + top HOC reasons) — reviewed by the team lead.
3. `lib/ai_review/` (SDK adapter, schema, masking, prompt per type) + background runner + queue.
4. Backoffice component (suggestion + checklist + evidence + pre-filled reason).
5. Stage `pre_analise` wiring + agreement logging.
6. Pilot in staging with real uploads; then G2; G3 stays extraction-only.

## 12. Assumptions to confirm

1. **No verdict without measurement**: a type only gets `aprovar/reprovar` suggestions after it
   passes the eval gate (§7); before that, extraction + checklist only.
2. **Eval uses HOC history read-only** (files via the legacy-S3 reader, decisions from
   `historico_analise_documento`/`processo_documento`); nothing is written to HOC.
3. **External model for PJ documents** (contrato social, alvará, licenças) is acceptable under
   the Anthropic API terms (no training on API data), with CPF/RG masked in the text layer.
4. **Personal-data documents** (CNH, CNV, weapon registration, course certificates, health
   professionals' documents): proposal — **excluded from the external model in this phase**
   (manual, like the ASO), to be revisited with the self-hosted model. Alternative: allow with
   masking of text-layer identifiers only.
5. **Supplier does not see the AI verdict** in this phase. Option to confirm: a preliminary
   notice for objective failures only (wrong document, expired, unreadable) so the supplier
   fixes it before the analyst — faster, but the AI then speaks to the supplier.
6. **G3 types need the client's validation rules** (14 missing) and ~30 labelled samples each
   before any verdict; until then extraction-only.
7. **Model choice** (Sonnet 5 + Haiku 4.5 pre-check) is decided by the eval, not up front.
8. **Batch API** is acceptable (reviews ready in minutes to hours, not seconds).
