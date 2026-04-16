-- Trove: Tier 1.5 — real CGC columns
--
-- Fixes a naming misdirect from migration 003: `tag_pop_total`/`tag_pop_10`
-- have been storing CGC population data, not TAG Grading data. The scraper
-- writes cgcPop into those columns because dedicated CGC columns didn't
-- exist. Net effect: CGC 10 price is also being dropped on the floor
-- (scraper captures it, no column to land in).
--
-- This migration adds the proper cgc_* columns, backfills from the misnamed
-- tag_* columns, nulls out the tag_* columns (reserved for future real TAG
-- pop data), and re-generates `combined_pop_total` to reference the
-- correctly-named cgc_pop_total.

alter table card_index add column if not exists cgc10_price numeric(10, 2);
alter table card_index add column if not exists cgc10_source text;
alter table card_index add column if not exists cgc_pop_total integer;
alter table card_index add column if not exists cgc_pop_10 integer;
alter table card_index add column if not exists cgc_gem_rate numeric(5, 2);
alter table card_index add column if not exists cgc_fetched_at timestamptz;

-- Backfill from misnamed tag_pop_* (which have been storing CGC data).
-- Gem rate was never persisted at write time, so derive it now from
-- the totals we have.
update card_index
   set cgc_pop_total = tag_pop_total,
       cgc_pop_10    = tag_pop_10,
       cgc_fetched_at = tag_fetched_at,
       cgc_gem_rate  = case
           when coalesce(tag_pop_total, 0) > 0
               then round((coalesce(tag_pop_10, 0)::numeric / tag_pop_total) * 100, 2)
               else null
       end
 where cgc_pop_total is null and tag_pop_total is not null;

-- Clear the tag_pop_* columns — they were mislabeled. Columns stay on the
-- table for when we actually add TAG pop scraping.
update card_index
   set tag_pop_total = null,
       tag_pop_10    = null,
       tag_fetched_at = null;

-- Replace combined_pop_total's generator to reference cgc_pop_total instead
-- of tag_pop_total. Generated columns can't be ALTERed in place — drop and
-- re-add. Dropping the column also drops the idx_card_index_pop index that
-- referenced it; re-created below.
alter table card_index drop column if exists combined_pop_total;

alter table card_index add column combined_pop_total integer
    generated always as (coalesce(psa_pop_total, 0) + coalesce(cgc_pop_total, 0)) stored;

create index if not exists idx_card_index_pop on card_index (combined_pop_total);
create index if not exists idx_card_index_cgc_pop_10
    on card_index (cgc_pop_10)
    where cgc_pop_10 > 0;
