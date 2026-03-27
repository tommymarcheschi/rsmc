-- Trove: Price History Table
-- Stores daily price snapshots from TCGPlayer data (via Pokemon TCG API)
-- One row per card per variant per day — upsert-safe

create table if not exists price_history (
    id uuid primary key default gen_random_uuid(),
    card_id text not null,
    variant text not null,
    low numeric(10, 2),
    mid numeric(10, 2),
    high numeric(10, 2),
    market numeric(10, 2),
    direct_low numeric(10, 2),
    recorded_at date not null default current_date,
    unique (card_id, variant, recorded_at)
);

create index if not exists idx_price_history_card_id on price_history (card_id);
create index if not exists idx_price_history_recorded_at on price_history (recorded_at);
create index if not exists idx_price_history_card_date on price_history (card_id, recorded_at desc);
