# Trove

Personal Pokémon TCG tool — indexed card database, market insights, collection tracking, grading ROI, and a natural-language search front end.

## Stack

- SvelteKit + Tailwind (CSS tokens + shared `<Icon>` component in `src/lib/components/`)
- Supabase (Postgres + RLS disabled for single-user)
- PriceCharting (prices + pop) and TCGPlayer search API (prices for new sets the pokemontcg.io API hasn't indexed yet)
- Claude Haiku 4.5 via `@anthropic-ai/sdk` for natural-language → DSL translation on the hunt-mode search bar

## Develop

```bash
npm install
cp .env.example .env.local   # then fill in Supabase + API keys
npm run dev
```

Environment variables (`.env.local`):

- `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required for all data reads/writes
- `POKEMON_TCG_API_KEY` — recommended (higher rate limits on pokemontcg.io)
- `ANTHROPIC_API_KEY` — required only for the `✨ Ask` natural-language search
- `DEV_SERVER_URL=http://localhost:5178` — required by `scripts/refresh-index.ts` to proxy PriceCharting through the dev server (bypasses Cloudflare on bare Node)

## Batch jobs

Five launchd plists under `scripts/launchd/` run the background pipeline:

- `com.trove.ingest-conditions` — 02:00 — TCGPlayer per-condition listings
- `com.trove.detect-new-sets` — 03:00 — enroll new releases from pokemontcg.io
- `com.trove.auto-heal-sets` — 03:30 — diff TCG API vs `card_index`, insert missing rows, backfill TCGPlayer prices
- `com.trove.refresh-stale` — 04:00 — re-enrich the oldest `card_index` rows via PriceCharting
- `com.trove.snapshot-card-index` — 05:00 — daily snapshot into `card_index_history`

Install one with:

```bash
cp scripts/launchd/com.trove.auto-heal-sets.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.trove.auto-heal-sets.plist
```

## Migrations

SQL migrations live under `supabase/migrations/`. They're applied manually via the Supabase SQL editor — no tooling reads this directory at build time. When a new migration ships, the commit message flags it for application.

## Tests

```bash
npm run check   # svelte-check + tsc
npm test        # vitest
```

## Structure

- `src/routes/` — pages + server loaders
- `src/lib/services/` — scrapers, data services, pure helpers
- `src/lib/components/` — shared UI (Icon, CardThumbnail, CommandPalette, PriceChart, etc.)
- `scripts/` — CLI tooling (enrichment, backfills, auto-heal, cron wrappers)
- `supabase/migrations/` — SQL migrations, applied manually
