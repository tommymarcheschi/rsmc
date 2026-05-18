#!/usr/bin/env bash
# Trove — Track A: nightly GemRate population crawl.
# Gap-prioritised (worst pop coverage first via coverage_ledger), set-level,
# Cloudflare-paced. Runs EARLY (02:00) so it finishes before the
# coverage-ledger snapshot at 05:30 captures the freshened pop.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/gemrate-pop-$(date +%Y-%m-%d).log"

{
  echo "=== Trove gemrate-pop start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/gemrate-pop.ts --all
  EXIT=$?
  echo "=== Trove gemrate-pop end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"gemrate-pop failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
