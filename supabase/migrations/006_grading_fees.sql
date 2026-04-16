-- Trove: Data Sovereignty Phase 4 — grading fee schedules
--
-- Replaces the hardcoded getDefaultGradingFees() fallback in
-- src/lib/services/price-tracker.ts with a data-driven table.
--
-- The P0 bug this fixes: the hardcoded fallback never populated
-- `max_value` per tier, so resolveGradingCost() in grading-roi.ts
-- never escalated a card's cost when its PSA 10 price exceeded the
-- Economy tier's declared-value cap. Result: a $5,000 card was
-- quoted PSA Economy ($25) when reality is PSA's value-based tiers
-- force you to Walk-Through ($400+). Realistic ROI was fiction.
--
-- Seed rows below are current as of the migration's effective_date
-- (see each row). A monthly diff-check cron (future work) is
-- expected to update them against each grader's public fee page.
--
-- Write strategy: keep old rows around with active=false when a fee
-- schedule changes. The code reads only active rows. This gives us
-- a free audit trail of grader pricing changes over time.

create table if not exists grading_fee_schedules (
    id uuid primary key default gen_random_uuid(),

    service text not null check (service in ('PSA', 'CGC', 'BGS', 'SGC')),
    tier_name text not null,

    cost_cents integer not null check (cost_cents >= 0),

    -- NULL = no declared-value ceiling (highest tier covers the rest)
    max_value_cents integer check (max_value_cents is null or max_value_cents > 0),

    turnaround_days integer check (turnaround_days is null or turnaround_days > 0),

    -- Cheapest tier first. Used for UI ordering and for
    -- resolveGradingCost()'s value-escalation walk.
    sort_order integer not null default 0,

    source_url text,
    effective_date date not null default current_date,

    -- Retain historical rows as active=false when a schedule changes.
    active boolean not null default true,

    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Only one active row per (service, tier_name). Historical rows live
-- alongside with active=false and are ignored by the reader.
create unique index if not exists uq_grading_fees_active_service_tier
    on grading_fee_schedules (service, tier_name)
    where active = true;

create index if not exists idx_grading_fees_service_sort
    on grading_fee_schedules (service, sort_order)
    where active = true;

alter table grading_fee_schedules disable row level security;

-- ============================================
-- Seed rows — accurate as of 2026-04-16.
-- ============================================
-- Where a grader publishes service tiers with declared-value caps,
-- max_value_cents is set. Cards priced above a tier's cap force
-- escalation to the next covering tier.

-- PSA Trading Cards (US submitters, walk-in to walk-through)
-- Source: https://www.psacard.com/services/tradingcards
insert into grading_fee_schedules
    (service, tier_name, cost_cents, max_value_cents, turnaround_days, sort_order, source_url, effective_date)
values
    ('PSA', 'Value',          2599,   49900, 65, 10, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Regular',        4999,  149900, 45, 20, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Express',       10000,  249900, 20, 30, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Super Express', 20000,  499900, 10, 40, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Walk-Through',  40000,  999900,  5, 50, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Premium 1',     60000, 1499900,  5, 60, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Premium 3',    150000, 4999900,  3, 70, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Premium 5',    300000, 9999900,  3, 80, 'https://www.psacard.com/services/tradingcards', '2026-04-16'),
    ('PSA', 'Premium 10',   500000,    null,  3, 90, 'https://www.psacard.com/services/tradingcards', '2026-04-16')
on conflict do nothing;

-- CGC Trading Cards
-- Source: https://www.cgccards.com/services/
insert into grading_fee_schedules
    (service, tier_name, cost_cents, max_value_cents, turnaround_days, sort_order, source_url, effective_date)
values
    ('CGC', 'Economy',    1800,   20000, 40, 10, 'https://www.cgccards.com/services/', '2026-04-16'),
    ('CGC', 'Standard',   3000,   40000, 20, 20, 'https://www.cgccards.com/services/', '2026-04-16'),
    ('CGC', 'Express',    6000,  100000, 10, 30, 'https://www.cgccards.com/services/', '2026-04-16'),
    ('CGC', 'Premium',   12500,  250000,  5, 40, 'https://www.cgccards.com/services/', '2026-04-16'),
    ('CGC', 'Elite',     25000, 1000000,  3, 50, 'https://www.cgccards.com/services/', '2026-04-16'),
    ('CGC', 'Elite Plus', 40000,   null,  3, 60, 'https://www.cgccards.com/services/', '2026-04-16')
on conflict do nothing;

-- BGS (Beckett Grading Services) — TCG rates
-- Source: https://www.beckett.com/grading/card-pricing
insert into grading_fee_schedules
    (service, tier_name, cost_cents, max_value_cents, turnaround_days, sort_order, source_url, effective_date)
values
    ('BGS', 'Economy',   2000,   50000, 60, 10, 'https://www.beckett.com/grading/card-pricing', '2026-04-16'),
    ('BGS', 'Standard',  3500,  150000, 30, 20, 'https://www.beckett.com/grading/card-pricing', '2026-04-16'),
    ('BGS', 'Express',  10000,  250000, 10, 30, 'https://www.beckett.com/grading/card-pricing', '2026-04-16'),
    ('BGS', 'Premium',  25000, 1000000,  5, 40, 'https://www.beckett.com/grading/card-pricing', '2026-04-16'),
    ('BGS', 'Premium Plus', 50000, null, 5, 50, 'https://www.beckett.com/grading/card-pricing', '2026-04-16')
on conflict do nothing;

-- SGC (Sportscard Guaranty Corporation)
-- Source: https://www.gosgc.com/pricing
insert into grading_fee_schedules
    (service, tier_name, cost_cents, max_value_cents, turnaround_days, sort_order, source_url, effective_date)
values
    ('SGC', 'Standard',       3000,  150000, 20, 10, 'https://www.gosgc.com/pricing', '2026-04-16'),
    ('SGC', 'Express',        5000,  250000, 10, 20, 'https://www.gosgc.com/pricing', '2026-04-16'),
    ('SGC', 'Premium',       10000,  500000,  5, 30, 'https://www.gosgc.com/pricing', '2026-04-16'),
    ('SGC', 'Walk-Through',  25000,    null,  2, 40, 'https://www.gosgc.com/pricing', '2026-04-16')
on conflict do nothing;
