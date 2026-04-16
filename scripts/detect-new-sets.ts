#!/usr/bin/env tsx
/**
 * Trove — detect newly-released TCG sets
 *
 * Fetches /sets from pokemontcg.io, diffs against tracked_sets, and
 * inserts any new set_ids with enabled=false (user opts in to scraping
 * later). Meant to run weekly via launchd so we never miss a release.
 *
 * Usage:
 *   tsx scripts/detect-new-sets.ts
 *   tsx scripts/detect-new-sets.ts --dry-run   # show diff, no writes
 *   tsx scripts/detect-new-sets.ts --enable    # auto-enable new sets
 *
 * Env vars required (.env.local):
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (or PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
 *
 * Optional:
 *   POKEMON_TCG_API_KEY — improves rate limits
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

const TCG_BASE = 'https://api.pokemontcg.io/v2';

function tcgHeaders(): HeadersInit {
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	const key = process.env.POKEMON_TCG_API_KEY ?? '';
	if (key) (headers as Record<string, string>)['X-Api-Key'] = key;
	return headers;
}

interface TcgSet {
	id: string;
	name: string;
	series?: string;
	releaseDate: string;
	total?: number;
	printedTotal?: number;
}

async function fetchTcgSets(): Promise<TcgSet[]> {
	const res = await fetch(`${TCG_BASE}/sets?pageSize=500&orderBy=-releaseDate`, {
		headers: tcgHeaders()
	});
	if (!res.ok) {
		throw new Error(`TCG API /sets returned ${res.status}`);
	}
	const json = await res.json();
	return (json.data ?? []) as TcgSet[];
}

async function fetchTrackedSetIds(): Promise<Set<string>> {
	const { data, error } = await supabase.from('tracked_sets').select('set_id');
	if (error) throw error;
	return new Set((data ?? []).map((r: { set_id: string }) => r.set_id));
}

function formatReleaseDate(input: string): string {
	// pokemontcg.io returns "YYYY/MM/DD". Postgres wants "YYYY-MM-DD".
	return input.replaceAll('/', '-');
}

async function main() {
	const { values } = parseArgs({
		options: {
			'dry-run': { type: 'boolean', default: false },
			enable: { type: 'boolean', default: false }
		},
		strict: false
	});
	const dryRun = !!values['dry-run'];
	const enable = !!values.enable;

	console.log(`=== Trove detect-new-sets ${new Date().toISOString()} ===`);
	if (dryRun) console.log('DRY RUN — no writes');
	if (enable) console.log('NEW SETS WILL BE ENABLED (auto-scrape will begin next cron run)');

	const [tcgSets, trackedIds] = await Promise.all([fetchTcgSets(), fetchTrackedSetIds()]);
	console.log(`TCG API: ${tcgSets.length} sets`);
	console.log(`tracked_sets: ${trackedIds.size} set_ids`);

	const newSets = tcgSets.filter((s) => !trackedIds.has(s.id));
	console.log(`New sets to enroll: ${newSets.length}`);

	if (newSets.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	for (const s of newSets) {
		const flag = enable ? '[enabled]' : '[disabled]';
		console.log(`  ${flag} ${s.id} — ${s.name} (${s.releaseDate}, ${s.total ?? s.printedTotal ?? '?'} cards)`);
	}

	if (dryRun) return;

	const rows = newSets.map((s) => ({
		set_id: s.id,
		set_name: s.name,
		series: s.series ?? null,
		release_date: formatReleaseDate(s.releaseDate),
		total_cards: s.total ?? s.printedTotal ?? null,
		enabled: enable
	}));

	// ignoreDuplicates so a race with another runner doesn't clobber state.
	const { error } = await supabase
		.from('tracked_sets')
		.upsert(rows, { onConflict: 'set_id', ignoreDuplicates: true });
	if (error) {
		console.error('Insert failed:', error.message);
		process.exit(1);
	}

	console.log(`Inserted ${rows.length} new set(s).`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
