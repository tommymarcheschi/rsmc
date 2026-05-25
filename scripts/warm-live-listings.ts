#!/usr/bin/env tsx
/**
 * Trove — Live Listings cache warmer
 *
 * Pre-fetches the top-N most-viewed cards (by recent hits in
 * card_query_log) and refreshes their live_listings_cache rows so the
 * first user landing on a popular card after a quiet period gets cached
 * data instantly instead of paying the provider-latency tax
 * (project_live_listings_cache).
 *
 * Why this is needed when the SWR wrapper already revalidates:
 * SWR only refreshes when a user shows up. During quiet hours, popular
 * cards still go cold past the TTL and the next visitor eats the cold-
 * fetch round-trip. This cron keeps the hot set warm overnight.
 *
 * Ranking strategy: count card_query_log hits in a sliding window
 * (default 7d), take the top N (default 100), join card_index for the
 * metadata the provider needs, fetch in parallel (default 4 workers),
 * upsert into live_listings_cache. Upsert shape mirrors
 * cache.ts:refreshAndStore — single source of truth is the table PK
 * (card_id, query_key), and query_key is derived via the shared
 * deriveQueryKey() helper so SWR + cron never write conflicting rows.
 *
 * Honest no-ops:
 *   - card_query_log empty for window → log + exit 0 (nothing to do).
 *   - card_index missing some ids → log + skip those (don't crash).
 *   - Provider throws on a card → log + count as error, keep going.
 *
 * Usage:
 *   tsx scripts/warm-live-listings.ts            # warm + write
 *   tsx scripts/warm-live-listings.ts --dry-run  # rank + report, no provider calls
 *
 * Env (.env.local in dev, GitHub secrets in CI):
 *   PUBLIC_SUPABASE_URL           required
 *   SUPABASE_SERVICE_ROLE_KEY     required for writes (RLS service-role-only)
 *   LIVE_LISTINGS_PROVIDER        'stub' | 'ebay' | … (default 'stub')
 *   TROVE_WARM_LIMIT              top-N to warm           (default 100)
 *   TROVE_WARM_WINDOW_DAYS        popularity window       (default 7)
 *   TROVE_WARM_CONC               parallel provider calls (default 4)
 *   TROVE_WARM_STATUS             heartbeat file path
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
	getLiveListingsProvider,
	deriveQueryKey
} from '../src/lib/services/live-listings/provider.js';
import type { FetchForCardOptions } from '../src/lib/services/live-listings/types.js';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FALLBACK_KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '';
const SUPABASE_KEY = SERVICE_KEY || FALLBACK_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local');
	process.exit(1);
}
const usingServiceRole = !!SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const num = (v: string | undefined, d: number) => {
	const n = parseInt(v ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : d;
};
const WARM_LIMIT = num(process.env.TROVE_WARM_LIMIT, 100);
const WINDOW_DAYS = num(process.env.TROVE_WARM_WINDOW_DAYS, 7);
const WARM_CONC = num(process.env.TROVE_WARM_CONC, 4);
const STATUS_FILE =
	process.env.TROVE_WARM_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'warm-live-listings-status.json');

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const)
	process.on(sig, () => {
		log(`${sig} — finishing current batch then exiting`);
		stopping = true;
	});

/**
 * Page through card_query_log within the window and tally hits per
 * card_id in JS. Doing the GROUP BY in JS keeps the schema simple — no
 * extra materialized view or RPC. Volume math: at 100k card-page-views/
 * month, a 7d slice is ~25k rows ≈ 1.5MB over the wire. Trivial. If
 * traffic ever 50x's this, swap to a SQL view (card_query_log already
 * has the (card_id, hit_at desc) index from migration 023).
 */
async function topCardsByHits(limit: number): Promise<Array<{ card_id: string; hits: number }>> {
	const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
	const counts = new Map<string, number>();
	const pageSize = 1000;
	let from = 0;
	while (true) {
		const { data, error } = await supabase
			.from('card_query_log')
			.select('card_id')
			.gt('hit_at', since)
			.range(from, from + pageSize - 1);
		if (error) throw new Error(`card_query_log read failed: ${error.message}`);
		const batch = (data ?? []) as Array<{ card_id: string }>;
		for (const r of batch) counts.set(r.card_id, (counts.get(r.card_id) ?? 0) + 1);
		if (batch.length < pageSize) break;
		from += pageSize;
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([card_id, hits]) => ({ card_id, hits }));
}

interface CardMeta {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string | null;
}

async function loadCardMeta(ids: string[]): Promise<Map<string, CardMeta>> {
	const meta = new Map<string, CardMeta>();
	if (ids.length === 0) return meta;
	// `.in()` handles a few thousand ids comfortably; 100 is well under.
	const { data, error } = await supabase
		.from('card_index')
		.select('card_id, name, set_name, card_number')
		.in('card_id', ids);
	if (error) throw new Error(`card_index read failed: ${error.message}`);
	for (const r of (data ?? []) as CardMeta[]) meta.set(r.card_id, r);
	return meta;
}

