-- Trove: Tier 5.21 — PSA 10 historical price series
--
-- Each PriceCharting product page lists the 30 most recent PSA 10 sold
-- comps with sale date + price + marketplace. Today we keep only the
-- most recent date (psa10_last_sold_at on card_index). Storing the full
-- list unlocks real time-series: last-30-sales, 30/60/90-day windows,
-- rolling medians, price vs time charts.
--
-- Primary key is (card_id, sold_at, price_cents) so re-running enrichment
-- is idempotent — the same sale keeps the same row.

create table if not exists psa10_sales (
    card_id text not null references card_index(card_id) on delete cascade,
    sold_at date not null,
    price_cents integer not null check (price_cents > 0),
    marketplace text,
    first_seen_at timestamptz not null default now(),
    primary key (card_id, sold_at, price_cents)
);

create index if not exists idx_psa10_sales_card_sold
    on psa10_sales (card_id, sold_at desc);

alter table psa10_sales disable row level security;
