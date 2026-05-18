---
name: trove-data-audit
description: Measure Trove's graded-data coverage — the data-acquisition engine's KPI. Use when asked about data completeness/coverage, "how much data do we have", before/after any data-engine (GemRate, PriceCharting, enrichment) work, or to check if the nightly pipeline is healthy. Reports PSA10/pop/raw coverage % and stale %.
---

# Trove Data Audit

Trove's catalog is complete (~20k cards, 172/172 English sets) but graded
**data depth** is the core problem the whole roadmap exists to fix. This
skill is the verification ritual — run it at the start AND end of any
data-engine work so progress is measurable. The single KPI is graded-data
coverage climbing toward ~95%. Baseline (2026-05-18): PSA10 6.6%, PSA pop
4.9%, CGC pop 2.9%, raw 96.9%, **stale >7d 99.1%**.

## Run the audit (read-only, safe)

The dry-run reads `card_index` and prints the live scoreboard without
writing anything:

```
/Users/tommymarcheschi/dev/rsmc/node_modules/.bin/tsx scripts/coverage-ledger.ts --dry-run
```

Gotchas (these silently produce empty/wrong results if ignored):
- **Worktrees have no `.env.local` and no `node_modules`.** Symlink env
  from the main repo and invoke tsx by absolute path from the main repo:
  `ln -sf /Users/tommymarcheschi/dev/rsmc/.env.local .env.local`
- If creds are missing the Supabase client silently returns empty results
  (it falls back to a placeholder URL) — a "0 cards" result almost always
  means env, not an empty DB.

## Read the trend (after migration 014 is applied + cron has run)

`coverage_ledger` has one row per (snapshot_date, set_id). Compare today
to prior days to see if the engine is gaining ground:

```sql
select snapshot_date,
       sum(indexed)                                  as cards,
       round(100.0*sum(psa10_priced)/sum(indexed),1) as psa10_pct,
       round(100.0*sum(psa_pop)/sum(indexed),1)      as psa_pop_pct,
       round(100.0*sum(cgc_pop)/sum(indexed),1)      as cgc_pop_pct,
       round(100.0*sum(stale)/sum(indexed),1)        as stale_pct
from coverage_ledger
group by snapshot_date order by snapshot_date desc limit 14;
```

Query via the Supabase REST API with the service-role key (URL + key in
the main repo `.env.local`); the Supabase MCP token points at a different
project (BMAG), not Trove — do not use it for Trove tables.

## Interpret

- **psa10_pct / psa_pop_pct / cgc_pop_pct** — the coverage KPI. Should
  trend up nightly once the acquisition crons (GemRate / PriceCharting
  deep-fill) run. Flat or falling = the engine is stalled; investigate.
- **stale_pct** — pipeline-health signal. Near 100% means enrichment has
  effectively stopped (the refresh cron isn't keeping up). This is an
  alert condition independent of coverage %.
- **Worst sets**: `--dry-run` prints the 10 sets with the lowest PSA10
  coverage — these are the gap-prioritisation targets for the engine.

## Doctrine

Never report a coverage number you didn't just measure — coverage moves
nightly. Always run the audit fresh; don't quote a remembered figure.