/**
 * Fetch via provider and upsert into live_listings_cache. Shape MUST
 * stay in sync with cache.ts:refreshAndStore — both paths write the
 * same (card_id, query_key) row and must agree on column population.
 */
async function warmOne(opts: FetchForCardOptions, providerName: string): Promise<'warmed' | 'error'> {
	const provider = getLiveListingsProvider();
	const queryKey = deriveQueryKey(opts);
	let result;
	try {
		result = await provider.fetchForCard(opts);
	} catch (e) {
		log(`provider fetch failed for ${opts.card_id}: ${(e as Error).message}`);
		return 'error';
	}
	const { error } = await supabase
		.from('live_listings_cache')
		.upsert(
			{
				card_id: opts.card_id,
				query_key: queryKey,
				provider: result.source,
				payload: result,
				lowest_ask_cents: result.lowest_ask_cents,
				listings_count: result.listings.length,
				fetched_at: result.fetched_at
			},
			{ onConflict: 'card_id,query_key' }
		);
	if (error) {
		log(`upsert failed for ${opts.card_id} (provider=${providerName}): ${error.message}`);
		return 'error';
	}
	return 'warmed';
}

async function pmap<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
	let i = 0;
	const worker = async () => {
		while (i < items.length && !stopping) await fn(items[i++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function writeStatus(s: Record<string, unknown>) {
	try {
		mkdirSync(dirname(STATUS_FILE), { recursive: true });
		writeFileSync(STATUS_FILE, JSON.stringify({ updated_at: ts(), ...s }, null, 2));
	} catch (e) {
		log(`status write failed: ${(e as Error).message}`);
	}
}

async function main() {
	const { values } = parseArgs({
		options: { 'dry-run': { type: 'boolean', default: false } },
		strict: false
	});
	const dryRun = !!values['dry-run'];
	const provider = getLiveListingsProvider();

	log(
		`warm-live-listings start${dryRun ? ' DRY-RUN' : ''} provider=${provider.name} ` +
			`window=${WINDOW_DAYS}d limit=${WARM_LIMIT} conc=${WARM_CONC}`
	);
	if (!dryRun && !usingServiceRole) {
		log(
			'WARNING: SUPABASE_SERVICE_ROLE_KEY not set — upserts will be RLS-filtered to no-op. ' +
				'Set the service-role key or run with --dry-run.'
		);
	}

	const ranked = await topCardsByHits(WARM_LIMIT);
	log(`ranked ${ranked.length} cards from card_query_log (last ${WINDOW_DAYS}d)`);
	if (ranked.length === 0) {
		log('no popularity data yet — nothing to warm');
		writeStatus({ phase: 'empty', ranked: 0, warmed: 0, errors: 0 });
		return;
	}

	const meta = await loadCardMeta(ranked.map((r) => r.card_id));
	const missingMeta = ranked.filter((r) => !meta.has(r.card_id));
	if (missingMeta.length) {
		log(
			`note: ${missingMeta.length} logged card_ids missing from card_index — skipping ` +
				`(top missing: ${missingMeta.slice(0, 3).map((r) => r.card_id).join(', ')})`
		);
	}

	const work = ranked
		.map((r) => ({ ...r, meta: meta.get(r.card_id) }))
		.filter((r): r is typeof r & { meta: CardMeta } => !!r.meta);

	if (dryRun) {
		log('DRY-RUN — top cards by recent hits:');
		for (const r of work.slice(0, 20))
			log(`  ${r.hits.toString().padStart(4)} hits  ${r.card_id}  ${r.meta.name} (${r.meta.set_name})`);
		writeStatus({ phase: 'dry-run', ranked: ranked.length, with_meta: work.length });
		return;
	}

	let warmed = 0;
	let errors = 0;
	await pmap(work, WARM_CONC, async (r) => {
		const opts: FetchForCardOptions = {
			card_id: r.meta.card_id,
			name: r.meta.name,
			set_name: r.meta.set_name,
			card_number: r.meta.card_number ?? ''
		};
		const outcome = await warmOne(opts, provider.name);
		if (outcome === 'warmed') warmed++;
		else errors++;
		if ((warmed + errors) % 25 === 0)
			writeStatus({ phase: 'warming', warmed, errors, total: work.length });
	});

	log(`warm-live-listings done — warmed ${warmed}, errors ${errors} of ${work.length}`);
	writeStatus({
		phase: 'done',
		warmed,
		errors,
		total: work.length,
		ranked: ranked.length,
		provider: provider.name,
		window_days: WINDOW_DAYS
	});
	// Don't fail the cron just because a few cards errored — the warming
	// is best-effort, and the SWR path picks up any cold misses on the
	// next real visit. Only hard-fail if EVERYTHING errored.
	if (work.length > 0 && warmed === 0) process.exit(1);
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
