# Trove — Master Build Plan

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
| `/analytics` | Analytics (value scanner, card comparison, comp analysis) | ✅ Full feature |
| `/sets` | Set completion tracker (owned vs missing, cost to complete) | ✅ Full feature |
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
| `/api/ebay-sold` | GET | eBay sold listings scraper (with Supabase caching) |
| `/api/tcgplayer-sales` | GET | TCGPlayer recent sales scraper (with caching) |
| `/api/psa` | GET | PSA cert lookup + pop report scraper (with caching) |

## Reusable Components (in `src/lib/components/`)

- `CardThumbnail` — Card grid item with lazy image, price badge, rarity
- `PriceBadge` — Price display with up/down change indicator
- `PriceChart` — Chart.js line chart for price history (green up / red down, dark theme)
- `SetProgress` — Set completion progress bar
- `GradeROICard` — Grading ROI summary card (grade vs sell raw)
- `ComparisonChart` — Multi-dataset Chart.js overlay for comparing card price trends

## API Service Modules (in `src/lib/services/`)

- `tcg-api.ts` — searchCards, getCard, getSets, getSet, getCardsBySet, searchByName
- `pokeapi.ts` — getPokemon, getEvolutionChain
- `poketrace.ts` — getCardPrices, getArbitrageOpportunities, getTrendingCards, getBiggestMovers
- `price-tracker.ts` — getGradedPrices, getPopulationReport, getGradingROI, getPriceHistory, getGradingFees
- `analytics.ts` — Value scoring, comp analysis, trend detection, simulated price history
- `ebay-scraper.ts` — searchEbaySold (scrapes eBay completed/sold listings)
- `tcgplayer-scraper.ts` — scrapeTCGPlayerPrices, scrapeTCGPlayerSearch (scrapes TCGPlayer product pages)
- `psa-scraper.ts` — searchPSAPop, lookupPSACert (scrapes PSA pop reports + cert verification)
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
- [x] **Phase 4D** — Set completion tracker (visual checklist per set: owned vs missing + cost to complete)

### Phase 6 — Analytics & Scrapers
- [x] **Phase 6A** — Analytics page: value scanner (undervalued card scoring), card comparison (multi-chart overlay with trend signals), comp analysis (all printings price comparison)
- [x] **Phase 6B** — Portfolio valuation on dashboard (current market value, gain/loss %, top holdings)
- [x] **Phase 6C** — Custom scrapers: eBay sold listings, TCGPlayer sales, PSA pop reports
- [x] **Phase 6D** — Card detail integration: eBay sold comps section, PSA population data with grade distribution

### Phase 5 — UI Polish
- [x] **Phase 5A** — Theme overhaul: warm Pokeball-inspired palette (red/purple/gold), gradient branding, SVG nav icons, card glow effects, style guide page
- [x] **Phase 5B** — Mobile responsiveness: responsive headings, touch targets, mobile grids, modal sizing, filter stacking

---

## What to Do Next

1. **Wire pricing APIs** — Find real pricing data sources and integrate (see Feature Roadmap below)
2. **Phase 4B** — Price alerts (Supabase realtime subscriptions + watchlist target price triggers)
3. **Phase 4C** — Sell optimizer (compare raw sale vs graded sale vs hold for each collection card)
4. **Phase 4D** — Set completion tracker (fetch all cards in a set, cross-reference with collection)
5. **Then** — Pick from the Feature Roadmap below based on what gives you the most market insight

---

## Feature Roadmap — Total Market Intelligence

### Tier 1: Core Market Data (highest impact)

| Feature | Description | Data Source |
|---------|-------------|-------------|
| **Live Price Engine** | Real TCGPlayer/eBay sold prices on every card, updated daily. Replace placeholder PokeTrace with a real scraper or API. | TCGPlayer API, eBay completed listings API, or scrape cardmavin.com |
| **Price History Charts** | 30/90/365-day price graphs for any card. See trends before buying. | Store daily snapshots in Supabase `price_cache`, build time-series |
| **Portfolio Valuation** | Real-time total value of your collection based on current market prices. Track gain/loss vs purchase price. | TCGPlayer market prices x collection quantities |
| **Set Completion Tracker** | For each set: visual grid of owned vs missing, % complete, cost to finish. Filter by what you need. | TCG API set data x collection entries |
| **Price Alerts** | Push/email when a watchlist card drops below your target. Never miss a deal. | Supabase edge function on cron, check watchlist targets vs cached prices |

### Tier 2: Intelligence & Analytics

