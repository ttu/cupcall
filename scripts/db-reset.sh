#!/usr/bin/env bash
# Drop all tables (via public schema reset) and re-run migrations.
# Usage: pnpm db:reset [--sync <tournament-id>]
#
# --sync <id>  also re-seed by running the sync pipeline for the given tournament.

set -euo pipefail

SYNC_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --sync) SYNC_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load env vars so DATABASE_URL is available.
ENV_FILE="$ROOT/apps/web/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

echo "==> Dropping public schema..."
NODE_OPTIONS="" TSX_TSCONFIG_PATH="$ROOT/scripts/tsconfig.json" tsx "$ROOT/scripts/db-reset.ts"

echo "==> Running migrations..."
NODE_OPTIONS="" pnpm -C "$ROOT/packages/db" exec drizzle-kit migrate

if [[ -n "$SYNC_ID" ]]; then
  echo "==> Syncing tournament: $SYNC_ID"
  NODE_OPTIONS="" pnpm --dir "$ROOT" sync -- "$SYNC_ID"
fi

echo "==> Done."
