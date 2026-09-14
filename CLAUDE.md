# CLAUDE.md — SIGEC-ELOS

Knowledge base for working on this repository. Written for a strong developer with
zero project context. Keep it updated when architecture or conventions change.

> **Sanitization rule for this file and everything generated from it:** no credentials,
> no infrastructure identifiers, no real client names (use `CLIENT_A`-style labels).
> Client-name mappings, credentials and environment details are distributed by the
> team lead through a secure channel — see "Where sensitive information lives".

## 1. System purpose

SIGEC-ELOS is a SaaS platform for **homologação de fornecedores** (supplier
qualification/vetting: a contracting company only buys from suppliers whose legal,
fiscal and technical documents were analyzed and approved). It is built by EQPI Tech
to replace the legacy in-house system referred to as **HOC** (Java + MySQL), which is
still operated by the analysis team in parallel — ELOS mirrors it daily via a one-way
sync. Users: **fornecedores** (suppliers, who upload documents and buy plans),
**clientes** (contracting companies, who invite and track suppliers), **compradores**
(buyers using the public marketplace) and the EQPI **backoffice** (ADMIN analysts who
review documents and manage everything).

## 2. Architecture overview

```
 Browser (React SPA, Vite)  ──────────────►  Netlify CDN (static dist/)
      │  supabase-js (anon key + RLS)             │
      ▼                                           ▼
 Supabase ◄──────────────────────────  Netlify Functions (Node 20, CommonJS,
 (Postgres + Auth + Storage + RLS)     service_role — all privileged writes,
      ▲                                masking, e-mail, Stripe, external APIs)
      │ nightly one-way sync                      │
 HOC MySQL (legacy, READ-ONLY) ── files stay in legacy S3 (get-hoc-file.js)
      ▲
 GitHub Actions cron: sync-hoc-elos.yml · daily-notifications.yml · db-backup.yml
```

- **Frontend** (`src/`): SPA with role-based route trees in `src/App.jsx`
  (`/fornecedor/*`, `/cliente/*`, `/comprador/*`, `/backoffice/*`, plus public
  `/portal/:slug` white-label landing pages, `/verificar` certificate check, `/demo`).
  All data access goes through the single service layer `src/services/api.js`
  (~1.6k lines; its contract descends from the old `mockApi.js`).
- **Server side** (`netlify/functions/`, 39 functions): `exports.handler` CommonJS,
  bundled with esbuild. Anything that needs `service_role`, secrets, e-mail (Resend),
  Stripe, CNPJ lookups (BrasilAPI et al.), credit-bureau reports, NF-e emission or
  legacy S3 file streaming lives here — **never in the browser**.
- **Database** (`supabase/`): `schema.sql` + sequential `patch_NNN_description.sql`
  files (currently up to 070). Patches are applied manually in the Supabase SQL
  editor and committed here — this folder IS the schema history.
- **Legacy sync** (`scripts/sync_hoc_daily.py`): incremental watermark sync HOC→ELOS,
  documented in `docs/SYNC_HOC_ELOS.md`. Read that doc before touching anything
  with an `hoc_id`.

## 3. Technology stack (exact)

| Layer | Tech |
|---|---|
| Frontend | React 18.3, react-router-dom 6.26, Vite 7, lucide-react; xlsx (Excel export), pdf-lib + jszip (certificates), @supabase/supabase-js 2.45 |
| Server | Netlify Functions, Node 20, esbuild bundler; stripe 22; Resend (HTTP API) |
| Database | Supabase Postgres (RLS everywhere), Auth, Storage; pg_trgm, generated columns |
| Ops scripts | Python 3.12 (`scripts/`): pg8000 (Postgres), mysql-connector (HOC), supabase-py |
| Cron | GitHub Actions (3 workflows in `.github/workflows/`) |
| Analytics | GA4 snippet in `index.html` |

No test framework is configured. Verification is `npm run build`, `node --check`
on functions, and manual testing (see §6).

## 4. Code conventions

- **Language split:** identifiers, commits body/code and SQL in English or pt-BR
  mixed (follow the file you are in); **all UI text and user-facing e-mails in
  pt-BR**. Commit messages are pt-BR, `feat:`/`fix:`/`perf:`/`chore:` prefixed,
  and describe the business outcome, not the code.
