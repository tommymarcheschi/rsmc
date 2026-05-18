#!/usr/bin/env bash
# Trove — nightly coverage_ledger snapshot (data-engine scoreboard)
# Records per-set graded-data coverage so the self-healing crons have a
# gap-prioritised target and the 5%->95% climb is visible. Invoked by
# launchd at 05:30, after detect/auto-heal/refresh/snapshot have run.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/coverage-ledger-$(date +%Y-%m-%d).log"

{
  echo "=== Trove coverage-ledger start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/coverage-ledger.ts
  EXIT=$?
  echo "=== Trove coverage-ledger end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"coverage-ledger failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
