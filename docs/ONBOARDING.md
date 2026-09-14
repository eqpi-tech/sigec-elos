# ONBOARDING — primeira semana no SIGEC-ELOS

Companheiro humano do `CLAUDE.md` (raiz) — leia o CLAUDE.md primeiro: ele tem a
arquitetura, as convenções e, principalmente, a seção 7 (**armadilhas conhecidas**).

## 1. Pré-requisitos

- **Node.js 20** (mesma major do runtime Netlify) + npm
- **Netlify CLI**: `npm i -g netlify-cli` (funções locais)
- **Python 3.12** (scripts operacionais em `scripts/`; em Mac Apple Silicon alguns
  wheels exigem `arch -x86_64`)
- **Git + GitHub CLI (`gh`)** — workflows de cron e backup rodam no Actions
- Um cliente Postgres (psql/TablePlus/DBeaver) e um cliente MySQL (só leitura do legado)
- Editor com Claude Code (as convenções do repo assumem esse fluxo)

## 2. Rodando localmente

```bash
git clone <repo> && cd sigec-elos
npm install
```

Crie `.env` na raiz (peça os valores ao líder técnico — nunca estão no repo):

```bash
VITE_SUPABASE_URL=<SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
# usados só por scripts (não são expostos ao browser):
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
SUPABASE_DB_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/postgres
```

Dois terminais:

```bash
npm run dev          # SPA em http://localhost:5173
npx netlify dev      # funções em :9999 (o Vite já faz proxy de /.netlify/functions)
```

⚠️ O banco é o de **produção** (não há staging): logue com um usuário de teste,
não crie/edite dados reais. Funções que exigem segredos de produção (Stripe,
Resend, bureaus) só funcionam com as env vars correspondentes — peça apenas as
que a sua tarefa exigir.

Deploy: merge/push na `main` → build automático no Netlify. Alterações de banco:
novo arquivo `supabase/patch_NNN_*.sql`, aplicado manualmente no SQL editor
(use `/new-patch` no Claude Code).

## 3. Trilha de leitura (nesta ordem)

1. `CLAUDE.md` — o mapa geral; a seção 7 evita os erros que já nos custaram dias.
2. `src/App.jsx` — todas as rotas por perfil; de quebra mostra o gate de
   módulos/ações (`Protect`).
3. `src/services/api.js` — a camada de serviço única; como o front fala com
   Supabase e funções.
4. `supabase/schema.sql` + os últimos ~10 `patch_*.sql` — o modelo de dados e o
   estilo de evolução (RLS, RPCs `security definer`).
5. `docs/SYNC_HOC_ELOS.md` — os invariantes do sync com o legado (`hoc_id`,
   mão única, faixas de ID). Obrigatório antes de tocar qualquer entidade migrada.
6. `src/context/AuthContext.jsx` + `src/lib/modules.js` — sessão, perfis e o
   sistema de permissões por módulo/ação.
7. `netlify/functions/send-invitation.js` — função server-side "típica" completa
   (validação, service_role, e-mail, fallbacks de destinatário).
8. `src/pages/backoffice/DocumentAnalysis.jsx` — a tela mais rica do backoffice;
   concentra os conceitos de análise, farol e status de documentos.
9. `scripts/sync_hoc_daily.py` — como o espelhamento diário funciona na prática.
10. `docs/manuais/` — manuais por perfil: o vocabulário de negócio que os
    usuários usam.

## 4. A quem pedir o quê

| Assunto | Procure |
|---|---|
| Acessos (Supabase, Netlify, GitHub, credenciais, `hoc_migration_config.json`) | Líder técnico |
| Comportamento específico de cliente / mapeamento de nomes | Líder técnico |
| Regras de negócio da homologação (documentos, prazos, selos) | Equipe de análise (via líder) |
| Prioridades e backlog | Líder técnico / CEO |

Regra de ouro: o MySQL do HOC é **somente leitura**; escrita, só no Supabase.
Na dúvida sobre um dado migrado, o HOC é a fonte da verdade até a madrugada seguinte.
