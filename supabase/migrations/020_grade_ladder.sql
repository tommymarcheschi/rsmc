-- Trove: real per-grade price ladder from PriceCharting
--
-- PriceCharting's `#full-prices` table publishes a full per-grade price
-- ladder. The scraper (pricecharting-scraper.ts::parsePriceTiers) has
-- always parsed every row of it, but mapTiers() kept only the five
-- 10-slots (ungraded/psa10/cgc10/bgs10/tag10) and discarded the entire
-- real sub-10 ladder — the same "data was reachable, we threw it away"
-- pattern as the long-dropped bgs10. This migration persists the real
-- ladder so the card page can show real per-grade numbers (and the
-- estimator can anchor on them instead of fabricating).
--
-- Honesty doctrine: only cells PriceCharting actually lists a price for
-- are stored. A blank `-` cell is absent from the JSON, never zero. The
-- generic "Grade N" columns reflect PSA-graded sales (PriceCharting's
-- own methodology), so they land under the `psa` key; CGC/BGS/TAG/SGC
-- only ever get their separately-named 10 (+ 9.5 / pristine / black
-- label where listed).
--
-- ADD-ONLY and idempotent. No existing column is redefined; nothing
-- else (combined_pop_total, the 10-price columns) is touched.

-- Normalized per-grader ladder, e.g.
-- {"psa":{"7":40,"8":75,"9":140,"9.5":210,"10":520},
--  "cgc":{"10":480},"bgs":{"9.5":260,"10":540,"10BL":1900},"tag":{"10":510}}
-- Keys are the grade as a string ("1".."9","9.5","10"); "10P" = CGC 10
-- Pristine, "10BL" = BGS 10 Black Label.
alter table card_index add column if not exists grade_ladder jsonb;

-- Provenance: when the real ladder was last scraped (separate from
-- graded_prices_fetched_at so a pre-020 row reads NULL, not "fresh").
alter table card_index add column if not exists grade_ladder_fetched_at timestamptz;
