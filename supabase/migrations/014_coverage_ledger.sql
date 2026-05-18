-- Trove: coverage_ledger — the data-acquisition engine's scoreboard
--
-- The catalog is complete (~20k cards, 172/172 English sets) but graded
-- DATA is the crisis: as of 2026-05-17 PSA10 price exists for ~6.6% of
-- cards, PSA pop ~5%, CGC pop ~3%. The self-healing data engine's single
-- KPI is graded-data coverage climbing toward ~95%. You can't run a
-- self-healing loop without a scoreboard — this table is it.
--
-- One row per (snapshot_date, set_id), written nightly AFTER the
-- acquisition crons run, so each day captures the post-acquisition state.
-- Per-set rows; global daily totals are a trivial sum() aggregate.
-- Idempotent: re-running the same day upserts by (snapshot_date, set_id).
--
-- Counts are over card_index rows for that set (our indexed universe).
-- "stale" = last_enriched_at older than the 7-day refresh threshold.

create table if not exists coverage_ledger (
    snapshot_date date not null default current_date,
    set_id text not null,
    set_name text,

    indexed integer not null default 0,        -- card_index rows for this set
    raw_priced integer not null default 0,     -- raw_nm_price not null
    psa10_priced integer not null default 0,   -- psa10_price not null
    psa_pop integer not null default 0,        -- psa_pop_total not null
    cgc_pop integer not null default 0,        -- cgc_pop_total not null
    stale integer not null default 0,          -- last_enriched_at < now()-7d

    recorded_at timestamptz not null default now(),

    primary key (snapshot_date, set_id)
);

create index if not exists idx_cl_date on coverage_ledger (snapshot_date desc);
create index if not exists idx_cl_set_date on coverage_ledger (set_id, snapshot_date desc);

alter table coverage_ledger disable row level security;
