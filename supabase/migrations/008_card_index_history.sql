-- Trove: Tier 2.1 — card_index_history for rising-stars / cooling feeds
--
-- Daily snapshot of card_index prices. Powers momentum queries: 7d/30d
-- % change per card, rank by magnitude × (low pop) for /insights rising-
-- stars. Values are cents-agnostic numeric(10,2) dollars to match
-- card_index; we can shift to integer cents later if storage becomes a
-- concern (20k cards × 365 days ≈ 7M rows/year, fine for Supabase Pro).

create table if not exists card_index_history (
    card_id text not null,
    snapshot_date date not null default current_date,

    raw_nm_price numeric(10, 2),
    psa10_price numeric(10, 2),
    cgc10_price numeric(10, 2),

    recorded_at timestamptz not null default now(),

    primary key (card_id, snapshot_date)
);

create index if not exists idx_cih_date on card_index_history (snapshot_date desc);
create index if not exists idx_cih_card_date on card_index_history (card_id, snapshot_date desc);

alter table card_index_history disable row level security;
