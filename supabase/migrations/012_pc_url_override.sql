-- Trove: Tier 6.25 — PriceCharting match-override
--
-- When the fuzzy-match picks the wrong product page (shadowless /
-- 1st-edition / staff-promo variants are the usual culprits), every
-- downstream price / pop / signal for that card is wrong until we
-- re-match. This lets the user pin a canonical PriceCharting URL per
-- card; enrichment reads from the override when set and skips search.

alter table card_index add column if not exists pc_url_override text;

-- No index needed — read path is always "where card_id = X" and this
-- is just an optional field on that existing row.
