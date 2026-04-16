#!/usr/bin/env bash
# Trove — nightly card_index snapshot (Tier 2.1)
# Writes one row per priced card into card_index_history, enabling
# /insights momentum queries. Invoked by launchd.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/snapshot-card-index-$(date +%Y-%m-%d).log"

{
  echo "=== Trove snapshot-card-index start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/snapshot-card-index.ts
  EXIT=$?
  echo "=== Trove snapshot-card-index end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"snapshot-card-index failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
