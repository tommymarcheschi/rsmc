-- Trove: per-sale source link for PSA 10 comps
--
-- PriceCharting's completed-auction rows carry an <a href> to the actual
-- source listing (Goldin / eBay / Fanatics, e.g.
-- https://goldin.co/item/...). We already parse date/price/marketplace
-- from that row but discarded the link. Storing it lets the card-detail
-- "Recent PSA 10 sales" rows deep-link to the real auction so a comp can
-- be independently confirmed.
--
-- Add-only + idempotent. Existing rows backfill source_url on their next
-- enrichment cycle (the psa10_sales upserts switch to ON CONFLICT DO
-- UPDATE so a re-scraped sale refreshes this column).

alter table psa10_sales
    add column if not exists source_url text;
