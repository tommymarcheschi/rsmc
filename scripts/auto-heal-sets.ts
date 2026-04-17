/**
 * Auto-heal tracked sets (CLI wrapper).
 *
 * The interesting logic lives in src/lib/services/auto-heal.ts so the
 * /admin/index "Run auto-heal" button can reuse it. This file is just
 * the argv + Supabase client + progress printer.
 *
 * Usage:
 *   npx tsx scripts/auto-heal-sets.ts           # all enabled tracked_sets
 *   npx tsx scripts/auto-heal-sets.ts --set me3 # single set
 *   npx tsx scripts/auto-heal-sets.ts --force   # ignore freshness guard
 *   npx tsx scripts/auto-heal-sets.ts --dry-run # no writes
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { healSet, type TrackedSetRow } from '../src/lib/services/auto-heal';

config({ path: '.env.local' });

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			set: { type: 'string' },
			force: { type: 'boolean' },
			'dry-run': { type: 'boolean' }
		},
		strict: false
	});
	const dryRun = !!values['dry-run'];
	const force = !!values.force;

	let query = supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date, tcgplayer_set_name, tcgplayer_last_backfilled_at')
		.eq('enabled', true)
		.order('release_date', { ascending: false });
	if (values.set) query = query.eq('set_id', values.set as string);

	const { data, error } = await query;
	if (error) {
		console.error('tracked_sets read failed:', error.message);
		process.exit(1);
	}
	const sets = (data ?? []) as TrackedSetRow[];

	console.log(
		`auto-heal: ${sets.length} set(s)${dryRun ? ' (DRY RUN)' : ''}${force ? ' (force)' : ''}`
	);

	const totals = { missing: 0, priced: 0, discovered: 0, errors: 0, skipped: 0 };
	for (const set of sets) {
		process.stdout.write(
			`  ${set.set_id.padEnd(12)} ${set.set_name.slice(0, 30).padEnd(30)} `
		);
		const r = await healSet(supabase, set, { force, dryRun });
		if (r.error) {
			console.log(`ERROR: ${r.error}`);
			totals.errors++;
			continue;
		}
		if (r.skipped) {
			console.log('up to date');
			totals.skipped++;
			continue;
		}
		const bits: string[] = [];
		if (r.missingInserted) bits.push(`+${r.missingInserted} cards`);
		if (r.slugDiscovered) bits.push(`slug=${r.slugDiscovered}`);
		if (r.pricesUpdated) bits.push(`${r.pricesUpdated} prices`);
		if (bits.length === 0) bits.push('no changes');
		console.log(bits.join(', '));
		totals.missing += r.missingInserted;
		totals.priced += r.pricesUpdated;
		if (r.slugDiscovered) totals.discovered++;
	}

	console.log(
		`\ntotals: +${totals.missing} card rows, ${totals.priced} prices updated, ${totals.discovered} new slugs, ${totals.skipped} up-to-date, ${totals.errors} errors`
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
