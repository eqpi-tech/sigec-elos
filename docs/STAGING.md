# Ambiente de STAGING — ELOS

Ambiente para testar ideias novas **sem tocar na produção**, que a partir de
01/10 opera o cliente âncora e o grupo da holding.

> Regra de sanitização deste repositório: nenhum valor de credencial, URL de
> projeto ou identificador de infraestrutura aqui. Abaixo estão só os **nomes**
> das variáveis; os valores ficam no painel do Netlify / Supabase e no canal
> seguro do time.

## 1. Como o ambiente é montado

| Peça | Produção | Staging |
| --- | --- | --- |
| Branch do Git | `main` | `staging` |
| Deploy | Netlify, contexto `production` | Netlify, **branch deploy** do branch `staging` |
| Banco / Auth / Storage | projeto Supabase de produção | **projeto Supabase separado** (`SUPABASE_DB_URL_PREVIEW` no `.env` local) |
| `ELOS_ENV` | `production` | `staging` (definido em `netlify.toml`) |
| Funções agendadas (cron) | rodam | **não rodam** (deploy de branch não executa schedules) |
| E-mails | enviados normalmente | **travados** por `lib/mail_guard.js` |
| Stripe | chaves live | chaves de **teste** |
| Sync HOC → ELOS | GitHub Actions apontando para produção | **não roda** (nunca aponte o sync para staging) |

## 2. Banco de staging

Reconstruído a partir da produção com `scripts/staging_sync.sh`:

```bash
bash scripts/staging_sync.sh --dry-run   # mostra o plano
bash scripts/staging_sync.sh --yes       # RECRIA o schema public do staging
```

O script lê a produção apenas com `pg_dump` (nada é escrito lá) e se recusa a
rodar se o destino for o mesmo host da produção.

**Copia** (configuração do negócio, sem dado pessoal): catálogo de documentos,
categorias, matriz PJ, matriz de mobilidade, clientes, fluxos por cliente,
termos, landing pages, questionários, feriados, perfis de acesso, motivos de
reprovação, banners, `bc_config`, postos de mobilidade e CNAEs.

**Não copia**: fornecedores, sócios, documentos enviados, convites, selos,
planos, perfis de usuário, `audit_log`, consultas de CNPJ, relatórios do BC
Report e as listas `ref_*` (ICIJ/TSE/PEP/OFAC — centenas de MB). Sem as listas,
os conectores do BC Report respondem "base local ainda não ingerida", que é o
comportamento correto.

Referências a usuários/fornecedores de produção são zeradas
(`clients.user_id`, `access_profiles.created_by`, `banners.created_by`,
`mobility_posts.supplier_id`) para as FKs poderem ser recriadas.

Conferência esperada após rodar: mesmo número de tabelas, funções, policies,
índices, triggers e FKs da produção, com `suppliers` em zero.

## 3. Variáveis no Netlify (escopo: branch `staging`)

No painel do site → *Environment variables* → cada variável com
"different value for **branch deploys / staging**":

| Variável | O que apontar |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | projeto Supabase de **staging** |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | projeto Supabase de **staging** |
| `MAIL_TEST_INBOX` | uma caixa do time (ex.: a do responsável pelos testes) |
| `RESEND_API_KEY` | **deixe em branco** para não enviar nada; ou defina junto com `MAIL_TEST_INBOX` para testar o conteúdo dos e-mails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | chaves e preços de **teste** |
| `URL` / `FRONTEND_URL` | a URL do branch deploy |
| `CRON_SECRET` | um valor **diferente** do de produção |
| Demais integrações (Assertiva, Infosimples, NF-e, Transparência, DataJud) | credenciais de teste, ou deixe em branco para desligar a integração no staging |

`ELOS_ENV` **não** precisa ser criada no painel: vem de `netlify.toml`
(`production` / `staging` / `preview`).

## 4. Trava de e-mails (importante)

`netlify/functions/lib/mail_guard.js`: fora de produção
(`ELOS_ENV != 'production'`), nenhum e-mail chega ao destinatário real.

- Com `MAIL_TEST_INBOX`: tudo é redirecionado para essa caixa e o assunto ganha
  o prefixo `[staging → destinatário@original]`.
- Sem `MAIL_TEST_INBOX`: o envio é descartado com log.

Aplicada hoje em `send-email.js` (caminho usado pela maioria dos fluxos) e nos
três disparos em lote: lembretes de convite, lembretes de pendências e avisos
de documentos vencendo. Os demais mailers dependem de `RESEND_API_KEY` — por
isso a recomendação de **não** definir a chave no staging enquanto não
estiverem todos cobertos.

## 5. Usuários de teste no staging

O banco vem sem usuários. Pelo painel do Supabase de staging (*Authentication →
Add user*), crie ao menos:

1. um **ADMIN** (backoffice) e
2. um **usuário de cliente** para testar a visão do contratante.

Depois, no SQL editor do staging, vincule o papel:

```sql
-- ADMIN do backoffice
insert into user_roles (user_id, role) values ('<uuid do usuário>', 'ADMIN');
insert into profiles (id, role, name) values ('<uuid do usuário>', 'ADMIN', 'Admin Staging')
  on conflict (id) do nothing;

-- usuário de um cliente (pegue o id em: select id, razao_social from clients)
update clients set user_id = '<uuid do usuário>' where id = '<uuid do cliente>';
insert into user_roles (user_id, role, client_id) values ('<uuid do usuário>', 'CLIENT', '<uuid do cliente>');
```

Fornecedores: cadastre pelo próprio fluxo (`/cadastro` no endereço do staging)
— assim o caminho real é exercitado. Lembre que o **MFA é obrigatório** também
no staging (carência de 30 dias para fornecedor/cliente; ADMIN sem carência).

## 6. Rotina de trabalho

```bash
git checkout staging
git merge main          # traz produção para o staging antes de começar
# desenvolve, commita, push → Netlify publica o branch deploy
```

Quando a ideia estiver aprovada: abrir PR de `staging` → `main` (ou merge
direto, como o time preferir) e aplicar os patches SQL em produção na mesma
leva do código, como sempre.

Para "resetar" o staging depois de testes sujos: rodar `staging_sync.sh --yes`
de novo — ele reconstrói o schema e a configuração a partir da produção.

## 7. Limites conhecidos

- Sem as listas `ref_*`, o BC Report não encontra sanções/mídia local; os
  conectores de API externa funcionam se as credenciais de teste existirem.
- Arquivos do Storage não são copiados: documentos antigos não abrem no
  staging (os que você subir lá funcionam normalmente).
- O cron do BC Report não roda no branch deploy; para testar a fila, chame o
  worker HTTP manualmente.
- O sync HOC → ELOS nunca deve ser apontado para o staging (a regra do projeto
  é HOC somente leitura; o staging não precisa dele).
