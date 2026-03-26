# PokéVault — Master Build Plan

Personal Pokémon TCG Collector Intelligence App

## Tech Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Frontend | Svelte 5 (runes) | ✅ Installed |
| Styling | Tailwind CSS v4 | ✅ Installed |
| Backend/DB | Supabase | ✅ Connected (svegxvguwjmixiitneja) |
| Routing | SvelteKit 2 | ✅ Installed |
| Charts | Chart.js | ✅ Installed + PriceChart component |
| Deploy | Vercel (adapter-vercel) | ✅ Configured |

## API Layer

| Service | Purpose | URL | Cost | Priority |
|---------|---------|-----|------|----------|
| Pokémon TCG API | Card data, sets, images | api.pokemontcg.io/v2 | Free | ✅ Integrated |
| PokéAPI | Pokédex enrichment (types, flavor text, evolutions) | pokeapi.co | Free | ✅ Integrated |
| PokeTrace | Multi-marketplace pricing (TCGPlayer + eBay + CardMarket), arbitrage, trending | api.poketrace.com | Free tier | ✅ Integrated (needs API key) |
| PokemonPriceTracker | PSA/CGC/BGS grading prices, ROI, population reports, price history | pokemonpricetracker.com/api | Free + $29/mo Pro | ✅ Integrated (needs API key) |

## Route Structure

| Route | Page | Status |
|-------|------|--------|
| `/` | Dashboard (portfolio stats, quick actions, onboarding) | ✅ Live with Supabase |
| `/browse` | Card browser (infinite scroll, search, set/type/rarity filters) | ✅ Live with TCG API |
| `/card/[id]` | Card detail (multi-marketplace prices, graded prices, price chart, Pokédex, evolution chain) | ✅ Full feature |
| `/collection` | Collection manager (add modal, quantity +/-, condition, purchase tracking) | ✅ Full CRUD |
| `/watchlist` | Watchlist (alert toggle, market prices, remove) | ✅ Full CRUD |
| `/grading` | Grading center (ROI calculator, fee reference, submission tracker with status flow) | ✅ Full feature |
| `/insights` | Market insights (trending, arbitrage, biggest movers — tabbed view) | ✅ Full feature |
| `/settings` | API connections, preferences, currency | ✅ Scaffolded |

## Supabase Schema (defined in `supabase/migrations/001_initial_schema.sql`)

```
collection  (id, card_id, quantity, condition, purchase_price, purchase_date, notes)
watchlist   (id, card_id, target_price, alert_enabled)
grading     (id, card_id, service, tier, status, submitted_date, returned_date, grade, cost, final_value)
price_cache (id, card_id, source, raw_price, graded_prices, cached_at)
```

## API Endpoints (in `src/routes/api/`)

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/cards` | GET | Proxy for TCG API card search (used by infinite scroll) |
| `/api/collection` | GET, POST, PATCH, DELETE | Collection CRUD |
| `/api/watchlist` | GET, POST, PATCH, DELETE | Watchlist CRUD |
| `/api/grading` | GET, POST, PATCH, DELETE | Grading submissions CRUD |

## Reusable Components (in `src/lib/components/`)

- `CardThumbnail` — Card grid item with lazy image, price badge, rarity
- `PriceBadge` — Price display with up/down change indicator
- `PriceChart` — Chart.js line chart for price history (green up / red down, dark theme)
- `SetProgress` — Set completion progress bar
- `GradeROICard` — Grading ROI summary card (grade vs sell raw)

## API Service Modules (in `src/lib/services/`)

- `tcg-api.ts` — searchCards, getCard, getSets, getSet, getCardsBySet, searchByName
- `pokeapi.ts` — getPokemon, getEvolutionChain
- `poketrace.ts` — getCardPrices, getArbitrageOpportunities, getTrendingCards, getBiggestMovers
- `price-tracker.ts` — getGradedPrices, getPopulationReport, getGradingROI, getPriceHistory, getGradingFees
- `supabase.ts` — Supabase client instance

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
- [x] **Phase 1B** — Card browser with TCG API (infinite scroll grid, live data, search, filters)
- [x] **Phase 1C** — Card detail page + PokéAPI enrichment (flavor text, types, evolutions, attacks, weaknesses)
- [x] **Phase 1D** — Collection manager + watchlist + dashboard with live Supabase data

### Phase 2 — Pricing Intelligence
- [x] **Phase 2A** — Multi-marketplace pricing on card detail (PokeTrace: TCGPlayer + eBay + CardMarket side-by-side, graded prices by service, price caching to Supabase)
- [x] **Phase 2B** — Price history charts (Chart.js line chart with dark theme) + portfolio stats on insights page
- [x] **Phase 2C** — US vs EU arbitrage tab on insights page (CardMarket vs TCGPlayer comparison with savings %)

### Phase 3 — Grading Tools
- [x] **Phase 3** — Full grading suite: ROI calculator (raw value × grade multiplier - fees = profit), grading fee reference for PSA/CGC/BGS/SGC, submission tracker with full status flow (pending → submitted → received → grading → shipped → complete), grade entry on completion

### Phase 4 — Advanced Insights
- [x] **Phase 4A** — Market trends: trending cards, biggest gainers/losers (tabbed view on insights page)
- [ ] **Phase 4B** — Price alerts (Supabase realtime notifications when card hits target price)
- [ ] **Phase 4C** — Sell optimizer (for each owned card: "sell raw", "grade then sell", or "hold")
- [ ] **Phase 4D** — Set completion tracker (visual checklist per set: owned vs missing + cost to complete)

---

## What to Do Next

1. **Get API keys** — Sign up at poketrace.com/developers and pokemonpricetracker.com for pricing data
2. **Add keys to `.env.local`** — Add `POKETRACE_API_KEY` and `PRICE_TRACKER_API_KEY`
3. **Wire API keys into service modules** — Update `poketrace.ts` and `price-tracker.ts` to read keys from env and pass as headers
4. **Deploy to Vercel** — Connect repo, add env vars, deploy
5. **Phase 4B** — Price alerts (Supabase realtime subscriptions + watchlist target price triggers)
6. **Phase 4C** — Sell optimizer (compare raw sale vs graded sale vs hold for each collection card)
7. **Phase 4D** — Set completion tracker (fetch all cards in a set, cross-reference with collection)

## Key Architecture Decisions

- **Server-side data loading** — All pages use `+page.server.ts` to fetch data on the server (faster initial load, SEO-friendly)
- **Client-side infinite scroll** — Browse page loads initial 24 cards server-side, then fetches more via `/api/cards` endpoint
- **Price caching** — Card detail page caches PokeTrace prices to Supabase `price_cache` table to reduce API calls
- **Graceful degradation** — All external API calls have try/catch with null fallbacks. If PokeTrace/PriceTracker APIs are unavailable, the app still works with TCGPlayer data from the card object
- **Grading fee defaults** — Built-in fallback fee data for PSA/CGC/BGS/SGC so ROI calculator works without PriceTracker API

## UI Design Direction

- Dark mode first — Deep navy/black (`#0a0e1a`) background, card images pop
- Card grid — Responsive 2-6 column grid, hover reveals price badge
- Card detail — Full bleed card image left, data panels right
- Color coding — Green = price up, Red = price down, Gold = grading opportunity
- Custom theme colors defined in `src/app.css` via `@theme` block
- Tabbed interfaces on insights page for clean navigation between data views
