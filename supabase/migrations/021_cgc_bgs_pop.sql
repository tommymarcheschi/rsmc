-- Trove: real CGC + Beckett (BGS) full population, like TAG (migration 019)
--
-- CGC and Beckett each publish their own authoritative pop report with a
-- full per-grade distribution. Reverse-engineered 2026-05-18 (plain JSON,
-- no auth, no Cloudflare — see project_grading_data_sources):
--   CGC: production.api.aws.ccg-ops.com … /population?researchGroupID=<id>
--   BGS: www.beckett.com/api/grading/pop-report?sport_id=477173&set_id=<id>
--
-- migrations 007 / 016 already gave the scalar cgc_pop_* / bgs_pop_*
-- columns. This adds the FULL grade distribution (CGC uses half grades +
-- GemMint/Pristine/Perfect 10; BGS uses half grades + Black Label 10 — a
-- single integer can't represent either) plus provenance so the nightly
-- crawl can skip unchanged sets and an on-query single-card refresh knows
-- which CGC group / Beckett set to re-fetch.
--
-- ADD-ONLY and idempotent. No existing column is redefined; combined_pop
-- (psa+cgc) is intentionally left as-is.

-- CGC full distribution + provenance.
-- grade map e.g. {"7":40,"8.5":12,"9":27,"9.5":8,"10":12,"10P":2,"10PF":0,"AU":1}
-- "10" = GemMint 10, "10P" = Pristine 10, "10PF" = Perfect 10,
-- "AU" = Authentic, "AA" = Authentic Altered.
alter table card_index add column if not exists cgc_grades jsonb;
alter table card_index add column if not exists cgc_gem_rate_full numeric(5, 2);
alter table card_index add column if not exists cgc_set_name text;
alter table card_index add column if not exists cgc_group_id integer;
alter table card_index add column if not exists cgc_synced_at timestamptz;

-- Beckett (BGS) full distribution + provenance.
-- grade map e.g. {"7":5,"8":9,"8.5":14,"9":120,"9.5":300,"10":51,"10BL":8}
-- "10" = BGS 10 (Pristine), "10BL" = Black Label 10.
alter table card_index add column if not exists bgs_grades jsonb;
alter table card_index add column if not exists bgs_gem_rate_full numeric(5, 2);
alter table card_index add column if not exists bgs_set_name text;
-- Beckett has two id spaces: bgs_set_id = the display id used to REQUEST a
-- set; bgs_lpg_set_id = the id carried on each per-card row (filter key).
-- Both are needed to re-drill one card on-query.
alter table card_index add column if not exists bgs_set_id text;
alter table card_index add column if not exists bgs_lpg_set_id text;
alter table card_index add column if not exists bgs_synced_at timestamptz;

-- "Hot pop" / gem-10 sorts + cheap stalest-first crawl ordering, mirroring
-- the migration-019 TAG indexes.
create index if not exists idx_card_index_cgc_pop_10_d
    on card_index (cgc_pop_10 desc nulls last)
    where cgc_pop_10 is not null;
create index if not exists idx_card_index_cgc_synced
    on card_index (cgc_synced_at asc nulls first);

create index if not exists idx_card_index_bgs_pop_10_d
    on card_index (bgs_pop_10 desc nulls last)
    where bgs_pop_10 is not null;
create index if not exists idx_card_index_bgs_synced
    on card_index (bgs_synced_at asc nulls first);
