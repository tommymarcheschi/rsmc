#!/usr/bin/env bash
# Trove — nightly card-rankings recompute (north star pillar #9).
# Percentile-scores the whole catalog on 6 axes + 3 lenses. Runs at 06:00,
# AFTER the coverage-ledger snapshot (05:30) so it scores the freshest
# acquired data (Track A pop + Track B prices landed overnight).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/rank-cards-$(date +%Y-%m-%d).log"

{
  echo "=== Trove rank-cards start: $(date -u +%FT%TZ) ==="
  node_modules/.bin/tsx scripts/rank-cards.ts
  EXIT=$?
  echo "=== Trove rank-cards end: $(date -u +%FT%TZ) exit=$EXIT ==="
} >>"$LOG_FILE" 2>&1

if [ "${EXIT:-1}" -ne 0 ]; then
  /usr/bin/osascript -e "display notification \"rank-cards failed (exit ${EXIT:-1}). See $LOG_FILE\" with title \"Trove\" sound name \"Basso\"" || true
fi

exit "${EXIT:-1}"
