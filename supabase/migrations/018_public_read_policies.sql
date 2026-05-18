-- Trove: public read-only RLS policies for data-engine tables
--
-- WHY: The browser/SSR Supabase client (src/lib/services/supabase.ts) uses
-- the publishable key, which maps to the `anon` role. RLS is ENABLED on the
-- data-engine tables in the live project (migration 003's
-- `disable row level security` never took effect on prod, and Supabase's new
-- API-key system keeps RLS on). With RLS on and NO permissive policy, anon
-- reads return zero rows (PostgREST: HTTP 200, content-range */0) while
-- service-role reads (all the cron scripts) work fine. Net effect: the
-- card-detail "Market Signals" block, /browse hunt mode, /rankings, and
-- /sets render empty for every real user, even though the data is present.
--
-- HONEST FIX: keep RLS enabled (the secure posture the new key system wants)
-- and add explicit read-only SELECT policies for anon. NO public write
-- policies — writes stay service-role-only. Idempotent + add-only.

-- card_index — Market Signals, /browse hunt, /rankings, /sets ranking
alter table card_index enable row level security;
grant select on card_index to anon, authenticated;
drop policy if exists "public read card_index" on card_index;
create policy "public read card_index" on card_index
    for select to anon, authenticated using (true);

-- tracked_sets — /sets listing, set metadata joins
alter table tracked_sets enable row level security;
grant select on tracked_sets to anon, authenticated;
drop policy if exists "public read tracked_sets" on tracked_sets;
create policy "public read tracked_sets" on tracked_sets
    for select to anon, authenticated using (true);

-- psa10_sales — PSA10 sales history on card detail
alter table psa10_sales enable row level security;
grant select on psa10_sales to anon, authenticated;
drop policy if exists "public read psa10_sales" on psa10_sales;
create policy "public read psa10_sales" on psa10_sales
    for select to anon, authenticated using (true);

-- condition_price_snapshots — per-condition (LP/MP/HP/DMG) pricing on card detail
alter table condition_price_snapshots enable row level security;
grant select on condition_price_snapshots to anon, authenticated;
drop policy if exists "public read condition_price_snapshots" on condition_price_snapshots;
create policy "public read condition_price_snapshots" on condition_price_snapshots
    for select to anon, authenticated using (true);

-- coverage_ledger — /admin coverage-trend panel (5%->95% climb)
alter table coverage_ledger enable row level security;
grant select on coverage_ledger to anon, authenticated;
drop policy if exists "public read coverage_ledger" on coverage_ledger;
create policy "public read coverage_ledger" on coverage_ledger
    for select to anon, authenticated using (true);
