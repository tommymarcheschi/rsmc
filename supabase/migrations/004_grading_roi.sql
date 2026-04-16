-- Trove: Grading ROI — Tier 2 scorecard column
--
-- Adds `grading_roi_premium` to card_index: the gem-rate-weighted PSA 10
-- premium over raw. This is the service-independent half of the ROI math.
-- Grading cost is layered on client-side by grading-roi.ts so the ranking
-- stays stable when users switch between PSA/CGC/BGS/SGC.
--
--   premium = (psa_gem_rate / 100) × (psa10_price − raw_nm_price)
--
-- NULL whenever any input is missing (unknown gem rate, no PSA 10 comp, or
-- no raw price). Negative for underwater grades — sort handles it.
--
-- Powers:
--   1. /browse?mode=hunt&sort=roi_desc  (SQL-backed sort)
--   2. /grading/candidates               (default filter: premium > 0)

alter table card_index
    add column if not exists grading_roi_premium numeric(10, 2)
        generated always as (
            case
                when psa_gem_rate is not null
                 and psa10_price is not null
                 and raw_nm_price is not null
                then round((psa_gem_rate / 100.0) * (psa10_price - raw_nm_price), 2)
                else null
            end
        ) stored;

create index if not exists idx_card_index_roi_premium
    on card_index (grading_roi_premium desc nulls last);
