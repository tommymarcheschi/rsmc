-- Trove Initial Schema
-- Run this in your Supabase SQL editor to set up all tables

-- ============================================
-- Collection: Cards you own
-- ============================================
create table if not exists collection (
    id uuid primary key default gen_random_uuid(),
    card_id text not null,
    quantity integer not null default 1 check (quantity > 0),
    condition text not null default 'NM' check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
    purchase_price numeric(10, 2),
    purchase_date date,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_collection_card_id on collection (card_id);

-- ============================================
-- Watchlist: Cards you're tracking to buy
-- ============================================
create table if not exists watchlist (
    id uuid primary key default gen_random_uuid(),
    card_id text not null unique,
    target_price numeric(10, 2),
    alert_enabled boolean not null default true,
    created_at timestamptz not null default now()
);

create index idx_watchlist_card_id on watchlist (card_id);

-- ============================================
-- Grading: Grading submissions tracker
-- ============================================
create table if not exists grading (
    id uuid primary key default gen_random_uuid(),
    card_id text not null,
    service text not null check (service in ('PSA', 'CGC', 'BGS', 'SGC')),
    tier text not null default 'regular' check (tier in ('economy', 'regular', 'express', 'super_express')),
    status text not null default 'pending' check (status in ('pending', 'submitted', 'received', 'grading', 'shipped', 'complete')),
    submitted_date date,
    returned_date date,
    grade numeric(3, 1),
    cost numeric(10, 2),
    final_value numeric(10, 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_grading_card_id on grading (card_id);

-- ============================================
-- Price Cache: Avoid hitting APIs constantly
-- ============================================
create table if not exists price_cache (
    id uuid primary key default gen_random_uuid(),
    card_id text not null,
    source text not null,
    raw_price numeric(10, 2),
    graded_prices jsonb default '{}',
    cached_at timestamptz not null default now(),
    unique (card_id, source)
);

create index idx_price_cache_card_id on price_cache (card_id);
create index idx_price_cache_cached_at on price_cache (cached_at);

-- ============================================
-- Auto-update updated_at timestamps
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger collection_updated_at
    before update on collection
    for each row execute function update_updated_at();

create trigger grading_updated_at
    before update on grading
    for each row execute function update_updated_at();

-- ============================================
-- Row Level Security
-- ============================================
-- Trove is a single-user app gated by TROVE_PASSWORD at the hooks layer
-- (src/hooks.server.ts). Auth lives in front of the whole app, not at the
-- DB row level. Explicitly disable RLS on every table so the publishable
-- key can read/write — newer Supabase projects default to RLS-enabled and
-- will silently block writes from the anon key otherwise. These statements
-- are idempotent: running them on an existing DB where RLS was never enabled
-- is a no-op.
alter table collection disable row level security;
alter table watchlist disable row level security;
alter table grading disable row level security;
alter table price_cache disable row level security;
