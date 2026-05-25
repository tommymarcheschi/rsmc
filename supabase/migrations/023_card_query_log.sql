-- Trove: card view popularity log (drives priority warming + delta-hunter)
--
-- WHY: the live_listings cache (migration 022) needs a "warming" cron that
-- pre-fetches popular cards before users visit them — otherwise the first
-- visitor to a cold card pays the provider-latency tax. To pick what's
-- popular, we need to know what's actually being viewed. This table is the
-- raw signal: every card page load appends one row, fire-and-forget.
--
-- Append-only intentionally. Roll-ups + cleanup (e.g. "delete rows older
-- than 90d", "materialize top-100 weekly") happen in app/cron code, not
-- here. Keeping the source table dumb means we can change the rollup
-- without losing history.
--
-- Volume math: if we hit 100k card-page views/month, that's ~100k rows/mo
-- = ~1.2M/yr. At ~50 bytes/row that's ~60MB/yr — trivial. Long-term we
-- can add a partition or a 90-day TTL but premature for current traffic.
--
-- ADD-ONLY and idempotent.

create table if not exists card_query_log (
    -- Surrogate PK so duplicate (card_id, hit_at) within the same ms is
    -- legal (concurrent SSR renders for the same card). bigserial > uuid
    -- here because we don't need cross-shard uniqueness.
    id      bigserial   primary key,
    card_id text        not null,
    hit_at  timestamptz not null default now()
);

-- Top-N-by-recent-hits query: WHERE hit_at > now() - '7 days' GROUP BY
-- card_id ORDER BY count(*) DESC LIMIT 100. The (card_id, hit_at) index
-- supports both the group-by and the per-card "last viewed at" lookup the
-- card page may want eventually.
create index if not exists card_query_log_card_id_hit_at_idx
    on card_query_log (card_id, hit_at desc);

-- Time-range scans for window queries and eventual cleanup
-- (DELETE … WHERE hit_at < now() - '90 days').
create index if not exists card_query_log_hit_at_idx
    on card_query_log (hit_at desc);

-- RLS: writes are service-role only (the card page server load uses
-- supabaseAdmin to insert). NO anon read policy — this is internal
-- popularity data, not user-facing. The warming cron also runs as
-- service-role so it bypasses RLS anyway.
alter table card_query_log enable row level security;
