#!/usr/bin/env bash
# Trove — Track A: nightly TAG Grading population crawl.
# Gap-prioritised (never-synced sets first, then staleest), per-set isolated.
# TAG's api.taggrading.com is not Cloudflare-walled, so this is lightly paced
# and finishes well before the coverage-ledger snapshot.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/tag-pop-$(date +%Y-%m-%d).log"

{
  echo "=== Trove tag-pop start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/tag-pop.ts --all
  EXIT=$?
  echo "=== Trove tag-pop end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"tag-pop failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
