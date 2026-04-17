-- Trove: Tier 1.4 — stale PSA 10 comp indicator
--
-- PriceCharting's product pages list the 30 most recent PSA 10 sold
-- comps with per-row dates. The `psa10_price` we index is PriceCharting's
-- algorithmic "current market" number, which is derived from those same
-- sales — so if the freshest PSA 10 sale is months old the "market price"
-- we show is trailing reality. Capture the last-sold date so the UI can
-- flag stale comps rather than silently showing a confident number.

alter table card_index add column if not exists psa10_last_sold_at date;

create index if not exists idx_card_index_psa10_last_sold
    on card_index (psa10_last_sold_at)
    where psa10_last_sold_at is not null;
