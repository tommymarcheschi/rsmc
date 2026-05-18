-- Trove: Card Rankings — north star pillar #9
--
-- Every card scored 0–100 on six independent axes, percentile-ranked
-- across the WHOLE catalog (not just data-rich cards), plus three
-- pre-weighted lens composites. Purpose: discovery — surface cards the
-- user never knew were valuable or low-pop.
--
-- Axes (each its own sortable column):
--   Value          — how much the card is worth (psa10 / raw / headline)
--   Scarcity       — inverse total graded pop (rarer = higher)
--   Gem difficulty — 1 − gem_rate (harder to pull a 10 = higher)
--   Momentum       — 30-day pop-growth rate (GemRate ct_diff_p1 / total)
--   Grade ROI      — gem-rate-weighted PSA10 premium (grading_roi_premium)
--   Liquidity      — recent PSA10 sale activity (psa10_sales, 90d)
--
-- Lenses re-weight the same axes for different intents:
--   Investor  — appreciation + ROI + momentum
--   Collector — scarcity + gem difficulty + value
--   Flipper   — liquidity + momentum + ROI
--
-- Honesty doctrine: a per-axis score is NULL when its input is absent —
-- we never fabricate a neutral 50. The lens composite sums weight*score
-- over present axes and divides by the lens's TOTAL weight (a missing
-- axis contributes 0), so completeness is rewarded and thin-data cards
-- can't top fully-scored ones; ranking_confidence (high/medium/low)
-- still makes them visible instead of hiding them. These
-- are plain columns (percentile needs the whole distribution — can't be
-- a generated column); scripts/rank-cards.ts recomputes them nightly.

-- Per-axis percentile scores (0–100). NULL = no input data for that axis.
alter table card_index add column if not exists score_value smallint;
alter table card_index add column if not exists score_scarcity smallint;
alter table card_index add column if not exists score_gem_difficulty smallint;
alter table card_index add column if not exists score_momentum smallint;
alter table card_index add column if not exists score_grade_roi smallint;
alter table card_index add column if not exists score_liquidity smallint;

-- Pre-weighted lens composites (0–100). Weighted mean over present axes.
alter table card_index add column if not exists score_investor smallint;
alter table card_index add column if not exists score_collector smallint;
alter table card_index add column if not exists score_flipper smallint;

-- Confidence = how many axes the card actually has data for. Surfaced in
-- the UI as a badge; low-confidence cards are shown, never hidden.
alter table card_index add column if not exists ranking_confidence text
    check (ranking_confidence in ('high', 'medium', 'low'));
alter table card_index add column if not exists ranked_at timestamptz;

-- One index per sortable score column (desc, thin data sinks to the end).
create index if not exists idx_ci_score_value on card_index (score_value desc nulls last);
create index if not exists idx_ci_score_scarcity on card_index (score_scarcity desc nulls last);
create index if not exists idx_ci_score_gem_difficulty on card_index (score_gem_difficulty desc nulls last);
create index if not exists idx_ci_score_momentum on card_index (score_momentum desc nulls last);
create index if not exists idx_ci_score_grade_roi on card_index (score_grade_roi desc nulls last);
create index if not exists idx_ci_score_liquidity on card_index (score_liquidity desc nulls last);
create index if not exists idx_ci_score_investor on card_index (score_investor desc nulls last);
create index if not exists idx_ci_score_collector on card_index (score_collector desc nulls last);
create index if not exists idx_ci_score_flipper on card_index (score_flipper desc nulls last);
create index if not exists idx_ci_ranking_confidence on card_index (ranking_confidence);
