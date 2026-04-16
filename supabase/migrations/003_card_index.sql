-- Trove: Sleeper Hunter — Card Index + Scrape Cache
--
-- Background-indexed card data enriched with PSA/TAG pop counts and
-- PriceCharting graded prices. Powers the /browse?mode=hunt advanced
-- filter that finds low-pop, old-set, holo cards with high raw→PSA10 delta.

-- ============================================
-- Scrape Cache: generic key/value for HTML scrapers
-- ============================================
-- Replaces the broken price_cache path that /api/psa was using
-- (it wrote to cache_key/data/fetched_at columns that didn't exist).
-- Keeps price_cache untouched for its original TCGPlayer purpose.

create table if not exists scrape_cache (
    id uuid primary key default gen_random_uuid(),
    cache_key text not null unique,
    source text not null,        -- 'psa' | 'tag' | 'pricecharting'
    data jsonb not null,
    fetched_at timestamptz not null default now()
);

create index if not exists idx_scrape_cache_key on scrape_cache (cache_key);
create index if not exists idx_scrape_cache_source_fetched on scrape_cache (source, fetched_at desc);

alter table scrape_cache disable row level security;

-- ============================================
-- Tracked Sets: which sets are in the background index
-- ============================================

create table if not exists tracked_sets (
    set_id text primary key,
    set_name text not null,
    series text,
    release_date date not null,
    total_cards integer,
    enabled boolean not null default true,
    last_indexed_at timestamptz,
    last_index_duration_ms integer,
    last_index_error text,
    added_at timestamptz not null default now()
);

create index if not exists idx_tracked_sets_release on tracked_sets (release_date desc);
create index if not exists idx_tracked_sets_enabled on tracked_sets (enabled);

alter table tracked_sets disable row level security;

-- ============================================
-- Card Index: denormalized enrichment row per card
-- ============================================
-- This is THE table that /browse?mode=hunt queries. Every column is
-- designed for a specific filter or sort. Generated columns let SQL
-- sort on computed deltas without application logic.

create extension if not exists pg_trgm;

create table if not exists card_index (
    -- Identity
    card_id text primary key,
    name text not null,
    set_id text not null,
    set_name text not null,
    set_series text,
    set_release_date date not null,
    card_number text,
    rarity text,
    supertype text,
    subtypes text[] default '{}',
    types text[] default '{}',
    artist text,
    image_small_url text,
    image_large_url text,

    -- Printing presence (derived from tcgplayer.prices keys)
    has_normal boolean not null default false,
    has_holofoil boolean not null default false,
    has_reverse_holofoil boolean not null default false,
    has_first_edition boolean not null default false,
    printing_variants text[] default '{}',

    -- Raw (ungraded) prices
    tcg_normal_market numeric(10, 2),
    tcg_holofoil_market numeric(10, 2),
    tcg_reverse_holofoil_market numeric(10, 2),
    tcg_headline_market numeric(10, 2),      -- highest-market printing
    tcg_headline_low numeric(10, 2),         -- .low on that same printing
    raw_nm_price numeric(10, 2),             -- PriceCharting Ungraded, fallback tcg headline
    raw_source text,                          -- 'pricecharting' | 'tcgplayer'
    raw_fetched_at timestamptz,

    -- Graded prices (real numbers only — no multipliers)
    psa10_price numeric(10, 2),
    psa10_source text,                        -- 'pricecharting'
    tag10_price numeric(10, 2),
    tag10_source text,
    graded_prices_fetched_at timestamptz,

    -- Computed deltas (generated columns — SQL sort is trivial)
    psa10_delta numeric(10, 2)
        generated always as (psa10_price - raw_nm_price) stored,
    psa10_multiple numeric(10, 2)
        generated always as (
            case when raw_nm_price > 0 then round(psa10_price / raw_nm_price, 2) else null end
        ) stored,

    -- Pop (real scraped counts, nullable when scraper missed)
    psa_pop_total integer,
    psa_pop_10 integer,
    psa_gem_rate numeric(5, 2),
    psa_fetched_at timestamptz,
    tag_pop_total integer,
    tag_pop_10 integer,
    tag_fetched_at timestamptz,

    -- Combined pop for the "low pop" filter.
    -- NULL-coalesced to 0 so missing data doesn't hide potential sleepers.
    combined_pop_total integer
        generated always as (coalesce(psa_pop_total, 0) + coalesce(tag_pop_total, 0)) stored,

    -- Provenance
    last_enriched_at timestamptz not null default now(),
    enrich_version smallint not null default 1,
    enrich_errors jsonb default '{}'
);

-- Filter indexes: one per primary sort/filter column.
-- Postgres will intersect for composite filters.
create index if not exists idx_card_index_pop on card_index (combined_pop_total);
create index if not exists idx_card_index_release on card_index (set_release_date);
create index if not exists idx_card_index_delta on card_index (psa10_delta desc nulls last);
create index if not exists idx_card_index_raw_price on card_index (raw_nm_price);
create index if not exists idx_card_index_psa10_price on card_index (psa10_price desc nulls last);
create index if not exists idx_card_index_set on card_index (set_id);
create index if not exists idx_card_index_holo on card_index (has_holofoil) where has_holofoil = true;
create index if not exists idx_card_index_reverse on card_index (has_reverse_holofoil) where has_reverse_holofoil = true;
create index if not exists idx_card_index_name_trgm on card_index using gin (name gin_trgm_ops);

alter table card_index disable row level security;

-- ============================================
-- Index Jobs: track batch enrichment runs
-- ============================================

create table if not exists index_jobs (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('full', 'set', 'stale', 'single')),
    target text,
    status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
    total_cards integer not null default 0,
    processed_cards integer not null default 0,
    errors integer not null default 0,
    started_at timestamptz,
    finished_at timestamptz,
    last_error text,
    created_at timestamptz not null default now()
);

create index if not exists idx_index_jobs_created on index_jobs (created_at desc);

alter table index_jobs disable row level security;