- **Pages** live under `src/pages/<role>/`; shared UI in `src/components/`
  (`ui.jsx` holds the small design-system primitives). Styling is inline-style
  objects + `src/styles/globals.css` — there is no CSS framework; match the
  existing look by copying patterns from sibling pages.
- **Service layer:** components never call `supabase` directly for business data —
  they call `src/services/api.js` (or a Netlify function via `fetch`). Keep it that way.
- **Permissions:** two layers. Menu/route modules in `src/lib/modules.js`
  (`hasModule`) and fine-grained actions with `acao:` keys (`hasAction`), both
  stored in `access_profiles.modules text[]`. **Fallbacks are permissive by
  design**: a user with no profile sees everything; a profile with no `acao:` keys
  allows all actions. Never "fix" that without a migration plan for existing profiles.
- **SQL patches:** one new `supabase/patch_NNN_short_name.sql` per change, never
  edit an applied patch. Idempotent where practical (`create or replace`,
  `drop policy if exists`).
- **Legacy vs new:** `src/services/mockApi.js`, `src/pages/demo/*` and the legacy
  ADMIN "completo/somente leitura" permission flags are frozen legacy — follow
  them only for consistency, build new things with the profile/action system.

## 5. Configuration model (mechanisms only — never values)

| Where | What | Notes |
|---|---|---|
| `.env` (gitignored) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus script-only vars (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, ...) | ⚠️ Anything prefixed `VITE_` is shipped to the browser. Never put a secret behind a `VITE_` name. |
| Netlify env vars (dashboard) | service_role key, Stripe keys/webhook secret, Resend key, `CRON_SECRET`, `EMAIL_FROM`, site `URL`/`FRONTEND_URL` | Functions read `process.env.*` only. |
| GitHub Actions secrets | HOC sync config (JSON), DB URL for backups, storage credentials, `CRON_SECRET`, `SITE_URL` | Used by the 3 workflows. |
| `scripts/hoc_migration_config.json` (gitignored) | HOC MySQL + Supabase credentials for ops scripts | Request through the team lead. Never committed (verified). |
| DB table `app_settings` | Business config editable in backoffice (e.g. ELOS price list) | Read via api.js; seeded by patch_056. |
| DB tables `holidays`, `documents_catalog`, `client_flows` | Business rules data (business-day math, document catalog + validation rules, per-client flows/prices) | Maintained via backoffice screens, not code. |

## 6. Build, run, deploy

```bash
npm install
npm run dev              # Vite on :5173; proxies /.netlify/functions → :9999
npx netlify dev          # (separate terminal) runs functions locally on :9999
npm run build            # production build → dist/
node --check netlify/functions/<fn>.js   # fast syntax gate for a function
```

- **Deploy:** push to `main` → Netlify builds and deploys automatically (SPA
  redirects + headers in `netlify.toml`). There is no staging environment — small,
  verified commits; watch the deploy after pushing.
- **DB changes:** run the new patch in the Supabase SQL editor (production), then
  commit the patch file in the same change as the code that needs it.
- **Cron:** GitHub Actions call Netlify functions with a bearer `CRON_SECRET`
  (notifications) and run the sync/backup scripts. Check the Actions tab when a
  scheduled behavior "stopped working".
- **Ops scripts:** `scripts/*.py` run from the repo root on a workstation
  (`python3.12`, on Apple Silicon often `arch -x86_64` for mysql-connector wheels).
  They read `.env` and/or `scripts/hoc_migration_config.json`.

## 7. Known pitfalls and operational history (READ THIS)

**Hard rules (violations have bitten us):**

1. **HOC MySQL is READ-ONLY. Always.** Every connection sets
   `SET SESSION transaction_read_only = 1`. Writes go only to Supabase. The sync is
   one-way HOC→ELOS and performs **no DELETEs** — removals become
   `active=false`/`SUSPENDED`.
2. **`hoc_id` decides ownership.** Rows with `hoc_id` are mirrored: the nightly sync
   will overwrite local edits with HOC values (e.g. editing a HOC client's document
   matrix in ELOS gets reverted at 3 AM). ELOS-only rows (`hoc_id IS NULL`) are
   untouchable by the sync. Never delete ELOS-only clients; HOC-inactive clients are
   flagged `clients.active=false`, never removed (some hold thousands of live seals).
