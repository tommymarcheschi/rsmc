-- Trove: live_listings cache + SWR read path
--
-- WHY: the card page currently calls the live-listings provider on every
-- single load (src/routes/card/[id]/+page.server.ts → getLiveListingsProvider().fetchForCard).
-- That's fine for the stub (sync, deterministic) but as soon as a real
-- provider lands (eBay Browse, 130point scrape, residential-proxy scrape),
-- every card page view = an outbound API/scrape call. Three problems:
--   1. Wasted budget (eBay Browse = 5k/day cap),
--   2. Page latency spikes on cold sources,
--   3. No way to feed a "delta hunter" surface (SELECT … FROM live_listings
--      JOIN card_index) — the data has to be persisted somewhere first.
--
-- This table stores the LAST result per (card_id, query_key) so a card page
-- read is a single Postgres lookup, and the provider is only invoked when
-- the row is missing or older than the TTL (default 6h). Stale-while-
-- revalidate: when the row exists but is stale, the page returns cached
-- immediately and a background fetch is fired to refresh for next time.
--
-- query_key encodes the filter combo so PSA-only / raw-only / all get
-- their own cache rows — otherwise a PSA-10-only fetch would clobber the
-- general "all listings" row.
--
-- ADD-ONLY and idempotent.

create table if not exists live_listings_cache (
    card_id           text        not null,
    -- Filter key: "all" | "grader=PSA&grade=10" | "raw_only=1" | etc.
    -- Derived in app code so the schema doesn't have to grow a column for
    -- every new filter dimension. Stable serialization is the caller's job.
    query_key         text        not null default 'all',
    -- Which provider produced this row: 'stub' | 'ebay-browse' | '130point' | ...
    -- Surfaced in UI for honesty labels and used to gate cache TTLs per
    -- source (real providers may want longer TTLs than the stub).
    provider          text        not null,
    -- Full LiveListingsResult — listings array + fetched_at + source + query
    -- + lowest_ask_cents. Storing the whole object means a cache hit needs
    -- zero transformation back into what the UI already consumes.
    payload           jsonb       not null,
    -- Denormalized for cheap sort/filter queries — the "delta hunter"
    -- surface ("biggest gap between last sold and cheapest active ask")
    -- needs to range-scan this without parsing payload jsonb on every row.
    lowest_ask_cents  integer,
    listings_count    integer     not null default 0,
    fetched_at        timestamptz not null default now(),
    primary key (card_id, query_key)
);

-- Range-scan support for the delta-hunter feed and any "all cards with
-- live asks under $X" surface. Partial index — only rows that actually
-- have a price are useful for sort/filter.
create index if not exists live_listings_cache_lowest_ask_idx
    on live_listings_cache (lowest_ask_cents)
    where lowest_ask_cents is not null;

-- Drives the warming cron's "what's stalest?" query. Covers staleness
-- sweeps and the SWR check ("is this row older than TTL?").
create index if not exists live_listings_cache_fetched_at_idx
    on live_listings_cache (fetched_at);

-- RLS posture matches migration 018: anon = SELECT only, writes are
-- service-role only (the SWR wrapper does writes via supabaseAdmin).
-- Without an explicit anon SELECT policy, the card page (which reads via
-- the publishable-key anon client during SSR) gets a silent HTTP-200 with
-- zero rows — the exact bug project_publishable_key_card_index documents.
alter table live_listings_cache enable row level security;
grant select on live_listings_cache to anon, authenticated;
drop policy if exists "public read live_listings_cache" on live_listings_cache;
create policy "public read live_listings_cache" on live_listings_cache
    for select to anon, authenticated using (true);
