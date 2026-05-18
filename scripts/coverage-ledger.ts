#!/usr/bin/env tsx
/**
 * Trove — nightly coverage_ledger snapshot
 *
 * The data-acquisition engine's scoreboard. One row per (set_id,
 * snapshot_date) recording how much DATA we actually have for each set:
 * indexed / raw-priced / PSA10-priced / PSA-pop / CGC-pop / stale.
 *
 * The catalog is complete; data depth is the crisis (PSA10/pop ~5% as of
 * 2026-05-17). This table makes the 5% -> 95% climb visible and gives the
 * self-healing crons a gap-prioritised target.
 *
 * Runs AFTER the acquisition crons (detect/auto-heal/refresh/snapshot) so
 * each day captures the freshest post-acquisition state.
 *
 * Idempotent: re-running on the same day upserts by (snapshot_date, set_id).
 *
 * Usage:
 *   tsx scripts/coverage-ledger.ts
 *   tsx scripts/coverage-ledger.ts --dry-run
 *
 * Env vars (.env.local):
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (or PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ??
	process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
	'';

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_KEY. Check .env.local');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STALE_DAYS = 7;
const UPSERT_BATCH = 200;

// A card is "gradeable" if a PSA/CGC graded market plausibly exists for it,
// so it CAN contribute to graded coverage. Mirrors the engine's
// gradeability-first gap queue (refresh-index.ts): not a bulk
// Common/Uncommon, or worth grading by raw value. Thousands of catalog
// commons (and McDonald's-promo-style sets) structurally have no graded
// market anywhere — counting them in the denominator makes the KPI look
// permanently broken and hides real progress. The honest KPI is coverage
// among gradeable cards; all-cards is kept as the secondary headline.
const GRADEABLE_VALUE_FLOOR =
	Number(process.env.TROVE_GRADEABLE_VALUE_FLOOR) > 0
		? Number(process.env.TROVE_GRADEABLE_VALUE_FLOOR)
		: 5;

function isGradeable(r: { rarity: string | null; raw_nm_price: number | null }): boolean {
	if (r.raw_nm_price != null && r.raw_nm_price >= GRADEABLE_VALUE_FLOOR) return true;
	const rr = r.rarity;
	return rr != null && rr !== 'Common' && rr !== 'Uncommon';
}

interface CardRow {
	set_id: string;
	set_name: string | null;
	rarity: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
	psa_pop_total: number | null;
	cgc_pop_total: number | null;
	last_enriched_at: string | null;
}

interface Tally {
	set_id: string;
	set_name: string | null;
	indexed: number;
	raw_priced: number;
	psa10_priced: number;
	psa_pop: number;
	cgc_pop: number;
	stale: number;
	// Gradeable-only sub-counts (the honest KPI). Not persisted to
	// coverage_ledger (that needs a hand-applied migration) — display only.
	g_indexed: number;
	g_psa10: number;
	g_psa_pop: number;
}

async function loadAllCards(): Promise<CardRow[]> {
	const out: CardRow[] = [];
	const pageSize = 1000;
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select(
				'set_id, set_name, rarity, raw_nm_price, psa10_price, psa_pop_total, cgc_pop_total, last_enriched_at'
			)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);

		if (error) throw error;
		const batch = (data ?? []) as CardRow[];
		out.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	return out;
}

function tally(rows: CardRow[], staleThreshold: string): Tally[] {
	const bySet = new Map<string, Tally>();
	for (const r of rows) {
		let t = bySet.get(r.set_id);
		if (!t) {
			t = {
				set_id: r.set_id,
				set_name: r.set_name,
				indexed: 0,
				raw_priced: 0,
				psa10_priced: 0,
				psa_pop: 0,
				cgc_pop: 0,
				stale: 0,
				g_indexed: 0,
				g_psa10: 0,
				g_psa_pop: 0
			};
			bySet.set(r.set_id, t);
		}
		t.indexed += 1;
		if (r.raw_nm_price != null) t.raw_priced += 1;
		if (r.psa10_price != null) t.psa10_priced += 1;
		if (r.psa_pop_total != null) t.psa_pop += 1;
		if (r.cgc_pop_total != null) t.cgc_pop += 1;
		if (!r.last_enriched_at || r.last_enriched_at < staleThreshold) t.stale += 1;
		// Honest + monotonic denominator: a card is gradeable if the
		// heuristic says so OR it demonstrably already HAS graded data
		// (proven gradeable). Without the latter clause, acquiring data
		// for a sub-floor vintage common would paradoxically lower the
		// gradeable %, and the KPI would understate the real opportunity.
		if (
			isGradeable(r) ||
			r.psa10_price != null ||
			r.psa_pop_total != null ||
			r.cgc_pop_total != null
		) {
			t.g_indexed += 1;
			if (r.psa10_price != null) t.g_psa10 += 1;
			if (r.psa_pop_total != null) t.g_psa_pop += 1;
		}
	}
	return Array.from(bySet.values()).sort((a, b) => a.set_id.localeCompare(b.set_id));
}

function pct(n: number, d: number): string {
	return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—';
}

async function main() {
	const { values } = parseArgs({
		options: { 'dry-run': { type: 'boolean', default: false } },
		strict: false
	});
	const dryRun = !!values['dry-run'];

	const today = new Date().toISOString().split('T')[0];
	const staleThreshold = new Date(
		Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000
	).toISOString();

	console.log(`=== Trove coverage-ledger ${today} ===`);
	if (dryRun) console.log('DRY RUN — no writes');

	const rows = await loadAllCards();
	const tallies = tally(rows, staleThreshold);

	const tot = tallies.reduce(
		(a, t) => ({
			indexed: a.indexed + t.indexed,
			raw: a.raw + t.raw_priced,
			psa10: a.psa10 + t.psa10_priced,
			psaPop: a.psaPop + t.psa_pop,
			cgcPop: a.cgcPop + t.cgc_pop,
			stale: a.stale + t.stale,
				gIndexed: a.gIndexed + t.g_indexed,
				gPsa10: a.gPsa10 + t.g_psa10,
				gPsaPop: a.gPsaPop + t.g_psa_pop
		}),
		{ indexed: 0, raw: 0, psa10: 0, psaPop: 0, cgcPop: 0, stale: 0, gIndexed: 0, gPsa10: 0, gPsaPop: 0 }
	);

	console.log(
		`Sets: ${tallies.length}  Cards: ${tot.indexed}\n` +
			`  raw-priced:  ${tot.raw} (${pct(tot.raw, tot.indexed)})\n` +
			`  PSA10-priced: ${tot.psa10} (${pct(tot.psa10, tot.indexed)})\n` +
			`  PSA pop:      ${tot.psaPop} (${pct(tot.psaPop, tot.indexed)})\n` +
			`  CGC pop:      ${tot.cgcPop} (${pct(tot.cgcPop, tot.indexed)})\n` +
			`  stale (>${STALE_DAYS}d): ${tot.stale} (${pct(tot.stale, tot.indexed)})`
	);

	// The honest KPI: graded coverage among cards that CAN have graded
	// data. The all-cards % above is dragged down by ~half the catalog
	// being bulk commons / promo sets with no graded market anywhere.
	console.log(
		`Gradeable: ${tot.gIndexed} cards (${pct(tot.gIndexed, tot.indexed)} of catalog) — honest KPI denominator\n` +
			`  PSA10 (gradeable):   ${tot.gPsa10} (${pct(tot.gPsa10, tot.gIndexed)})\n` +
			`  PSA pop (gradeable): ${tot.gPsaPop} (${pct(tot.gPsaPop, tot.gIndexed)})`
	);

	if (dryRun) {
		// Rank by gradeable-PSA10 coverage with a meaningful gradeable
		// population, so structurally-ungradeable sets (McDonald's promos
		// etc.) don't fill the worklist with noise — these are the real
		// engine gap-fill targets.
		console.log('\nWorst 10 sets by gradeable-PSA10 coverage (>=10 gradeable cards):');
		[...tallies]
			.filter((t) => t.g_indexed >= 10)
			.sort((a, b) => a.g_psa10 / a.g_indexed - b.g_psa10 / b.g_indexed)
			.slice(0, 10)
			.forEach((t) =>
				console.log(
					`  ${t.set_id.padEnd(12)} ${pct(t.g_psa10, t.g_indexed).padStart(6)} PSA10  (${t.g_indexed}/${t.indexed} gradeable)`
				)
			);
		return;
	}

	let upserted = 0;
	let errored = 0;
	for (let i = 0; i < tallies.length; i += UPSERT_BATCH) {
		const batch = tallies.slice(i, i + UPSERT_BATCH).map((t) => ({
			snapshot_date: today,
			set_id: t.set_id,
			set_name: t.set_name,
			indexed: t.indexed,
			raw_priced: t.raw_priced,
			psa10_priced: t.psa10_priced,
			psa_pop: t.psa_pop,
			cgc_pop: t.cgc_pop,
			stale: t.stale
		}));
		const { error } = await supabase
			.from('coverage_ledger')
			.upsert(batch, { onConflict: 'snapshot_date,set_id' });
		if (error) {
			errored += batch.length;
			console.error(`  Batch ${i}: ${error.message}`);
		} else {
			upserted += batch.length;
		}
	}
	console.log(`Done — upserted=${upserted} errored=${errored}`);
	if (errored > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
