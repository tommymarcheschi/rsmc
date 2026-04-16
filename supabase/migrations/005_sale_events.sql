-- Trove: Data Sovereignty Phase 1 — per-condition raw pricing
--
-- Two new tables:
--
--   sale_events
--     Append-only log of every observed listing/sale across any
--     marketplace. Raw events are kept forever so snapshots can be
--     re-derived with different weighting without re-scraping.
--     `condition` is inferred from free-text titles for eBay-style
--     sources, or taken directly from structured listings (TCGPlayer).
--     NULL means the inferrer couldn't tell — those rows are excluded
--     from snapshot math but retained for later re-analysis.
--
--   condition_price_snapshots
--     Nightly rollup per (card_id, condition, snapshot_date). Stores
--     median / p25 / p75 in cents + sample_count so the UI can show
--     low-sample caveats honestly (n<10). `freshness_score` decays as
--     the underlying events age, letting downstream consumers weight
--     recent-vs-stale without re-querying sale_events.
--
-- Powers the "Price by Condition" ladder on card detail pages
-- (NM / LP / MP / HP / DMG). This per-condition structure is the
-- Phase 1 differentiator — no other public aggregator indexes it.

-- ============================================
-- Raw event log — every observation we ingest
-- ============================================

create table if not exists sale_events (
    id uuid primary key default gen_random_uuid(),

    -- Card identity (card_id is text to match card_index.card_id)
    card_id text not null,

    -- Source & identity within that source (for dedup)
    marketplace text not null,          -- 'tcgplayer' | 'ebay' | 'pwcc' | ...
    external_id text,                   -- listing id, item id, cert id, etc.
    title text,                         -- original listing title for audit

    -- Money
    price_cents integer not null check (price_cents >= 0),
    currency text not null default 'USD',

    -- Condition (raw) — nullable when inference was inconclusive
    condition text check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
    condition_confidence numeric(3, 2) check (
        condition_confidence is null
        or (condition_confidence >= 0 and condition_confidence <= 1)
    ),

    -- Grading (nullable — only populated for graded sales in later phases)
    grade numeric(3, 1),
    grader text check (grader in ('PSA', 'CGC', 'BGS', 'SGC', 'TAG') or grader is null),

    -- Event type — did we see a listing price or a closed sale?
    -- 'listing' = active asking price, 'sold' = realized sale.
    event_type text not null default 'listing'
        check (event_type in ('listing', 'sold')),

    -- When the source says the event happened vs when we wrote the row
    observed_at timestamptz not null,
    inserted_at timestamptz not null default now()
);

-- (marketplace, external_id) dedup — same listing seen twice should not
-- double-count. NULL external_id is allowed (rare) and will not dedup.
create unique index if not exists uq_sale_events_marketplace_external
    on sale_events (marketplace, external_id)
    where external_id is not null;

create index if not exists idx_sale_events_card_observed
    on sale_events (card_id, observed_at desc);
create index if not exists idx_sale_events_marketplace_observed
    on sale_events (marketplace, observed_at desc);
create index if not exists idx_sale_events_condition
    on sale_events (card_id, condition, observed_at desc)
    where condition is not null;

alter table sale_events disable row level security;

-- ============================================
-- Nightly rollups — what the UI reads
-- ============================================

create table if not exists condition_price_snapshots (
    card_id text not null,
    condition text not null
        check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
    snapshot_date date not null,

    -- Aggregates (integers for money = cents, exact)
    median_cents integer not null,
    p25_cents integer not null,
    p75_cents integer not null,
    sample_count integer not null check (sample_count >= 0),

    -- 0..1 — higher means more recent events dominate the aggregate.
    -- Computed at snapshot time from age distribution of contributing
    -- sale_events.
    freshness_score numeric(3, 2) not null
        check (freshness_score >= 0 and freshness_score <= 1),

    computed_at timestamptz not null default now(),

    primary key (card_id, condition, snapshot_date)
);

create index if not exists idx_condition_snapshots_card_date
    on condition_price_snapshots (card_id, snapshot_date desc);

alter table condition_price_snapshots disable row level security;
