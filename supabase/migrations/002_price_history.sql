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

-- Trove is a single-user app gated by TROVE_PASSWORD at the hooks layer
-- (src/hooks.server.ts). Auth lives in front of the whole app, not at the DB
-- row level — matching the RLS posture of the tables in 001_initial_schema.sql.
-- Without this, newer Supabase projects default to RLS-enabled and silently
-- block inserts from the publishable key (which is what the app uses).
alter table price_history disable row level security;
