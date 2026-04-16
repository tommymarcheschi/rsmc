#!/usr/bin/env tsx
/**
 * Grading ROI — TS/SQL parity check
 *
 * Safeguard against drift between:
 *   - the stored generated column `card_index.grading_roi_premium` (SQL)
 *   - the `computeGradingROI` helper (TypeScript)
 *
 * Pulls a sample of card_index rows and asserts SQL.premium ≈ TS.premium
 * for each. Run manually after changing either formula:
 *
 *   npx tsx scripts/verify-grading-roi.ts
 *
 * Exits non-zero on any mismatch so CI could wire it up later.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { computeGradingROI } from '../src/lib/services/grading-roi.js';

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

// Same Economy-tier defaults as getDefaultGradingFees() in price-tracker.ts.
// Kept inline so the script doesn't need the SvelteKit runtime.
const FEES = [
	{
		service: 'PSA',
		tiers: [
			{ name: 'Economy', cost: 25, turnaround_days: 150 },
			{ name: 'Regular', cost: 50, turnaround_days: 65 }
		]
	}
];

const SAMPLE_SIZE = 50;
const TOLERANCE = 0.02; // cents — SQL rounds, TS rounds, both to 2dp

async function main() {
	const { data, error } = await supabase
		.from('card_index')
		.select(
			'card_id, name, raw_nm_price, psa10_price, psa_gem_rate, psa_pop_total, grading_roi_premium'
		)
		.not('grading_roi_premium', 'is', null)
		.order('grading_roi_premium', { ascending: false, nullsFirst: false })
		.limit(SAMPLE_SIZE);

	if (error) {
		console.error('Query failed:', error.message);
		process.exit(1);
	}

	if (!data || data.length === 0) {
		console.error('No rows with grading_roi_premium. Has migration 004 been applied?');
		process.exit(1);
	}

	let mismatches = 0;
	for (const row of data) {
		// Service/tier don't affect `premium` — only grading_cost. So any
		// service works for this parity check. Using PSA Economy.
		const result = computeGradingROI(
			{
				raw_nm_price: row.raw_nm_price,
				psa10_price: row.psa10_price,
				psa_gem_rate: row.psa_gem_rate,
				psa_pop_total: row.psa_pop_total
			},
			'PSA',
			'Economy',
			FEES
		);

		const sqlPremium = row.grading_roi_premium as number | null;
		const tsPremium = result.premium;

		if (sqlPremium == null && tsPremium == null) continue;
		if (sqlPremium == null || tsPremium == null) {
			console.error(`❌ ${row.card_id} "${row.name}": SQL=${sqlPremium} TS=${tsPremium}`);
			mismatches++;
			continue;
		}
		const diff = Math.abs(sqlPremium - tsPremium);
		if (diff > TOLERANCE) {
			console.error(
				`❌ ${row.card_id} "${row.name}": SQL=${sqlPremium} TS=${tsPremium} (diff ${diff.toFixed(4)})`
			);
			mismatches++;
		}
	}

	if (mismatches === 0) {
		console.log(`✅ All ${data.length} rows match (tolerance ±${TOLERANCE})`);
	} else {
		console.error(`\n${mismatches}/${data.length} mismatches — drift detected`);
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
