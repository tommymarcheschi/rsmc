#!/usr/bin/env bash
# Trove — daily stale refresh (Tier 1.3)
# Re-enriches the oldest N cards where last_enriched_at > 7 days ago.
# Invoked by launchd (see scripts/launchd/com.trove.refresh-stale.plist).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/refresh-stale-$(date +%Y-%m-%d).log"

# Knob — how many stale cards per run. ~2 sec/card + 300ms batch delay at
# concurrency 6 means 100 cards ≈ 30 sec. Bump via env if needed.
STALE_LIMIT="${TROVE_STALE_LIMIT:-100}"

{
  echo "=== Trove refresh-stale start: $(date -u +%FT%TZ) ==="
  echo "Stale limit: $STALE_LIMIT"
  node_modules/.bin/tsx scripts/refresh-index.ts --stale "$STALE_LIMIT"
  EXIT=$?
  echo "=== Trove refresh-stale end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"refresh-stale failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
