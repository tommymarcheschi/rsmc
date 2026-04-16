/**
 * Card Enrichment — fetches PriceCharting data for a list of cards.
 *
 * Used by the "Raw → PSA 10 Delta" sort mode in /browse (Phase 1) and
 * by the background card-index enrichment pipeline (Phase 2).
 *
 * Runs scraper lookups in parallel with a concurrency cap so we don't
 * hammer PriceCharting. Each card lookup is ~300ms; with concurrency 5
 * and 100 cards = ~6s total. Well within the 30s serverless budget.
 */

import { fetchPriceCharting } from './pricecharting-scraper';
import { supabase } from './supabase';
import type { PokemonCard } from '$types';
import type { EnrichedCard } from './sort';

const SCRAPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CONCURRENCY = 5;

/**
 * Simple concurrency limiter — runs async tasks with at most `limit`
 * in flight at a time.
 */
async function parallelMap<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let idx = 0;

	async function worker() {
		while (idx < items.length) {
			const i = idx++;
			results[i] = await fn(items[i]);
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

/**
 * Try to read PriceCharting data from scrape_cache.
 * Returns null on miss or stale entry.
 */
async function readCache(cacheKey: string): Promise<Record<string, unknown> | null> {
	try {
		const { data } = await supabase
			.from('scrape_cache')
			.select('data, fetched_at')
			.eq('cache_key', cacheKey)
			.single();

		if (!data) return null;
		const age = Date.now() - new Date(data.fetched_at).getTime();
		if (age > SCRAPE_CACHE_TTL_MS) return null;
		return data.data as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Write PriceCharting data to scrape_cache. Fire-and-forget.
 */
async function writeCache(cacheKey: string, data: unknown): Promise<void> {
	try {
		await supabase.from('scrape_cache').upsert(
			{
				cache_key: cacheKey,
				source: 'pricecharting',
				data,
				fetched_at: new Date().toISOString()
			},
			{ onConflict: 'cache_key' }
		);
	} catch {
		// Non-fatal
	}
}

/**
 * Enrich a single card with PriceCharting data.
 * Checks scrape_cache first, then scrapes fresh if needed.
 */
async function enrichOne(card: PokemonCard): Promise<EnrichedCard> {
	const cacheKey = `pc:${card.name.toLowerCase()}:${(card.set.name ?? '').toLowerCase()}:${(card.number ?? '').toLowerCase()}`;

	// Try cache first
	const cached = await readCache(cacheKey);
	if (cached) {
		return attachEnrichment(card, cached);
	}

	// Scrape fresh
	const pcData = await fetchPriceCharting({
		name: card.name,
		setName: card.set.name,
		cardNumber: card.number
	});

	if (pcData) {
		// Cache the result
		await writeCache(cacheKey, pcData);
		return attachEnrichment(card, pcData as unknown as Record<string, unknown>);
	}

	// No data — return card with null enrichment
	return {
		...card,
		_enrichment: {
			raw_nm_price: getHeadlineMarketPrice(card),
			raw_source: 'tcgplayer',
			psa10_price: null,
			psa10_delta: null,
			psa10_multiple: null,
			pcUrl: null
		}
	};
}

/**
 * Attach PriceCharting data to a card as _enrichment.
 */
function attachEnrichment(card: PokemonCard, pc: Record<string, unknown>): EnrichedCard {
	const ungraded = typeof pc.ungraded === 'number' ? pc.ungraded : null;
	const psa10 = typeof pc.psa10 === 'number' ? pc.psa10 : null;
	const tcgHeadline = getHeadlineMarketPrice(card);

	// Canonical raw price: PriceCharting Ungraded if available, else TCG headline
	const rawPrice = ungraded ?? tcgHeadline;
	const rawSource = ungraded != null ? 'pricecharting' : 'tcgplayer';

	const delta = rawPrice != null && psa10 != null ? psa10 - rawPrice : null;
	const multiple = rawPrice != null && rawPrice > 0 && psa10 != null
		? Math.round((psa10 / rawPrice) * 100) / 100
		: null;

	return {
		...card,
		_enrichment: {
			raw_nm_price: rawPrice,
			raw_source: rawSource,
			psa10_price: psa10,
			psa10_delta: delta,
			psa10_multiple: multiple,
			pcUrl: typeof pc.pcUrl === 'string' ? pc.pcUrl : null
		}
	};
}

/**
 * Get the headline market price from TCGPlayer variants.
 * Picks the highest market price across all printings.
 */
function getHeadlineMarketPrice(card: PokemonCard): number | null {
	const prices = card.tcgplayer?.prices;
	if (!prices) return null;

	let best: number | null = null;
	for (const p of Object.values(prices)) {
		const market = p?.market ?? null;
		if (market != null && (best == null || market > best)) {
			best = market;
		}
	}
	return best;
}

/**
 * Enrich a batch of cards with PriceCharting data.
 * Uses parallel lookups with a concurrency cap.
 */
export async function enrichCardsWithPriceCharting(
	cards: PokemonCard[]
): Promise<EnrichedCard[]> {
	return parallelMap(cards, CONCURRENCY, enrichOne);
}
