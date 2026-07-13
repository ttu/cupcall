#!/usr/bin/env bash
# Start all services for local development.
# Usage: bash scripts/dev.sh [--no-migrate] [--sync <tournament-id>]

set -euo pipefail

MIGRATE=true
SYNC_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-migrate) MIGRATE=false; shift ;;
    --sync) SYNC_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load env vars for tools that don't auto-read .env.local (drizzle-kit, sync) — but only
# when DATABASE_URL isn't already set (e.g. by the devcontainer's ambient environment).
# apps/web/.env.local targets the host machine's forwarded port and would otherwise override
# a working in-container DATABASE_URL. Mirrors the same guard used in db-reset.sh.
ENV_FILE="$ROOT/apps/web/.env.local"
if [[ -z "${DATABASE_URL:-}" && -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

# Derive the reachability check's host/port from DATABASE_URL when set, so it targets the
# same database Next.js will actually connect to. PGHOST/PGPORT (if explicitly set) still win;
# otherwise fall back to the host-machine defaults for the (rare) case DATABASE_URL is unset.
if [[ -n "${DATABASE_URL:-}" && -z "${PGHOST:-}" && -z "${PGPORT:-}" ]]; then
  DB_HOST="$(node -e "console.log(new URL(process.env.DATABASE_URL).hostname)")"
  DB_PORT="$(node -e "console.log(new URL(process.env.DATABASE_URL).port || 5432)")"
else
  DB_HOST="${PGHOST:-localhost}"
  DB_PORT="${PGPORT:-5440}"
fi

db_reachable() {
  node -e "
    const net = require('net');
    const s = net.createConnection($DB_PORT, '$DB_HOST');
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => { s.destroy(); process.exit(1); });
  " 2>/dev/null
}

if db_reachable; then
  echo "==> Database already running at ${DB_HOST}:${DB_PORT} — leaving it as is."
elif command -v docker &>/dev/null; then
  echo "==> Starting database..."
  docker compose -f "$ROOT/.devcontainer/docker-compose.yml" up -d db
else
  echo "==> Docker not available — assuming database is already running."
fi

echo "==> Waiting for database at ${DB_HOST}:${DB_PORT}..."
until db_reachable; do
  sleep 1
done
echo "==> Database is ready."

if [[ "$MIGRATE" == "true" ]]; then
  echo "==> Running migrations..."
  NODE_OPTIONS="" pnpm -C "$ROOT/packages/db" exec drizzle-kit migrate
fi

if [[ -n "$SYNC_ID" ]]; then
  echo "==> Syncing tournament: $SYNC_ID"
  NODE_OPTIONS="" pnpm --dir "$ROOT" sync -- "$SYNC_ID"
fi

echo "==> Starting Next.js dev server..."
exec pnpm -C "$ROOT/apps/web" dev