| Feature | Description | Why It Matters |
|---------|-------------|----------------|
| **Market Heatmap** | Visual heatmap of which sets/types are trending up or down this week | Spot macro trends before they hit |
| **Arbitrage Scanner** | Auto-find cards cheaper on one marketplace vs another (TCGPlayer vs eBay vs CardMarket) | Buy low on one platform, sell high on another |
| **Rarity Distribution** | For your collection: breakdown by rarity tier with value contribution of each | Know where your value is concentrated |
| **Investment Tracker** | Track ROI per card, per set, and overall. Cost basis vs current value with % return | Treat your collection like a real portfolio |
| **"What If" Grading Sim** | For any card: simulate grading outcomes — expected value at each grade (10/9/8) minus fees, probability-weighted profit | Grade smarter, not harder |
| **Buylist Optimizer** | Input a budget. Get the best cards to buy right now ranked by expected appreciation | Spend money where it'll grow fastest |
| **Sell Timing Signal** | Based on price trajectory + seasonality, tell you when a card is at a local peak | Don't sell too early or too late |

### Tier 3: Deep Market Knowledge

| Feature | Description | Why It Matters |
|---------|-------------|----------------|
| **eBay Sold Comps** | Pull actual recent eBay sold listings for a card (price, condition, date) | See what cards really sell for, not asking price |
| **PSA Pop Report Integration** | Show PSA population data alongside prices — low pop + high grade = rare | Find undervalued slabs |
| **Set Release Calendar** | Upcoming set releases with dates, chase cards, pre-order prices | Plan purchases around releases |
| **Meta Impact Tracker** | When a card sees play in competitive decks, flag the price impact | Competitive meta drives prices — catch it early |
| **Seasonal Price Patterns** | Historical analysis: which months are best to buy/sell certain card types | Time the market with data, not gut |
| **Card Condition Guide** | Photo reference for NM/LP/MP/HP with pricing deltas | Price your own cards accurately |
| **Collection Export** | Export full collection as CSV/PDF with values, for insurance or selling | Protect your investment |
| **Deck Builder Value** | Build a deck, see total cost, find cheapest sources for each card | Play and collect in one app |

### Tier 4: Social & Community

| Feature | Description | Why It Matters |
|---------|-------------|----------------|
| **Trade Finder** | Match your duplicates with other users' wants (if you add user accounts) | Trade instead of buy |
| **Collection Sharing** | Public collection page with shareable link | Show off or sell directly |
| **Price Discussion** | Community notes on specific cards ("this will spike because X set rotates") | Crowdsource market intelligence |
| **Deal Feed** | Aggregated deals from r/pokemontcgdeals, Facebook groups, Discord | Never miss a restock or fire sale |

### API & Data Sources to Investigate

| Source | What It Provides | Cost |
|--------|-----------------|------|
| **TCGPlayer API** | Official marketplace prices, product data | Free (partner program) |
| **eBay Browse/Finding API** | Completed/sold listings, real transaction data | Free tier available |
| **Pokémon TCG API** | Card data, sets, images (already integrated) | Free |
| **PokéAPI** | Pokédex data (already integrated) | Free |
| **Scryfall-style approach** | Build your own price aggregator from multiple sources | DIY, free raw data |
| **CardMarket API** | European marketplace prices | Partner program |
| **PSA Cert Verification** | Lookup graded card data by cert number | Free lookup |

---

## Key Architecture Decisions

- **Server-side data loading** — All pages use `+page.server.ts` to fetch data on the server (faster initial load, SEO-friendly)
- **Client-side infinite scroll** — Browse page loads initial 24 cards server-side, then fetches more via `/api/cards` endpoint
- **Price caching** — Card detail page caches PokeTrace prices to Supabase `price_cache` table to reduce API calls
- **Graceful degradation** — All external API calls have try/catch with null fallbacks. If PokeTrace/PriceTracker APIs are unavailable, the app still works with TCGPlayer data from the card object
- **Grading fee defaults** — Built-in fallback fee data for PSA/CGC/BGS/SGC so ROI calculator works without PriceTracker API

## UI Design Direction

- Dark mode first — Warm purple-tinted darks (#12111a), card images pop
- Pokeball-inspired palette — Red accent (#ff5757), purple secondary (#a78bfa), gold for value
- Card grid — Responsive 2-6 column grid, hover glow reveals price badge
- Card detail — Card image left (constrained on mobile), data panels right
- Color coding — Green = price up, Red = price down, Gold = money/value, Purple = interactive, Cyan = data
- Soft corners everywhere — rounded-2xl containers, rounded-xl buttons/inputs
- Motion — stat-card lift, card-glow hover, btn-press active, shimmer loading
- Mobile-first — All layouts responsive from 320px up, touch-friendly targets
- Style guide at `/style-guide` documents full design system
