#!/usr/bin/env bash
# scripts/restore-test.sh
# Restaura um dump de backup em um banco de staging e valida a integridade.
#
# Uso:
#   ./scripts/restore-test.sh <caminho_do_dump> <STAGING_DB_URL>
#
# Exemplo:
#   ./scripts/restore-test.sh elos_20260706_040012.dump postgresql://user:pass@staging-host/dbname
#
# ATENÇÃO: este script possui proteção para evitar execução contra produção.

set -euo pipefail

# ─── Configuração ──────────────────────────────────────────────────────────────
PROD_HOSTNAME="db.xjkfvcwdimbtgubzqiqu.supabase.co"   # hostname de produção Supabase

# ─── Argumentos ────────────────────────────────────────────────────────────────
if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <caminho_do_dump> <STAGING_DB_URL>"
  echo ""
  echo "Exemplo:"
  echo "  $0 elos_20260706_040012.dump postgresql://user:pass@staging-host/dbname"
  exit 1
fi

DUMP_FILE="$1"
TARGET_URL="$2"

# ─── Proteção contra execução em produção ──────────────────────────────────────
if echo "$TARGET_URL" | grep -qi "$PROD_HOSTNAME"; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ERRO: URL de destino aponta para o banco de PRODUÇÃO.      ║"
  echo "║  Este script é exclusivo para ambientes de STAGING.          ║"
  echo "║  Operação cancelada por segurança.                           ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  exit 2
fi

# ─── Verificação do arquivo de dump ────────────────────────────────────────────
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERRO: arquivo de dump não encontrado: $DUMP_FILE"
  exit 1
fi

FILE_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
if [[ "$FILE_SIZE" -le 0 ]]; then
  echo "ERRO: arquivo de dump está vazio: $DUMP_FILE"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  SIGEC-ELOS — Restore Test"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Dump   : $DUMP_FILE (${FILE_SIZE} bytes)"
echo "  Destino: $(echo "$TARGET_URL" | sed 's|:.*@|:***@|')"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ─── Restaurar dump ────────────────────────────────────────────────────────────
echo "[$(date -u '+%H:%M:%S')] Iniciando pg_restore..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_URL" \
  "$DUMP_FILE"

echo "[$(date -u '+%H:%M:%S')] pg_restore concluído."
echo ""

# ─── Queries de sanidade ───────────────────────────────────────────────────────
echo "[$(date -u '+%H:%M:%S')] Executando queries de sanidade..."
echo ""

run_query() {
  local label="$1"
  local sql="$2"
  local result
  result=$(psql "$TARGET_URL" -t -A -c "$sql" 2>&1)
  echo "  ✓ ${label}: ${result}"
}

run_query "suppliers (total)"      "SELECT count(*) FROM suppliers;"
run_query "audit_log (total)"      "SELECT count(*) FROM audit_log;"
run_query "documents (total)"      "SELECT count(*) FROM documents;"
run_query "user_roles (total)"     "SELECT count(*) FROM user_roles;"
run_query "clients (total)"        "SELECT count(*) FROM clients;"
run_query "seals (total)"          "SELECT count(*) FROM seals;"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  RESULTADO: Restore concluído com sucesso."
echo "  Data/hora: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "════════════════════════════════════════════════════════════════"
echo ""
