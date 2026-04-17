-- Trove: tracked_sets.tcgplayer_set_name
--
-- pokemontcg.io (our TCG API) is consistently slow to sync TCGPlayer
-- prices for newly-released sets — the Mega Evolution era arrived with
-- zero `tcgplayer.prices` data for months. Our fallback is hitting
-- TCGPlayer's own search API directly, which requires a kebab-case
-- set slug (e.g. "me03-perfect-order" for ME03). Storing the slug on
-- tracked_sets lets the enricher auto-heal new sets without a human
-- running backfill scripts by hand.
--
-- NULL means: discovery hasn't been attempted yet, or TCGPlayer doesn't
-- carry this set. The auto-heal pass fills in slugs as it finds them.

alter table tracked_sets add column if not exists tcgplayer_set_name text;

-- Timestamp of the last time we successfully backfilled TCGPlayer prices
-- for this set. Lets the auto-heal pass skip sets that are up to date.
alter table tracked_sets add column if not exists tcgplayer_last_backfilled_at timestamptz;
