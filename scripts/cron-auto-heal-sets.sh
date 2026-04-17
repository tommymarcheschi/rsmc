#!/usr/bin/env bash
# Trove — daily auto-heal of tracked sets.
# Runs between detect-new-sets (03:00) and refresh-stale (04:00) so newly
# enrolled sets get their missing rows + TCGPlayer prices in place before
# the stale-refresh cron wastes a cycle on them.
#
# Invoked by launchd (see scripts/launchd/com.trove.auto-heal-sets.plist).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/auto-heal-$(date +%Y-%m-%d).log"

{
  echo "=== Trove auto-heal start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/auto-heal-sets.ts
  EXIT=$?
  echo "=== Trove auto-heal end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"auto-heal failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
