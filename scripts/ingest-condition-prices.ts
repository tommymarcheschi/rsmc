#!/usr/bin/env tsx
/**
 * Trove — per-condition price ingestion (Phase 1)
 *
 * Walks tracked sets (or a subset via --set / --card / --limit), resolves
 * each card_index row to a TCGPlayer productId, fetches active listings,
 * writes confident events to sale_events, then derives today's snapshot in
 * condition_price_snapshots per (card_id, condition).
 *
 * Usage:
 *   tsx scripts/ingest-condition-prices.ts --card base1-4       # one card
 *   tsx scripts/ingest-condition-prices.ts --set base1          # one set
 *   tsx scripts/ingest-condition-prices.ts --limit 20           # first 20 cards (debug)
 *   tsx scripts/ingest-condition-prices.ts --all                # everything tracked
 *   tsx scripts/ingest-condition-prices.ts --dry-run            # no writes
 *   tsx scripts/ingest-condition-prices.ts --no-resume          # rescrape today's cards
 *
 * Env vars required (.env.local):
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (or PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
 *
 * Optional:
 *   POKEMON_TCG_API_KEY — improves rate limits on productId resolution
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import {
	fetchTCGPlayerListings,
	type TCGListing
} from '../src/lib/services/tcgplayer-listings-scraper.js';
import { MIN_SNAPSHOT_CONFIDENCE } from '../src/lib/services/condition-detector.js';

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

// ---------------------------------------------------------------------------
// Tuning knobs
// ---------------------------------------------------------------------------

const PER_CARD_LIMIT = 200; // max listings pulled per card (endpoint hard-ish cap)
const PER_CARD_DELAY_MS = 200; // roadmap: 200ms polite delay between cards
const MAX_RETRIES = 4;
const BATCH_SIZE = 50; // sale_events insert batch

// Events older than this are excluded from today's snapshot math.
const SNAPSHOT_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	setIds?: string[];
	cardId?: string;
	limit?: number;
	all: boolean;
	dryRun: boolean;
	resume: boolean;
}

function parseCli(): CliOptions {
	const { values } = parseArgs({
		options: {
			set: { type: 'string' },
			card: { type: 'string' },
			limit: { type: 'string' },
			all: { type: 'boolean', default: false },
			'dry-run': { type: 'boolean', default: false },
			'no-resume': { type: 'boolean', default: false }
		},
		strict: false
	});
	return {
		setIds: values.set ? String(values.set).split(',').map((s) => s.trim()) : undefined,
		cardId: values.card ? String(values.card) : undefined,
		limit: values.limit ? parseInt(String(values.limit), 10) : undefined,
		all: !!values.all,
		dryRun: !!values['dry-run'],
		resume: !values['no-resume']
	};
}

// ---------------------------------------------------------------------------
// Card loading
// ---------------------------------------------------------------------------

interface CardRow {
	card_id: string;
	name: string;
	set_id: string;
	set_name: string;
	card_number: string | null;
}

async function loadCards(opts: CliOptions): Promise<CardRow[]> {
	if (opts.cardId) {
		const { data, error } = await supabase
			.from('card_index')
			.select('card_id, name, set_id, set_name, card_number')
			.eq('card_id', opts.cardId)
			.limit(1);
		if (error) throw error;
		return (data ?? []) as CardRow[];
	}

	let query = supabase
		.from('card_index')
		.select('card_id, name, set_id, set_name, card_number')
		.order('card_id', { ascending: true });

	if (opts.setIds && opts.setIds.length > 0) {
		query = query.in('set_id', opts.setIds);
	} else if (opts.all) {
		// walk all tracked sets
		const { data: tracked } = await supabase
			.from('tracked_sets')
			.select('set_id')
			.eq('enabled', true);
		const ids = (tracked ?? []).map((r: { set_id: string }) => r.set_id);
		if (ids.length === 0) return [];
		query = query.in('set_id', ids);
	} else {
		// no filter: just cap via limit flag so accidental runs don't scrape
		// the entire tracked universe
	}

	if (opts.limit != null) query = query.limit(opts.limit);

	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []) as CardRow[];
}

// ---------------------------------------------------------------------------
// productId resolution (pokemontcg.io redirect → /product/{id}/…)
// ---------------------------------------------------------------------------

const productIdCache = new Map<string, string | null>();

async function resolveProductId(cardId: string): Promise<string | null> {
	if (productIdCache.has(cardId)) return productIdCache.get(cardId) ?? null;
	try {
		const res = await fetch(`https://prices.pokemontcg.io/tcgplayer/${cardId}`, {
			redirect: 'manual',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
			}
		});
		const location = res.headers.get('location');
		const match = location?.match(/\/product\/(\d+)(?:[\/?]|$)/);
		const pid = match?.[1] ?? null;
		productIdCache.set(cardId, pid);
		return pid;
	} catch {
		productIdCache.set(cardId, null);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Resume: skip cards already ingested today
// ---------------------------------------------------------------------------

async function alreadyIngestedToday(cardId: string): Promise<boolean> {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);
	const { count, error } = await supabase
		.from('sale_events')
		.select('id', { head: true, count: 'exact' })
		.eq('card_id', cardId)
		.eq('marketplace', 'tcgplayer')
		.gte('observed_at', startOfDay.toISOString());
	if (error) return false;
	return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Scrape + write
// ---------------------------------------------------------------------------

async function withBackoff<T>(fn: () => Promise<T>): Promise<T | null> {
	let delayMs = 400;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt === MAX_RETRIES) {
				console.error(`    giving up: ${(err as Error).message}`);
				return null;
			}
			await sleep(delayMs);
			delayMs *= 2;
		}
	}
	return null;
}

interface SaleEventRow {
	card_id: string;
	marketplace: string;
	external_id: string | null;
	title: string | null;
	price_cents: number;
	currency: string;
	condition: string | null;
	condition_confidence: number | null;
	event_type: 'listing' | 'sold';
	observed_at: string;
}

function listingsToEvents(cardId: string, listings: TCGListing[], now: string): SaleEventRow[] {
	return listings.map((l) => ({
		card_id: cardId,
		marketplace: 'tcgplayer',
		external_id: l.listingId,
		title: buildTitle(l),
		price_cents: l.price_cents,
		currency: 'USD',
		// NULL out low-confidence conditions so the check constraint is happy
		// AND the aggregate filter excludes them. The raw condition string is
		// still preserved in `title` for future re-analysis.
		condition:
			l.condition != null && l.confidence >= MIN_SNAPSHOT_CONFIDENCE ? l.condition : null,
		condition_confidence: l.confidence > 0 ? roundTo(l.confidence, 2) : null,
		event_type: 'listing',
		observed_at: now
	}));
}

function buildTitle(l: TCGListing): string {
	const bits: string[] = [];
	if (l.printing) bits.push(l.printing);
	if (l.rawCondition) bits.push(l.rawCondition);
	if (l.seller) bits.push(`by ${l.seller}`);
	return bits.join(' | ');
}

async function insertEvents(rows: SaleEventRow[], dryRun: boolean): Promise<number> {
	if (rows.length === 0) return 0;
	if (dryRun) return rows.length;

	let written = 0;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		// Plain insert. Same-day reruns are blocked by `alreadyIngestedToday`,
		// and within a single run the scraper already dedupes by listingId.
		// The partial unique index on (marketplace, external_id) is a
		// belt-and-suspenders safety net — Supabase can't target it from
		// `.upsert()` because partial indexes aren't full constraints.
		const { error, count } = await supabase
			.from('sale_events')
			.insert(batch, { count: 'exact' });
		if (error) {
			console.error(`    insert error: ${error.message}`);
			continue;
		}
		written += count ?? batch.length;
	}
	return written;
}

// ---------------------------------------------------------------------------
// Snapshot derivation
// ---------------------------------------------------------------------------

interface SnapshotRow {
	card_id: string;
	condition: string;
	snapshot_date: string;
	median_cents: number;
	p25_cents: number;
	p75_cents: number;
	sample_count: number;
	freshness_score: number;
}

async function computeSnapshots(cardId: string): Promise<SnapshotRow[]> {
	const windowStart = new Date(Date.now() - SNAPSHOT_WINDOW_DAYS * 86_400_000).toISOString();
	const { data, error } = await supabase
		.from('sale_events')
		.select('condition, price_cents, observed_at')
		.eq('card_id', cardId)
		.gte('observed_at', windowStart)
		.not('condition', 'is', null);
	if (error) {
		console.error(`    snapshot query error: ${error.message}`);
		return [];
	}

	const buckets = new Map<
		string,
		Array<{ price: number; age_days: number }>
	>();
	const today = new Date();
	for (const row of (data ?? []) as Array<{
		condition: string;
		price_cents: number;
		observed_at: string;
	}>) {
		const ageDays = (today.getTime() - new Date(row.observed_at).getTime()) / 86_400_000;
		const arr = buckets.get(row.condition) ?? [];
		arr.push({ price: row.price_cents, age_days: ageDays });
		buckets.set(row.condition, arr);
	}

	const snapshotDate = today.toISOString().slice(0, 10);
	const snapshots: SnapshotRow[] = [];
	for (const [condition, rows] of buckets) {
		const sorted = rows.slice().sort((a, b) => a.price - b.price);
		const median = percentile(sorted.map((r) => r.price), 50);
		const p25 = percentile(sorted.map((r) => r.price), 25);
		const p75 = percentile(sorted.map((r) => r.price), 75);
		// Linear freshness: events age 0 = 1.0, age 30 = 0.0
		const freshness =
			rows.reduce(
				(sum, r) => sum + Math.max(0, 1 - r.age_days / SNAPSHOT_WINDOW_DAYS),
				0
			) / rows.length;
		snapshots.push({
			card_id: cardId,
			condition,
			snapshot_date: snapshotDate,
			median_cents: Math.round(median),
			p25_cents: Math.round(p25),
			p75_cents: Math.round(p75),
			sample_count: rows.length,
			freshness_score: roundTo(freshness, 2)
		});
	}
	return snapshots;
}

async function upsertSnapshots(snapshots: SnapshotRow[], dryRun: boolean): Promise<number> {
	if (snapshots.length === 0 || dryRun) return snapshots.length;
	const { error } = await supabase
		.from('condition_price_snapshots')
		.upsert(snapshots, { onConflict: 'card_id,condition,snapshot_date' });
	if (error) {
		console.error(`    snapshot upsert error: ${error.message}`);
		return 0;
	}
	return snapshots.length;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function processCard(card: CardRow, opts: CliOptions): Promise<'ok' | 'skip' | 'noid' | 'empty' | 'err'> {
	if (opts.resume && (await alreadyIngestedToday(card.card_id))) return 'skip';

	const productId = await resolveProductId(card.card_id);
	if (!productId) return 'noid';

	const result = await withBackoff(() =>
		fetchTCGPlayerListings({ productId, limit: PER_CARD_LIMIT })
	);
	if (!result || result.listings.length === 0) return 'empty';

	const now = new Date().toISOString();
	const events = listingsToEvents(card.card_id, result.listings, now);
	const written = await insertEvents(events, opts.dryRun);
	const snapshots = await computeSnapshots(card.card_id);
	const snapWritten = await upsertSnapshots(snapshots, opts.dryRun);

	const splits = summariseSnapshots(snapshots);
	console.log(
		`  [${card.card_id}] ${card.name}: ${written} events, ${snapWritten} snapshots — ${splits}`
	);
	return 'ok';
}

function summariseSnapshots(snapshots: SnapshotRow[]): string {
	if (snapshots.length === 0) return 'no-confident-conditions';
	return snapshots
		.sort(conditionOrder)
		.map(
			(s) =>
				`${s.condition} $${(s.median_cents / 100).toFixed(2)} n=${s.sample_count}` +
				(s.sample_count < 10 ? '*' : '')
		)
		.join(' / ');
}

const CONDITION_ORDER: Record<string, number> = { NM: 0, LP: 1, MP: 2, HP: 3, DMG: 4 };
function conditionOrder(a: { condition: string }, b: { condition: string }): number {
	return (CONDITION_ORDER[a.condition] ?? 9) - (CONDITION_ORDER[b.condition] ?? 9);
}

async function main(): Promise<void> {
	const opts = parseCli();
	const cards = await loadCards(opts);
	if (cards.length === 0) {
		console.log('No cards matched. Use --card, --set, --all, or --limit.');
		return;
	}

	console.log(
		`Ingesting condition prices for ${cards.length} card(s)` +
			(opts.dryRun ? ' [DRY RUN]' : '') +
			(opts.resume ? ' [resume on]' : ' [resume off]')
	);

	const counts = { ok: 0, skip: 0, noid: 0, empty: 0, err: 0 };
	const start = Date.now();

	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		try {
			const outcome = await processCard(card, opts);
			counts[outcome]++;
		} catch (err) {
			counts.err++;
			console.error(`  [${card.card_id}] ${(err as Error).message}`);
		}
		if (i < cards.length - 1) await sleep(PER_CARD_DELAY_MS);

		if ((i + 1) % 25 === 0) {
			const elapsed = ((Date.now() - start) / 1000).toFixed(0);
			console.log(
				`  progress: ${i + 1}/${cards.length}  (${elapsed}s)  ok=${counts.ok} ` +
					`skip=${counts.skip} noid=${counts.noid} empty=${counts.empty} err=${counts.err}`
			);
		}
	}

	const elapsed = ((Date.now() - start) / 1000).toFixed(0);
	console.log(
		`\nDone in ${elapsed}s — ok=${counts.ok} skip=${counts.skip} ` +
			`noid=${counts.noid} empty=${counts.empty} err=${counts.err}`
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function percentile(sortedAsc: number[], p: number): number {
	if (sortedAsc.length === 0) return 0;
	const idx = Math.min(
		sortedAsc.length - 1,
		Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1)))
	);
	return sortedAsc[idx];
}

function roundTo(n: number, places: number): number {
	const m = 10 ** places;
	return Math.round(n * m) / m;
}

main().catch((err) => {
	console.error('fatal:', err);
	process.exit(1);
});
