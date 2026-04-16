#!/usr/bin/env bash
# Trove — daily check for new TCG sets (Tier 1.2)
# Invoked by launchd (see scripts/launchd/com.trove.detect-new-sets.plist).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/detect-new-sets-$(date +%Y-%m-%d).log"

# Override via env. By default: enroll new sets with enabled=false so they
# don't auto-scrape until the user opts them in from /admin/index.
EXTRA_ARGS="${TROVE_DETECT_EXTRA:-}"

{
  echo "=== Trove detect-new-sets start: $(date -u +%FT%TZ) ==="
  # shellcheck disable=SC2086
  node_modules/.bin/tsx scripts/detect-new-sets.ts $EXTRA_ARGS
  EXIT=$?
  echo "=== Trove detect-new-sets end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"detect-new-sets failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
