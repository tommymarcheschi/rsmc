-- Trove migration 015: index card_index.last_enriched_at
--
-- The stale-refresh cron selects the oldest-enriched cards with:
--   select card_id from card_index
--   where last_enriched_at < now()-7d
--   order by last_enriched_at asc limit N
--
-- migration 003 indexed many card_index columns but NOT last_enriched_at,
-- so this runs as a full seq scan + sort over ~20k rows every run. Fast
-- when the DB is idle (~1.5s) but it times out intermittently under
-- concurrent cron load (ingest-conditions writes ~77k sale_events in an
-- overlapping window). The timeout error was being swallowed by the
-- script, surfacing as a false "No stale rows found." — which is how the
-- catalog silently drifted to 99% stale. This index turns the ordered
-- scan into an index scan and removes the timeout.

create index if not exists idx_card_index_last_enriched
    on card_index (last_enriched_at asc);
