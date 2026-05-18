-- Trove: Track A — GemRate population columns
--
-- The catalog is complete but graded-data depth is the crisis: PSA pop ~5%,
-- CGC pop ~3%, BGS/SGC nonexistent (no columns), zero pop-velocity signal.
-- GemRate serves an entire set's per-card pop as one request, so a few
-- hundred set-level fetches close the gap that PriceCharting's per-card
-- scrape cannot. See project_gemrate_source.
--
-- migration 003 gave us psa_* pop; 007 gave us cgc_* pop. This migration
-- adds the two missing graders (BGS, SGC), a 30-day pop-velocity count per
-- grader (GemRate's ct_diff_p1 — new grades in the trailing ~30d, the
-- Momentum-axis input for the rankings pillar), and GemRate provenance so
-- the nightly crawl can skip sets whose pop hasn't moved.
--
-- ADD-ONLY and idempotent. combined_pop_total is deliberately NOT touched:
-- it is a stored generated column wired into the /browse hunt filter as
-- PSA+CGC; folding BGS/SGC in would silently shift that filter's meaning.
-- Revisit as a separate, intentional change once rankings land.

-- BGS population (mirror of the cgc_* shape from migration 007)
alter table card_index add column if not exists bgs_pop_total integer;
alter table card_index add column if not exists bgs_pop_10 integer;
alter table card_index add column if not exists bgs_gem_rate numeric(5, 2);
alter table card_index add column if not exists bgs_fetched_at timestamptz;

-- SGC population
alter table card_index add column if not exists sgc_pop_total integer;
alter table card_index add column if not exists sgc_pop_10 integer;
alter table card_index add column if not exists sgc_gem_rate numeric(5, 2);
alter table card_index add column if not exists sgc_fetched_at timestamptz;

-- 30-day pop velocity: absolute count of new grades in the trailing ~30d
-- (GemRate ct_diff_p1). NULL = never synced from GemRate; 0 = synced, flat.
alter table card_index add column if not exists psa_pop_30d integer;
alter table card_index add column if not exists cgc_pop_30d integer;
alter table card_index add column if not exists bgs_pop_30d integer;
alter table card_index add column if not exists sgc_pop_30d integer;

-- GemRate provenance. gemrate_id is the stable per-card key (joins to
-- Card Ladder / cert links later). gemrate_last_updated is GemRate's own
-- per-card freshness stamp — the nightly crawl compares it to skip sets
-- whose pop has not changed. gemrate_synced_at is our write time.
alter table card_index add column if not exists gemrate_id text;
alter table card_index add column if not exists gemrate_set_name text;
alter table card_index add column if not exists gemrate_year integer;
alter table card_index add column if not exists gemrate_last_updated date;
alter table card_index add column if not exists gemrate_synced_at timestamptz;

-- Velocity index for the future Momentum ranking axis / "hot pop" sort.
create index if not exists idx_card_index_psa_pop_30d
    on card_index (psa_pop_30d desc nulls last)
    where psa_pop_30d is not null;

-- Lets the crawl find the staleest-by-GemRate sets cheaply.
create index if not exists idx_card_index_gemrate_synced
    on card_index (gemrate_synced_at asc nulls first);
