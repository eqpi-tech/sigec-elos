#!/usr/bin/env bash
# staging_sync.sh — reconstrói o banco de STAGING a partir da PRODUÇÃO:
# schema idêntico + dados de CONFIGURAÇÃO (sem dado pessoal).
#
# Produção é lida em modo somente-leitura (pg_dump); nada é escrito nela.
# O destino é SEMPRE o banco de preview/staging (SUPABASE_DB_URL_PREVIEW) e o
# script se recusa a rodar se destino == produção.
#
# O que COPIA (configuração do negócio, sem PII):
#   catálogo de documentos, categorias e matrizes (PJ e mobilidade), fluxos por
#   cliente, clientes, termos, landing pages, questionários, feriados,
#   perfis de acesso, motivos de reprovação, banners, bc_config, postos de
#   mobilidade, CNAEs.
# O que NÃO copia (dado pessoal / transacional / listas gigantes):
#   fornecedores, sócios, documentos enviados, convites, selos, planos,
#   perfis de usuário, audit_log, consultas, relatórios BC e as listas
#   ref_* (ICIJ/TSE/PEP/OFAC — centenas de MB; staging reporta "base não
#   ingerida", que é o comportamento correto sem elas).
#
# Uso:  bash scripts/staging_sync.sh --yes        (destrutivo no staging)
#       bash scripts/staging_sync.sh --dry-run    (só mostra o plano)
set -euo pipefail

PSQL=/usr/local/opt/libpq/bin/psql
PGDUMP=/usr/local/opt/libpq/bin/pg_dump
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
TMP="${TMPDIR:-/tmp}/elos_staging_sync_$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

PROD=$(grep -m1 '^SUPABASE_DB_URL=' "$ENV_FILE" | cut -d= -f2-)
STAG=$(grep -m1 '^SUPABASE_DB_URL_PREVIEW=' "$ENV_FILE" | cut -d= -f2-)

[ -n "$PROD" ] || { echo "SUPABASE_DB_URL ausente no .env"; exit 1; }
[ -n "$STAG" ] || { echo "SUPABASE_DB_URL_PREVIEW ausente no .env — crie o projeto de staging primeiro"; exit 1; }
[ "$PROD" != "$STAG" ] || { echo "ABORTADO: destino igual à produção"; exit 1; }

# host do destino só para log (sem credenciais)
STAG_HOST=$(printf '%s' "$STAG" | sed -E 's#.*@([^:/]+).*#\1#')
PROD_HOST=$(printf '%s' "$PROD" | sed -E 's#.*@([^:/]+).*#\1#')
[ "$STAG_HOST" != "$PROD_HOST" ] || { echo "ABORTADO: mesmo host de produção"; exit 1; }

CONFIG_TABLES=(
  cnaes holidays app_settings access_profiles documents_catalog rejection_reasons
  banners bc_config ref_list_versions
  clients client_terms_items client_landing_pages client_document_flows
  client_flows client_flow_categories
  categories category_documents category_mobility_documents
  questionnaires questionnaire_questions
  mobility_posts
)

echo "PRODUÇÃO (origem, somente leitura): $PROD_HOST"
echo "STAGING  (destino, será RECRIADO): $STAG_HOST"
echo "tabelas de configuração a copiar: ${#CONFIG_TABLES[@]}"

if [ "${1:-}" = "--dry-run" ]; then
  echo; echo "DRY-RUN — nada foi alterado. Rode com --yes para aplicar."; exit 0
fi
[ "${1:-}" = "--yes" ] || { echo; echo "Este script APAGA o schema public do staging. Rode com --yes para confirmar."; exit 1; }

echo; echo "1/5 · dump do schema (pré-dados) da produção…"
"$PGDUMP" "$PROD" --schema=public --schema-only --section=pre-data --no-owner > "$TMP/pre.sql"

echo "2/5 · dump do schema (pós-dados: constraints, índices, policies)…"
"$PGDUMP" "$PROD" --schema=public --schema-only --section=post-data --no-owner > "$TMP/post.sql"

echo "3/5 · dump dos dados de configuração…"
DUMP_ARGS=()
for t in "${CONFIG_TABLES[@]}"; do DUMP_ARGS+=(-t "public.$t"); done
"$PGDUMP" "$PROD" --data-only --no-owner "${DUMP_ARGS[@]}" > "$TMP/data.sql"
echo "   pré=$(wc -l < "$TMP/pre.sql") linhas · pós=$(wc -l < "$TMP/post.sql") · dados=$(wc -l < "$TMP/data.sql")"