3. **ID ranges are load-bearing:** per-client categories mirrored from HOC live at
   ids ≥ 1,000,000 (offset); ELOS-native categories at 500,000+; HOC document-catalog
   entries ≤ ~600; ELOS-native catalog docs at 10,000+. The sync uses these ranges to
   decide what it may overwrite. Breaking the convention silently corrupts matrices.
4. **LGPD/masking is server-side only.** CPF is always masked everywhere; supplier
   contact masking rules run in Netlify functions, never in the client. The
   `hoc_extra` blob must never reach a public profile payload.

**Performance / RLS (cost us days):**

5. Functions referenced inside RLS policies are evaluated **per row** — wrap them as
   `(SELECT fn())` so Postgres runs them once (InitPlan).
6. `ilike` is not leakproof, so under RLS the planner refuses trigram indexes —
   searches went from 0.4s to 12s+/timeouts. The established fix: **SECURITY DEFINER
   RPCs guarded by `is_admin()`** (see `admin_metrics`, `admin_search_suppliers`,
   `admin_document_farol`, `admin_list_documents`, `marketplace_category_suppliers`,
   `analysable_supplier_ids`, `my_supplier_ids` in the patches). New admin-wide
   queries should follow this pattern, not fight RLS.
7. Netlify functions hard-timeout around 26s. Batch jobs (e.g.
   `check-expiring-docs.js`) keep an explicit time budget and per-run caps — the
   daily job silently failed for a week when it grew past the limit.

**Business-logic semantics (not guessable from the schema):**

8. A seal being "Em análise" means a **real process**: the supplier reached the
   document-submission step in HOC, or paid in ELOS, or was subsidized — a raw
   signup is shown as "Cadastro (sem processo)". The backoffice "Farol"/analysis
   screens only consider **operable** processes (seal ACTIVE/PENDING **and** the
   owning client active — or the ELOS pseudo-client).
9. Suppliers homologated directly by EQPI (no external client) surface under a
   UI-only pseudo-client label "ELOS" (`'__ELOS__'` sentinel in filters) — there is
   deliberately **no row** for it in `clients`.
10. Per-flow pricing: each client flow has `price` and `price_subsidized`
    (NULL = "does not operate in this model"); subsidized suppliers never touch
    Stripe; variable Stripe amounts use inline `price_data`, not Price objects.
11. Dates/money: business-day math uses `src/lib/businessDays.js` + `holidays`
    table (Stripe payout estimate = payment + 3 business days); money parsing is
    pt-BR (`parseMoneyBR`: comma = decimal separator).
12. `user_roles` has `UNIQUE(user_id, role)` → one SUPPLIER link per user, and a
    trigger caps 4 users per supplier. Multi-company users are a known open issue
    (extra links recorded in `audit_log`).

**Front-end traps:**

13. `onAuthStateChange` fires `TOKEN_REFRESHED` on tab refocus and used to remount
    the whole app — `AuthContext.jsx` guards with a last-user-id ref. Don't remove it.
14. E-mail recipients: many migrated suppliers have **no login user** — always fall
    back to the registration e-mail on `suppliers` (every mailer does this now), and
    sender identity is always the **company** name resolved server-side, never the
    logged-in user's personal name.
15. Status enums are enforced by CHECK constraints (`documents_status_check` etc.) —
    introducing a status in JS without a patch throws at insert time.

## 8. How to work on this repo with Claude Code

- Specs are markdown files at the **repo root**, step-by-step, in **English** for
  code/identifiers; UI copy inside them in **pt-BR**.
- Step 1 of every spec is **code exploration** — never write before mapping the
  affected area and reporting assumptions back for correction.
- Reusable prompts live in `.claude/commands/`; shared settings in
  `.claude/settings.json` (personal overrides go in `.claude/settings.local.json`,
  which is gitignored — keep it that way).
- Nothing generated may contain the sensitive categories listed below (§9); client
  names in generated docs use neutral labels.

## 9. Where sensitive information lives (pointers only)

The following exist but are **never** in this repo; request access from the team lead:

- Supabase service_role key and direct DB URL; Netlify env values (Stripe, Resend,
  CRON secret)
- HOC MySQL credentials + `scripts/hoc_migration_config.json`
- Legacy S3 access for HOC files; backup bucket details; DR contacts
  (`docs/DR_RUNBOOK.md` is the procedure, values are distributed separately)
- Client-name ↔ label mapping, client master accounts, per-client pricing tables
- GitHub Actions secret values
