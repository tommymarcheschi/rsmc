# PokéVault — Master Build Plan

Personal Pokémon TCG Collector Intelligence App

## Tech Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Frontend | Svelte 5 (runes) | ✅ Installed |
| Styling | Tailwind CSS v4 | ✅ Installed |
| Backend/DB | Supabase | ✅ Connected (svegxvguwjmixiitneja) |
| Routing | SvelteKit 2 | ✅ Installed |
| Charts | Chart.js | ✅ Installed |
| Deploy | Vercel (adapter-vercel) | ✅ Configured |

## API Layer

| Service | Purpose | URL | Cost | Priority |
|---------|---------|-----|------|----------|
| Pokémon TCG API | Card data, sets, images | api.pokemontcg.io/v2 | Free | Must have |
| PokéAPI | Pokédex enrichment (types, flavor text, evolutions) | pokeapi.co | Free | Must have |
| PokeTrace | Multi-marketplace pricing (TCGPlayer + eBay + CardMarket) | api.poketrace.com | Free tier | Must have |
| PokemonPriceTracker | PSA/CGC/BGS grading prices, ROI, population reports | pokemonpricetracker.com/api | Free + $29/mo Pro | Must have |

## Route Structure

| Route | Page | Status |
|-------|------|--------|
| `/` | Dashboard (portfolio value, alerts, top movers) | ✅ Scaffolded |
| `/browse` | Card browser (all sets, filters, infinite scroll) | ✅ Scaffolded |
| `/card/[id]` | Card detail (image, stats, prices, actions) | ✅ Scaffolded |
| `/collection` | Owned cards + quantities + conditions | ✅ Scaffolded |
| `/watchlist` | Price tracking watchlist | ✅ Scaffolded |
| `/grading` | ROI calculator + submission tracker | ✅ Scaffolded |
| `/insights` | Market analytics, arbitrage, trends | ✅ Scaffolded |
| `/settings` | API connections, preferences, currency | ✅ Scaffolded |

## Supabase Schema (defined in `supabase/migrations/001_initial_schema.sql`)

```
collection  (id, card_id, quantity, condition, purchase_price, purchase_date, notes)
watchlist   (id, card_id, target_price, alert_enabled)
grading     (id, card_id, service, tier, status, submitted_date, returned_date, grade, cost, final_value)
price_cache (id, card_id, source, raw_price, graded_prices, cached_at)
```

## Reusable Components (in `src/lib/components/`)

- `CardThumbnail` — Card grid item with lazy image, price badge, rarity
- `PriceBadge` — Price display with up/down change indicator
- `SetProgress` — Set completion progress bar
- `GradeROICard` — Grading ROI summary card (grade vs sell raw)

## API Service Modules (in `src/lib/services/`)

- `tcg-api.ts` — searchCards, getCard, getSets, getSet, getCardsBySet, searchByName
- `pokeapi.ts` — getPokemon, getEvolutionChain
- `poketrace.ts` — getCardPrices, getArbitrageOpportunities
- `price-tracker.ts` — getGradedPrices, getPopulationReport, getGradingROI, getPriceHistory

## Environment Variables Needed (see `.env.example`)

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key-here
POKEMON_TCG_API_KEY=your-api-key-here       # optional, increases rate limit
POKETRACE_API_KEY=your-api-key-here
PRICE_TRACKER_API_KEY=your-api-key-here
```

---

## Build Phases — Progress Tracker

### Phase 1 — Foundation
- [x] **Phase 1A** — SvelteKit + Svelte 5 + Tailwind v4 + Supabase setup + schema
- [ ] **Phase 1B** — Card browser with TCG API (infinite scroll grid, live data)
- [ ] **Phase 1C** — Card detail page + PokéAPI enrichment (flavor text, types, evolutions)
- [ ] **Phase 1D** — Collection manager (add/remove cards, condition tracking, quantities)

### Phase 2 — Pricing Intelligence
- [ ] **Phase 2A** — Live prices on card detail (PokeTrace: TCGPlayer + eBay + CardMarket)
- [ ] **Phase 2B** — Price history charts (7d/30d/6mo/1yr) + portfolio valuation
- [ ] **Phase 2C** — US vs EU arbitrage view

### Phase 3 — Grading Tools
- [ ] **Phase 3** — Full grading suite: ROI calculator, population reports, submission tracker

### Phase 4 — Advanced Insights
- [ ] **Phase 4** — Price alerts, market trends dashboard, sell optimizer, set completion tracker

---

## What to Do Next

1. **~~Set up Supabase project~~** — ✅ Done (credentials in `.env.local`)
2. **Run schema migration** — Execute `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor
3. **Say "Build Phase 1B"** — Wires up the card browser with live TCG API data (infinite scroll, search, filters)

## UI Design Direction

- Dark mode first — Deep navy/black (`#0a0e1a`) background, card images pop
- Card grid — Responsive 2-6 column grid, hover reveals price badge
- Card detail — Full bleed card image left, data panels right
- Color coding — Green = price up, Red = price down, Gold = grading opportunity
- Custom theme colors defined in `src/app.css` via `@theme` block