echo "4/5 · recriando o schema no staging…"
# O dump já traz 'CREATE SCHEMA public' — aqui só derrubamos o antigo
"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q -c 'drop schema if exists public cascade;'

# pré-dados: tabelas, funções, tipos (aborta no primeiro erro real)
"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q -f "$TMP/pre.sql" || { echo "FALHOU no pré-dados"; exit 1; }

# pg_trgm vive no schema public em produção e é usado por índices (pós-dados)
"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q <<'SQL'
create extension if not exists pg_trgm with schema public;
grant usage on schema public to anon, authenticated, service_role;
SQL

"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q -f "$TMP/data.sql" || { echo "FALHOU na carga de configuração"; exit 1; }

# Staging não tem os usuários nem os fornecedores de produção: zera as
# referências a eles ANTES dos pós-dados, senão as FKs não são criadas
# (clients.user_id, access_profiles.created_by, banners.created_by e
# mobility_posts.supplier_id — este religa quando o CNPJ se cadastrar aqui).
"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q <<'SQL'
update clients         set user_id     = null where user_id     is not null;
update access_profiles set created_by  = null where created_by  is not null;
update banners         set created_by   = null where created_by  is not null;
update mobility_posts  set supplier_id = null where supplier_id is not null;
SQL

# pós-dados: constraints/índices/policies. 'permission denied to change default
# privileges' é esperado (ALTER DEFAULT PRIVILEGES de roles do Supabase).
"$PSQL" "$STAG" -q -f "$TMP/post.sql" 2>&1 \
  | grep -E 'ERROR' | grep -vE 'default privileges|already exists' | head -20 || true

echo "5/6 · marcando as migrations do repositório como aplicadas…"
# O staging é montado por pg_dump, não pelas migrations do Supabase CLI. Se a
# branch do Supabase rodar migrations num push, ela não deve reaplicar nada.
for f in "$(dirname "$0")/../supabase/migrations/"*.sql; do
  [ -e "$f" ] || continue
  b=$(basename "$f" .sql); v="${b%%_*}"; n="${b#*_}"
  "$PSQL" "$STAG" -q -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$n') on conflict (version) do nothing" || true
done

echo "6/6 · buckets de storage e conferência…"
"$PSQL" "$STAG" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into storage.buckets (id, name, public)
values ('documents','documents',false), ('bc-reports','bc-reports',false),
       ('client-terms','client-terms',false), ('banners','banners',true),
       ('client-lp','client-lp',true)
on conflict (id) do nothing;
SQL

"$PSQL" "$STAG" -P pager=off -c "
select 'tabelas' item, count(*)::text valor from information_schema.tables where table_schema='public'
union all select 'funções', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies', count(*)::text from pg_policies where schemaname='public'
union all select 'catálogo de documentos', count(*)::text from documents_catalog
union all select 'categorias', count(*)::text from categories
union all select 'matriz PJ', count(*)::text from category_documents
union all select 'matriz mobilidade', count(*)::text from category_mobility_documents
union all select 'clientes', count(*)::text from clients
union all select 'fluxos', count(*)::text from client_flows
union all select 'postos de mobilidade', count(*)::text from mobility_posts
union all select 'FKs', (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f')::text
union all select 'fornecedores (esperado 0)', count(*)::text from suppliers"

cat <<'FIM'

STAGING PRONTO (schema + configuração). Próximos passos manuais:
  1. Netlify: no site, defina as variáveis do contexto do branch 'staging'
     (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL,
     SUPABASE_SERVICE_ROLE_KEY apontando para o projeto de staging;
     ELOS_ENV=staging; STRIPE em modo teste; NÃO defina RESEND_API_KEY).
  2. Usuários de teste: crie pelo painel do Supabase de staging (Auth →
     Add user) um ADMIN e um usuário de cliente; depois rode no SQL editor
     do staging o insert em user_roles/profiles correspondente.
  3. Fornecedores de teste: cadastre pelo próprio fluxo (/cadastro) no
     ambiente de staging — assim você testa o caminho real.
Detalhes e checklist completo: docs/STAGING.md
FIM
