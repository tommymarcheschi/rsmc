#!/usr/bin/env bash
# Trove — continuous enrichment worker (Track B) launcher.
# This is NOT a periodic cron: it execs a long-running self-pacing loop.
# launchd KeepAlive (see com.trove.enrich-worker.plist) restarts it if it
# ever dies. Hard-depends on the dev-server Cloudflare proxy being up
# (com.trove.dev-proxy) — DEV_SERVER_URL in .env.local.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/enrich-worker-$(date +%Y-%m-%d).log"

echo "=== Trove enrich-worker exec: $(date -u +%FT%TZ) ===" >>"$LOG_FILE"
# exec so launchd tracks the worker PID directly (clean SIGTERM on stop).
exec node_modules/.bin/tsx scripts/enrich-worker.ts >>"$LOG_FILE" 2>&1
