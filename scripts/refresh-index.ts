#!/usr/bin/env tsx
/**
 * Trove Card Index Refresher
 *
 * Batch-enriches card_index rows with PSA pop + PriceCharting prices.
 * Runs locally via `tsx scripts/refresh-index.ts`.
 *
 * Usage:
 *   tsx scripts/refresh-index.ts --set base1,base2    # specific sets
 *   tsx scripts/refresh-index.ts --all                # all tracked sets
 *   tsx scripts/refresh-index.ts --stale 500          # oldest N stale rows
 *   tsx scripts/refresh-index.ts --card base1-4       # single card (debug)
 *   tsx scripts/refresh-index.ts --seed-before 2017   # seed tracked_sets for all pre-YYYY sets
 *   tsx scripts/refresh-index.ts --dry-run             # show what would run
 *
 * Required env vars (from .env.local):
 *   PUBLIC_SUPABASE_URL
 *   PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY  (or SUPABASE_SERVICE_ROLE_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Env setup — load from .env.local if present
// ---------------------------------------------------------------------------

import { config } from 'dotenv';
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
// Inline scrapers — we can't use SvelteKit $service aliases from a script,
// so we import the scraper modules by relative path.
// ---------------------------------------------------------------------------

// PriceCharting scraper is imported but may be Cloudflare-blocked when run
// from local Node.js. We fall back to routing through the app's /api/pricecharting
// endpoint when a dev server URL is available (it uses SvelteKit's fetch which
// passes Cloudflare). Set DEV_SERVER_URL=http://localhost:5178 in .env.local.
import { fetchPriceCharting as fetchPriceChartingDirect } from '../src/lib/services/pricecharting-scraper.js';

const DEV_SERVER_URL = process.env.DEV_SERVER_URL ?? '';

async function fetchPriceCharting(opts: { name: string; setName?: string; cardNumber?: string }) {
	// Try direct scraping first
	const direct = await fetchPriceChartingDirect(opts);
	if (direct) return direct;

	// Fallback: proxy through the running dev server's API endpoint
	if (!DEV_SERVER_URL) return null;
	try {
		const params = new URLSearchParams({ name: opts.name });
		if (opts.setName) params.set('set', opts.setName);
		if (opts.cardNumber) params.set('number', opts.cardNumber);
		const res = await fetch(`${DEV_SERVER_URL}/api/pricecharting?${params}`);
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

// TCG API — also plain fetch:
const TCG_BASE = 'https://api.pokemontcg.io/v2';
function tcgHeaders(): HeadersInit {
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	const key = process.env.POKEMON_TCG_API_KEY ?? '';
	if (key) (headers as Record<string, string>)['X-Api-Key'] = key;
	return headers;
}

interface TcgCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	types?: string[];
	number: string;
	artist?: string;
	rarity?: string;
	set: { id: string; name: string; series: string; releaseDate: string };
	images: { small: string; large: string };
	tcgplayer?: { prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }> };
}

async function fetchTcgCards(query: string, page = 1, pageSize = 250): Promise<{ data: TcgCard[]; totalCount: number }> {
	const params = new URLSearchParams({ q: query, page: String(page), pageSize: String(pageSize), orderBy: 'number' });
	const res = await fetch(`${TCG_BASE}/cards?${params}`, { headers: tcgHeaders() });
	if (!res.ok) throw new Error(`TCG API ${res.status}`);
	const json = await res.json();
	return { data: json.data ?? [], totalCount: json.totalCount ?? 0 };
}

async function fetchTcgSets(): Promise<Array<{ id: string; name: string; series: string; releaseDate: string; total: number }>> {
	const res = await fetch(`${TCG_BASE}/sets?orderBy=-releaseDate`, { headers: tcgHeaders() });
	if (!res.ok) throw new Error(`TCG API ${res.status}`);
	const json = await res.json();
	return json.data ?? [];
}

// ---------------------------------------------------------------------------
// Enrichment (mirrors card-index.ts but standalone)
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function parallelMap<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let idx = 0;
	async function worker() {
		while (idx < items.length) {
			const i = idx++;
			results[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}

function derivePrintings(card: TcgCard) {
	const keys = Object.keys(card.tcgplayer?.prices ?? {});
	const variants = keys.map((k) => k.toLowerCase());
	return {
		has_normal: variants.some((v) => v === 'normal'),
		has_holofoil: variants.some((v) => v.includes('holofoil') && !v.includes('reverse')),
		has_reverse_holofoil: variants.some((v) => v.includes('reverseholofoil')),
		has_first_edition: variants.some((v) => v.includes('1stedition')),
		printing_variants: keys
	};
}

function getHeadline(card: TcgCard): { market: number | null; low: number | null } {
	const prices = card.tcgplayer?.prices;
	if (!prices) return { market: null, low: null };
	let bestMarket: number | null = null;
	let bestLow: number | null = null;
	for (const p of Object.values(prices)) {
		const m = p?.market ?? null;
		if (m != null && (bestMarket == null || m > bestMarket)) {
			bestMarket = m;
			bestLow = p?.low ?? null;
		}
	}
	return { market: bestMarket, low: bestLow };
}

async function enrichOneCard(card: TcgCard): Promise<Record<string, unknown>> {
	const errors: Record<string, string | null> = { pricecharting: null };
	const printings = derivePrintings(card);
	const headline = getHeadline(card);
	const now = new Date().toISOString();

	// PriceCharting is the single source for prices AND pop data.
	// PSA's website blocks server-side requests (403), but PriceCharting
	// embeds PSA + CGC pop distributions in a JS variable on each page.
	let pc: Awaited<ReturnType<typeof fetchPriceCharting>> = null;

	try {
		pc = await fetchPriceCharting({
			name: card.name,
			setName: card.set.name,
			cardNumber: card.number
		});
	} catch (e: unknown) {
		errors.pricecharting = e instanceof Error ? e.message : String(e);
	}

	const rawFromPc = pc?.ungraded ?? null;
	const rawPrice = rawFromPc ?? headline.market;
	const rawSource = rawFromPc != null ? 'pricecharting' : 'tcgplayer';

	const normalPrices = card.tcgplayer?.prices?.['normal'];
	const holoPrices = card.tcgplayer?.prices?.['holofoil'];
	const reversePrices = card.tcgplayer?.prices?.['reverseHolofoil'];

	// Pop data from PriceCharting's embedded pop_data variable
	const psaPop = pc?.psaPop ?? null;
	const cgcPop = pc?.cgcPop ?? null;

	return {
		card_id: card.id,
		name: card.name,
		set_id: card.set.id,
		set_name: card.set.name,
		set_series: card.set.series ?? null,
		set_release_date: card.set.releaseDate,
		card_number: card.number ?? null,
		rarity: card.rarity ?? null,
		supertype: card.supertype ?? null,
		subtypes: card.subtypes ?? [],
		types: card.types ?? [],
		artist: card.artist ?? null,
		image_small_url: card.images.small ?? null,
		image_large_url: card.images.large ?? null,
		...printings,
		tcg_normal_market: normalPrices?.market ?? null,
		tcg_holofoil_market: holoPrices?.market ?? null,
		tcg_reverse_holofoil_market: reversePrices?.market ?? null,
		tcg_headline_market: headline.market,
		tcg_headline_low: headline.low,
		raw_nm_price: rawPrice,
		raw_source: rawSource,
		raw_fetched_at: now,
		psa10_price: pc?.psa10 ?? null,
		psa10_source: pc?.psa10 != null ? 'pricecharting' : null,
		tag10_price: pc?.tag10 ?? null,
		tag10_source: pc?.tag10 != null ? 'pricecharting' : null,
		graded_prices_fetched_at: pc ? now : null,
		psa_pop_total: psaPop?.total ?? null,
		psa_pop_10: psaPop?.grade10 ?? null,
		psa_gem_rate: psaPop?.gemRate ?? null,
		psa_fetched_at: psaPop ? now : null,
		tag_pop_total: cgcPop?.total ?? null,  // Using tag_pop columns for CGC until TAG scraper exists
		tag_pop_10: cgcPop?.grade10 ?? null,
		tag_fetched_at: cgcPop ? now : null,
		last_enriched_at: now,
		enrich_version: 2,
		enrich_errors: errors
	};
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function indexSet(setId: string, concurrency: number, dryRun: boolean) {
	const start = Date.now();
	console.log(`[${setId}] Fetching cards from TCG API...`);

	let allCards: TcgCard[] = [];
	let page = 1;
	while (true) {
		const res = await fetchTcgCards(`set.id:${setId}`, page, 250);
		allCards = allCards.concat(res.data);
		if (allCards.length >= res.totalCount || res.data.length < 250) break;
		page++;
	}

	console.log(`[${setId}] ${allCards.length} cards found`);
	if (dryRun) {
		console.log(`[${setId}] DRY RUN — would enrich ${allCards.length} cards`);
		return { processed: 0, errors: 0 };
	}

	let processed = 0;
	let errors = 0;

	await parallelMap(allCards, concurrency, async (card, i) => {
		try {
			const row = await enrichOneCard(card);
			const { error } = await supabase.from('card_index').upsert(row, { onConflict: 'card_id' });
			if (error) {
				errors++;
				console.error(`  [${card.id}] DB error: ${error.message}`);
			} else {
				processed++;
			}

			if (processed % 10 === 0 || processed === allCards.length) {
				const elapsed = ((Date.now() - start) / 1000).toFixed(1);
				process.stdout.write(`\r[${setId}] ${processed}/${allCards.length} cards (${elapsed}s) — ${errors} errors`);
			}

			// Polite delay
			if (i > 0 && i % concurrency === 0) await delay(300);
		} catch (e) {
			errors++;
			console.error(`\n  [${card.id}] Exception: ${e}`);
		}
	});

	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log(`\n[${setId}] Done: ${processed} processed, ${errors} errors in ${elapsed}s`);

	// Update tracked_sets
	await supabase.from('tracked_sets').upsert({
		set_id: setId,
		set_name: allCards[0]?.set.name ?? setId,
		series: allCards[0]?.set.series ?? null,
		release_date: allCards[0]?.set.releaseDate ?? '1999-01-01',
		total_cards: allCards.length,
		enabled: true,
		last_indexed_at: new Date().toISOString(),
		last_index_duration_ms: Date.now() - start,
		last_index_error: errors > 0 ? `${errors} card errors` : null
	}, { onConflict: 'set_id' });

	return { processed, errors };
}

async function indexStale(limit: number, concurrency: number, dryRun: boolean) {
	const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const { data: staleRows } = await supabase
		.from('card_index')
		.select('card_id')
		.lt('last_enriched_at', staleThreshold)
		.order('last_enriched_at', { ascending: true })
		.limit(limit);

	if (!staleRows || staleRows.length === 0) {
		console.log('No stale rows found.');
		return;
	}

	console.log(`Found ${staleRows.length} stale rows`);
	if (dryRun) {
		console.log('DRY RUN — would re-enrich these cards');
		return;
	}

	let processed = 0;
	let errors = 0;

	await parallelMap(staleRows, concurrency, async (stale, i) => {
		try {
			const cardId = (stale as Record<string, unknown>).card_id as string;
			const tcgRes = await fetch(`${TCG_BASE}/cards/${cardId}`, { headers: tcgHeaders() });
			if (!tcgRes.ok) { errors++; return; }
			const card = (await tcgRes.json()).data as TcgCard;
			const row = await enrichOneCard(card);
			const { error } = await supabase.from('card_index').upsert(row, { onConflict: 'card_id' });
			if (error) errors++;
			else processed++;

			if (processed % 10 === 0) {
				process.stdout.write(`\r  Stale: ${processed}/${staleRows.length} (${errors} errors)`);
			}

			if (i > 0 && i % concurrency === 0) await delay(300);
		} catch {
			errors++;
		}
	});

	console.log(`\nStale refresh: ${processed} processed, ${errors} errors`);
}

async function seedTrackedSets(opts: { beforeYear?: number; all?: boolean }) {
	const sets = await fetchTcgSets();

	const matching = opts.all
		? sets
		: sets.filter((s) => {
				const year = parseInt(s.releaseDate?.split('/')[0] ?? s.releaseDate?.split('-')[0] ?? '9999');
				return opts.beforeYear ? year < opts.beforeYear : false;
			});

	const label = opts.all ? 'ALL sets' : `sets before ${opts.beforeYear}`;
	console.log(`Seeding tracked_sets for ${label}...`);
	console.log(`Found ${matching.length} ${label}`);

	for (const s of matching) {
		await supabase.from('tracked_sets').upsert({
			set_id: s.id,
			set_name: s.name,
			series: s.series ?? null,
			release_date: s.releaseDate,
			total_cards: s.total,
			enabled: true
		}, { onConflict: 'set_id' });
	}

	console.log(`Seeded ${matching.length} sets into tracked_sets`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
	const { values } = parseArgs({
		options: {
			set: { type: 'string' },
			all: { type: 'boolean', default: false },
			unindexed: { type: 'boolean', default: false },
			stale: { type: 'string' },
			card: { type: 'string' },
			'seed-before': { type: 'string' },
			'seed-all': { type: 'boolean', default: false },
			'dry-run': { type: 'boolean', default: false },
			concurrency: { type: 'string', default: '6' },
			force: { type: 'boolean', default: false }
		},
		strict: false
	});

	const concurrency = parseInt(values.concurrency as string) || 6;
	const dryRun = !!values['dry-run'];

	if (values['seed-all']) {
		await seedTrackedSets({ all: true });
		return;
	}

	if (values['seed-before']) {
		await seedTrackedSets({ beforeYear: parseInt(values['seed-before'] as string) });
		return;
	}

	if (values.card) {
		const cardId = values.card as string;
		console.log(`Enriching single card: ${cardId}`);
		const tcgRes = await fetch(`${TCG_BASE}/cards/${cardId}`, { headers: tcgHeaders() });
		if (!tcgRes.ok) { console.error(`TCG API ${tcgRes.status}`); return; }
		const card = (await tcgRes.json()).data as TcgCard;
		const row = await enrichOneCard(card);
		if (dryRun) {
			console.log('DRY RUN result:');
			console.log(JSON.stringify(row, null, 2));
		} else {
			await supabase.from('card_index').upsert(row, { onConflict: 'card_id' });
			console.log('Upserted into card_index');
			console.log(JSON.stringify(row, null, 2));
		}
		return;
	}

	if (values.stale) {
		await indexStale(parseInt(values.stale as string) || 500, concurrency, dryRun);
		return;
	}

	if (values.set) {
		const setIds = (values.set as string).split(',').map((s) => s.trim());
		for (const setId of setIds) {
			await indexSet(setId, concurrency, dryRun);
		}
		return;
	}

	if (values.all || values.unindexed) {
		let query = supabase
			.from('tracked_sets')
			.select('set_id, last_indexed_at')
			.eq('enabled', true)
			.order('release_date', { ascending: true });

		// --unindexed only processes sets that have never been indexed yet.
		// Saves time when growing the index incrementally.
		if (values.unindexed) {
			query = query.is('last_indexed_at', null);
		}

		const { data: tracked } = await query;

		if (!tracked || tracked.length === 0) {
			console.log(values.unindexed
				? 'No unindexed sets. Every tracked set has been processed.'
				: 'No tracked sets. Use --seed-all or --seed-before <year> first.');
			return;
		}

		const label = values.unindexed ? 'unindexed' : 'tracked';
		console.log(`Processing ${tracked.length} ${label} sets...`);
		for (const row of tracked) {
			await indexSet((row as Record<string, unknown>).set_id as string, concurrency, dryRun);
		}
		return;
	}

	console.log(`
Trove Card Index Refresher

Usage:
  tsx scripts/refresh-index.ts --set base1,base2    # specific sets
  tsx scripts/refresh-index.ts --all                # all tracked sets
  tsx scripts/refresh-index.ts --unindexed          # only sets not yet indexed
  tsx scripts/refresh-index.ts --stale 500          # oldest N stale rows
  tsx scripts/refresh-index.ts --card base1-4       # single card (debug)
  tsx scripts/refresh-index.ts --seed-all           # seed tracked_sets with every set
  tsx scripts/refresh-index.ts --seed-before 2017   # seed only pre-year sets

Options:
  --concurrency N    Parallel enrichment (default: 6)
  --dry-run          Show what would run, don't write
  --force            Bust cache and re-scrape
`);
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
