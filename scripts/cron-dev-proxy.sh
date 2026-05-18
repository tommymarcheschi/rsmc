#!/usr/bin/env bash
# Trove — persistent SvelteKit dev server used purely as the Cloudflare
# proxy for PriceCharting scraping (DEV_SERVER_URL=http://localhost:5178).
# PriceCharting/PSA block bare Node fetch via TLS fingerprinting; the dev
# server's fetch passes consistently. The continuous enrich-worker depends
# on this being up 24/7. launchd KeepAlive restarts it if it dies.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG_DIR="$HOME/Library/Logs/Trove"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-proxy-$(date +%Y-%m-%d).log"

PORT="${TROVE_DEV_PROXY_PORT:-5178}"

echo "=== Trove dev-proxy exec (port $PORT): $(date -u +%FT%TZ) ===" >>"$LOG_FILE"
exec npm run dev -- --port "$PORT" >>"$LOG_FILE" 2>&1
