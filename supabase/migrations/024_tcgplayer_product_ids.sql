-- Trove: cached TCGPlayer productId per card_id
--
-- WHY: scripts/ingest-condition-prices.ts has been silently dead since
-- 2026-05-18 because `https://prices.pokemontcg.io/tcgplayer/{card_id}` —
-- the productId redirect endpoint — started returning 404 universally,
-- and the fallback api.pokemontcg.io v2 endpoint times out on our IP
-- (same root cause as project_pokemontcg_ratelimit). The script swallows
-- the failure and returns 'noid', so the cron exits 0 with zero new
-- sale_events. The 8–13 "snapshots per day" telemetry was a lie: cron
-- was just re-deriving today's snapshot from stale sale_events.
--
-- This table is the missing piece. Every successful card_id → productId
-- resolution is cached here, so future scrapes are a single Postgres
-- lookup. The resolver's external-call fallback chain (pokemontcg v2 →
-- TCGPlayer search API → legacy redirect) only fires on the FIRST run
-- per card; once cached, even a total pokemontcg.io outage doesn't
-- block the scrape.
--
-- We also store the source + resolved_at so we can spot drift: a row
-- resolved via TCGPlayer's own search API is more trustworthy than one
-- resolved via the legacy redirect, and a row that hasn't been verified
-- in N months can be re-checked on a background cadence.
--
-- ADD-ONLY and idempotent.

create table if not exists tcgplayer_product_ids (
    card_id      text         primary key references card_index(card_id) on delete cascade,
    product_id   bigint       not null,
    -- 'pokemontcg_v2' | 'tcgplayer_search' | 'pokemontcg_redirect' | 'manual'
    -- Tracked so we can favor higher-trust sources on conflict + age out
    -- low-trust rows for re-verification.
    source       text         not null,
    resolved_at  timestamptz  not null default now(),
    verified_at  timestamptz  null
);

-- Reverse lookup: occasionally the scraper has a productId and needs to
-- map back to card_id (e.g. ingesting a TCGPlayer listings dump). Small
-- table so this is cheap to maintain.
create index if not exists tcgplayer_product_ids_product_id_idx
    on tcgplayer_product_ids (product_id);

-- Re-verification scheduling — pick the stalest N rows and re-check.
create index if not exists tcgplayer_product_ids_verified_at_idx
    on tcgplayer_product_ids (verified_at nulls first);

-- RLS posture: same as the rest of the data-engine plumbing. Anon SELECT
-- so future read paths (e.g. a "verify a productId before scraping"
-- guard) don't need service-role; writes are service-role only.
alter table tcgplayer_product_ids enable row level security;

drop policy if exists "tcgplayer_product_ids: anon select" on tcgplayer_product_ids;
create policy "tcgplayer_product_ids: anon select"
    on tcgplayer_product_ids for select
    to anon
    using (true);
