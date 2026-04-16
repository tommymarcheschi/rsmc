#!/usr/bin/env tsx
/**
 * Trove — nightly card_index → card_index_history snapshot
 *
 * One row per card per day. Powers /insights rising-stars momentum:
 *   select card_id, raw_nm_price / lag(raw_nm_price, 7) over (...)
 * etc.
 *
 * Idempotent: re-running on the same day upserts by (card_id, snapshot_date).
 * Skips cards with all three price columns null (no signal to capture).
 *
 * Usage:
 *   tsx scripts/snapshot-card-index.ts
 *   tsx scripts/snapshot-card-index.ts --dry-run
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

const BATCH_SIZE = 500;

interface SnapshotRow {
	card_id: string;
	raw_nm_price: number | null;
	psa10_price: number | null;
	cgc10_price: number | null;
}

async function loadPricedCards(): Promise<SnapshotRow[]> {
	const out: SnapshotRow[] = [];
	const pageSize = 1000;
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select('card_id, raw_nm_price, psa10_price, cgc10_price')
			.or('raw_nm_price.not.is.null,psa10_price.not.is.null,cgc10_price.not.is.null')
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);

		if (error) throw error;
		const batch = (data ?? []) as SnapshotRow[];
		out.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	return out;
}

async function main() {
	const { values } = parseArgs({
		options: { 'dry-run': { type: 'boolean', default: false } },
		strict: false
	});
	const dryRun = !!values['dry-run'];

	const today = new Date().toISOString().split('T')[0];
	console.log(`=== Trove snapshot-card-index ${today} ===`);
	if (dryRun) console.log('DRY RUN — no writes');

	const rows = await loadPricedCards();
	console.log(`Cards with at least one non-null price: ${rows.length}`);

	if (rows.length === 0) {
		console.log('Nothing to snapshot.');
		return;
	}

	if (dryRun) {
		console.log('Sample (first 3):');
		for (const r of rows.slice(0, 3)) console.log(`  ${JSON.stringify(r)}`);
		return;
	}

	let upserted = 0;
	let errored = 0;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
			card_id: r.card_id,
			snapshot_date: today,
			raw_nm_price: r.raw_nm_price,
			psa10_price: r.psa10_price,
			cgc10_price: r.cgc10_price
		}));
		const { error } = await supabase
			.from('card_index_history')
			.upsert(batch, { onConflict: 'card_id,snapshot_date' });
		if (error) {
			errored += batch.length;
			console.error(`  Batch ${i}: ${error.message}`);
		} else {
			upserted += batch.length;
			process.stdout.write(`\r  Upserted ${upserted}/${rows.length}`);
		}
	}
	process.stdout.write('\n');
	console.log(`Done — upserted=${upserted} errored=${errored}`);
	if (errored > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
