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

Criados em 25/09 e com login verificado (senha distribuída pelo canal seguro do
time, nunca aqui):

| Usuário | Papel | Observação |
| --- | --- | --- |
| `admin.preview@eqpitech.com.br` | ADMIN (backoffice) | já existia no Auth do staging; papéis recriados após o rebuild do schema |
| `staging.cliente@equipoinfo.com.br` | CLIENT | vinculado ao cliente âncora (`clients.user_id`) |

**Atenção ao recriar o banco** (`staging_sync.sh` derruba o schema `public`):
os usuários continuam no Auth, mas `profiles` e `user_roles` são apagados — é
preciso recriar os vínculos. SQL de referência:

```sql
-- papel de ADMIN
insert into user_roles (user_id, role)
select id, 'ADMIN' from auth.users where email='<e-mail do admin>' on conflict do nothing;
insert into profiles (id, role, name)
select id, 'ADMIN', 'Admin Staging' from auth.users where email='<e-mail do admin>'
on conflict (id) do update set role='ADMIN';

-- papel de CLIENTE (pegue o id em: select id, razao_social from clients)
insert into user_roles (user_id, role, client_id)
select id, 'CLIENT', '<uuid do cliente>' from auth.users where email='<e-mail do cliente>' on conflict do nothing;
insert into profiles (id, role, name)
select id, 'CLIENT', 'Cliente Staging' from auth.users where email='<e-mail do cliente>'
on conflict (id) do update set role='CLIENT';
update clients set user_id = (select id from auth.users where email='<e-mail do cliente>')
 where id = '<uuid do cliente>';
```

**Criando usuário direto por SQL** (sem o painel): além de `auth.users` e
`auth.identities`, as colunas de token precisam vir como string vazia — em
NULL o GoTrue responde `Database error querying schema` no login:

```sql
update auth.users
   set confirmation_token='', recovery_token='', email_change='', email_change_token_new=''
 where email='<e-mail criado por SQL>';
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

## 7. O banco de staging é uma *preview branch* do Supabase — cuidados

Decisão de 25/09: mantido como **preview branch** (o nome no painel é o da
antiga branch de trabalho do BC Report), sem converter para persistent.
Consequências e proteções:

| Risco | Situação |
| --- | --- |
| Apagar a branch Git associada **destrói o banco de staging** | Mitigado: a branch está **protegida contra deleção** no GitHub (regra de proteção aplicada em 25/09). Não remova essa proteção. |
| PR daquela branch ser aberto/mergeado/fechado | Não há PR aberto; o merge para a `main` já foi feito por linha de comando, sem PR. |
| Push disparar migrations do `supabase/migrations/` e bagunçar o banco | Mitigado: as 13 migrations do repositório foram **marcadas como aplicadas** em `supabase_migrations.schema_migrations` do staging, então uma execução não encontra nada para rodar. O `staging_sync.sh` refaz essa marcação. |
| Branch reset a partir do projeto pai | Não usar o botão *Reset* da branch no painel: ele reaplicaria migrations sobre o que o `staging_sync.sh` montou. |
| Perder o ambiente | Impacto pequeno: o staging **não guarda nada único** — a configuração vem da produção e os dados de teste são descartáveis. Recuperação: criar nova branch/projeto, apontar `SUPABASE_DB_URL_PREVIEW` e as 4 variáveis do Netlify, rodar `staging_sync.sh --yes` e recriar os dois usuários (~15 min). |

## 8. Limites conhecidos

- Sem as listas `ref_*`, o BC Report não encontra sanções/mídia local; os
  conectores de API externa funcionam se as credenciais de teste existirem.
- Arquivos do Storage não são copiados: documentos antigos não abrem no
  staging (os que você subir lá funcionam normalmente).
- O cron do BC Report não roda no branch deploy; para testar a fila, chame o
  worker HTTP manualmente.
- O sync HOC → ELOS nunca deve ser apontado para o staging (a regra do projeto
  é HOC somente leitura; o staging não precisa dele).
