# SPEC: Generate Onboarding Knowledge Base (CLAUDE.md) for New Developer

## Context

A new senior developer (Gabriel Novaes) is joining the team to support this system. He has strong general technical skills (Java, AWS, databases) but **zero knowledge of this codebase, its clients, or its operational history**. Your task is to distill the accumulated project knowledge into version-controlled documentation that loads automatically when he uses Claude Code in this repository.

**CRITICAL CONSTRAINT — SANITIZATION:** This repository and its documentation may be shared. Nothing you write may contain confidential or operationally sensitive data. See Step 5 before writing any file.

## Step 1 — Code exploration (do this first, before writing anything)

Explore the repository thoroughly:

1. Map the module/package structure and identify the architectural layers (e.g. web layer, service layer, persistence, async consumers, batch jobs).
2. Identify the technology stack precisely: frameworks and versions (check `pom.xml` / `build.gradle`), Java version, application server, database, messaging, external integrations.
3. Identify entry points: main servlets/controllers/pages, JMS listeners, scheduled jobs, CLI utilities.
4. Locate configuration mechanisms: property files, environment variables, database-driven config tables. **Flag (do not document values of) any config source that stores credentials.**
5. Identify build, deploy, and runtime model: how the artifact is built, how it runs (Docker? Tomcat webapp? systemd?), what a restart/recovery procedure looks like based on scripts present in the repo.
6. Check existing Claude Code assets: run `git ls-files | grep -iE "claude|\.claude"` and inspect any existing `CLAUDE.md`, `.claude/commands/`, `.claude/agents/`, `.claude/settings.json`. Preserve and improve — do not discard existing accumulated knowledge.

Produce a short exploration summary in the chat before proceeding, so I can correct wrong assumptions.

## Step 2 — Generate or update `CLAUDE.md` at repository root

Write it for a strong developer with zero project context. Structure:

1. **System purpose** — what this system does, who uses it, in 3–5 sentences. Business domain terms (pt-BR) explained in parentheses.
2. **Architecture overview** — layers, main modules, request/message flow. Use an ASCII diagram if helpful.
3. **Technology stack** — exact frameworks/versions found in Step 1.
4. **Code conventions** — naming, package organization, patterns actually used in this codebase (not aspirational ones). Note legacy patterns that must be followed for consistency vs. patterns for new code.
5. **Configuration model** — where config lives and how it is loaded. Reference config sources by mechanism, never by value (e.g. "AWS credentials are loaded from the `parametros` table — request access through the team lead" — never the values themselves).
6. **Build, run, and deploy** — commands to build locally, run tests, and how deployment works conceptually. No server hostnames or IPs.
7. **Known pitfalls and operational history** — this is the highest-value section. Document every non-obvious behavior you can infer from the code, comments, commit history (`git log --oneline -100`), and existing docs: fragile areas, error-prone flows, exception handling gaps, threading issues in listeners/consumers, encoding issues, timezone assumptions, anything with `TODO`/`FIXME`/`HACK` comments worth knowing.
8. **How to work on this repo with Claude Code** — spec conventions: specs in English for code/identifiers, pt-BR for UI text and user-facing messages; specs placed at repo root as step-by-step markdown; first step is always code exploration.
9. **Where sensitive information lives** — a pointer section only: state that credentials, client environment details, and infrastructure identifiers are distributed through a secure channel by the team lead, and list *categories* of what exists (e.g. "per-client AWS access", "database credentials", "deployment runbook") without any actual data.

## Step 3 — Create/update `.claude/` shared assets

1. Keep or create `.claude/settings.json` with only non-sensitive, shareable settings.
2. If useful slash commands exist as informal knowledge (common debugging queries, log inspection, build shortcuts), formalize them under `.claude/commands/` — sanitized.
3. Ensure `.gitignore` contains:
   ```
   .claude/settings.local.json
   ```
   Add it if missing.

## Step 4 — Generate `docs/ONBOARDING.md`

A short human-readable companion (max 2 pages) for the new developer's first week:

1. Prerequisites to install (JDK version, IDE, Docker, database client).
2. How to get the project running locally, step by step, using placeholder credentials (`<DB_USER>`, `<DB_PASSWORD>`) — never real ones.
3. A "first tasks" reading path: which 5–10 classes/files to read first to understand the system fastest, in order, with one line on why each matters.
4. Who to ask for what (roles, not personal contact data): access requests → team lead; client-specific behavior → team lead.

## Step 5 — Sanitization rules (apply to EVERY file you write)

NEVER include, in any generated file:

- Credentials, API keys, tokens, passwords — real or historical
- AWS account IDs, IAM user/role names, ARNs
- IP addresses, hostnames, FQDNs, EC2 instance names/IDs
- Real client names or client-identifying environment names — refer to them generically as "client environments"; if per-client behavior must be documented, use neutral labels (`CLIENT_A`, `CLIENT_B`) and note that the mapping is distributed via secure channel
- Real personal data (names, CPFs, emails, phone numbers) from test data, comments, or commit messages
- Contents of any config values from database tables or property files — mechanisms only, never values

If you find any of the above hardcoded in the codebase itself while exploring, do NOT copy it anywhere; instead, append it to a local-only report `SECURITY-FINDINGS.local.md` (add this filename to `.gitignore` first) listing file path + line + category of finding, so it can be remediated separately.

## Step 6 — Verification before finishing

1. Re-read every generated/modified file and grep them for leak patterns: `AKIA`, `aws_secret`, `password`, `senha`, IP address regex (`[0-9]{1,3}(\.[0-9]{1,3}){3}`), `amazonaws.com`, and any client names you encountered during exploration.
2. Run `git status` and list exactly which files were created/modified.
3. Do NOT commit. Present a summary of all changes and wait for my review.

## Deliverables checklist

- [ ] `CLAUDE.md` (root) — created or updated
- [ ] `.claude/settings.json` — sanitized shared settings
- [ ] `.claude/commands/` — formalized useful commands (if applicable)
- [ ] `.gitignore` — includes `.claude/settings.local.json` and `SECURITY-FINDINGS.local.md`
- [ ] `docs/ONBOARDING.md` — first-week guide
- [ ] `SECURITY-FINDINGS.local.md` — only if hardcoded secrets were found (local, gitignored)
- [ ] Chat summary of changes, awaiting review — nothing committed
