#!/usr/bin/env bash
# Start a local Trove dev server wired for SSR verification, then wait
# until it is actually serving. Encapsulates the env munging that is easy
# to get wrong (and silently yields empty pages if you do):
#
#   1. Source the MAIN repo .env.local by value (NEVER symlink it from
#      inside the main repo — that self-symlink destroys the creds file;
#      see memory feedback_envlocal_symlink_hazard).
#   2. Unset the password gate so /browse, /card etc. are reachable
#      without the prod password (hooks.server.ts disables the gate when
#      TROVE_PASSWORD / TROVE_AUTH_SECRET are unset).
#   3. Override the anon publishable key with the SERVICE_ROLE value.
#      The PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local is stale
#      (live probe -> HTTP 401), so the app's anon client reads ZERO rows
#      and every card_index-backed surface renders empty. Service-role is
#      a valid key that also bypasses RLS. LOCAL-ONLY, never committed —
#      this is a verification convenience, not a code path.
#
# Usage:  start-verify-server.sh [PORT]   (default 5199)
# Env:    TROVE_ENV_FILE  (default /Users/tommymarcheschi/dev/rsmc/.env.local)
#         TROVE_REPO_DIR  (overrides repo-dir detection)
#
# Repo-dir resolution (so it serves the CODE UNDER TEST, not main):
#   1. $TROVE_REPO_DIR if set.
#   2. else $PWD if it looks like a Trove checkout (svelte.config.* present)
#      — this makes `cd <worktree> && run` verify the worktree's changes.
#   3. else the repo the skill file physically lives in (main repo).
# Verifying a worktree branch? cd into the worktree first (or pass
# TROVE_REPO_DIR), or you'll silently test main instead of your changes.
set -euo pipefail

PORT="${1:-5199}"
ENV_FILE="${TROVE_ENV_FILE:-/Users/tommymarcheschi/dev/rsmc/.env.local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${TROVE_REPO_DIR:-}" ]; then
  REPO_DIR="$TROVE_REPO_DIR"
elif ls "$PWD"/svelte.config.* >/dev/null 2>&1; then
  REPO_DIR="$PWD"
else
  REPO_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi
LOG="/tmp/trove-verify-$PORT.log"

[ -f "$ENV_FILE" ] || { echo "ENV FILE MISSING: $ENV_FILE" >&2; exit 1; }
if [ -L "$ENV_FILE" ]; then
  echo "REFUSING: $ENV_FILE is a symlink — inspect it (symlink-wipe hazard)" >&2
  exit 1
fi

# Kill any prior server on this port (idempotent re-runs).
pkill -f "vite dev --port $PORT" 2>/dev/null || true
sleep 1

cd "$REPO_DIR"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
unset TROVE_PASSWORD TROVE_AUTH_SECRET
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "WARNING: SUPABASE_SERVICE_ROLE_KEY empty — SSR will read 0 rows" >&2
else
  export PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY="$SUPABASE_SERVICE_ROLE_KEY"
fi

nohup npx vite dev --port "$PORT" > "$LOG" 2>&1 &
SRV_PID=$!

for _ in $(seq 1 40); do
  if grep -q "ready in" "$LOG" 2>/dev/null; then
    echo "READY pid=$SRV_PID port=$PORT log=$LOG repo=$REPO_DIR"
    exit 0
  fi
  if ! kill -0 "$SRV_PID" 2>/dev/null; then
    echo "SERVER DIED — last log lines:" >&2
    tail -15 "$LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "TIMEOUT waiting for dev server; last log lines:" >&2
tail -15 "$LOG" >&2
exit 1
