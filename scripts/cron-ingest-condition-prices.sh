#!/usr/bin/env bash
# Trove — nightly per-condition price ingest (Phase 1)
# Invoked by launchd (see scripts/launchd/com.trove.ingest-conditions.plist).
# Runs with a minimal PATH — do not rely on shell profile.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/ingest-$(date +%Y-%m-%d).log"

# Scope knob — widen over time once we trust the runs.
# Starts with the 5 most-valuable pre-2017 sets (~500 cards, ~15 min).
# Override via $TROVE_INGEST_SETS for smoke tests.
SETS="${TROVE_INGEST_SETS:-base1,base2,base3,base4,base5}"
EXTRA_ARGS="${TROVE_INGEST_EXTRA:-}"

{
  echo "=== Trove ingest start: $(date -u +%FT%TZ) ==="
  echo "Repo: $REPO_DIR"
  echo "Sets: $SETS"
  # shellcheck disable=SC2086
  node_modules/.bin/tsx scripts/ingest-condition-prices.ts --set "$SETS" $EXTRA_ARGS
  EXIT=$?
  echo "=== Trove ingest end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"Ingest failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
