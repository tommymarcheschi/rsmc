-- Trove: Track A — real TAG Grading population
--
-- TAG (taggrading.com) publishes its own authoritative pop report. It is now
-- a real, reachable source (api.taggrading.com, reverse-engineered: sha256
-- x-tag-key + AES-256-CBC responses). migrations 003/007 reserved
-- tag_pop_total / tag_pop_10 / tag_fetched_at for exactly this and have kept
-- them NULL (007 cleared the old CGC mislabel). This migration adds the
-- pieces needed to store TAG's FULL grade distribution honestly — TAG uses a
-- 1–10 scale WITH half grades (1.5 … 8.5) plus VA, which a single integer
-- cannot represent.
--
-- ADD-ONLY and idempotent. tag_pop_total/tag_pop_10/tag_fetched_at are
-- REUSED as-is (no redefinition). combined_pop_total stays PSA+CGC — folding
-- TAG in would silently shift the /browse hunt filter; revisit separately.

-- Full per-card grade distribution as written by the TAG crawl, e.g.
-- {"1":2,"2.5":1,"9":244,"10":51,"VA":8}. Authoritative detail; the integer
-- tag_pop_total/tag_pop_10 columns remain the fast scalar path.
alter table card_index add column if not exists tag_grades jsonb;

-- Gem rate = grade-10 / total, percent (numeric(5,2), 0–999.99 safe).
alter table card_index add column if not exists tag_gem_rate numeric(5, 2);

-- Provenance so the nightly crawl can skip unchanged sets and so a
-- single-card on-query refresh knows which TAG set/brand to re-fetch.
alter table card_index add column if not exists tag_set_name text;
alter table card_index add column if not exists tag_brand_name text;
alter table card_index add column if not exists tag_year integer;
alter table card_index add column if not exists tag_synced_at timestamptz;

-- "Hot TAG pop" / Gem-10 sort + cheap staleest-first crawl ordering.
create index if not exists idx_card_index_tag_pop_10
    on card_index (tag_pop_10 desc nulls last)
    where tag_pop_10 is not null;

create index if not exists idx_card_index_tag_synced
    on card_index (tag_synced_at asc nulls first);
