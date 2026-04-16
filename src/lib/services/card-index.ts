/**
 * Card Index Enrichment Pipeline
 *
 * Enriches card_index rows with data from three sources:
 *   1. TCG API (card metadata + TCGPlayer prices)
 *   2. PSA scraper (population data)
 *   3. PriceCharting scraper (graded + ungraded prices)
 *
 * Used by scripts/refresh-index.ts for background batch indexing.
 * The enriched data powers /browse?mode=hunt instant SQL-backed filtering.
 */

import { searchCards } from './tcg-api';
import { fetchPriceCharting, type PriceChartingData } from './pricecharting-scraper';
import type { PokemonCard } from '$types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardIndexRow {
	card_id: string;
	name: string;
	set_id: string;
	set_name: string;
	set_series: string | null;
	set_release_date: string;
	card_number: string | null;
	rarity: string | null;
	supertype: string | null;
	subtypes: string[];
	types: string[];
	artist: string | null;
	image_small_url: string | null;
	image_large_url: string | null;
	has_normal: boolean;
	has_holofoil: boolean;
	has_reverse_holofoil: boolean;
	has_first_edition: boolean;
	printing_variants: string[];
	tcg_normal_market: number | null;
	tcg_holofoil_market: number | null;
	tcg_reverse_holofoil_market: number | null;
	tcg_headline_market: number | null;
	tcg_headline_low: number | null;
	raw_nm_price: number | null;
	raw_source: string | null;
	raw_fetched_at: string | null;
	psa10_price: number | null;
	psa10_source: string | null;
	tag10_price: number | null;
	tag10_source: string | null;
	graded_prices_fetched_at: string | null;
	psa_pop_total: number | null;
	psa_pop_10: number | null;
	psa_gem_rate: number | null;
	psa_fetched_at: string | null;
	tag_pop_total: number | null;
	tag_pop_10: number | null;
	tag_fetched_at: string | null;
	last_enriched_at: string;
	enrich_version: number;
	enrich_errors: Record<string, string | null>;
}

export interface EnrichmentResult {
	card_id: string;
	row: CardIndexRow;
	errors: Record<'pricecharting', string | null>;
}

export interface EnrichSetResult {
	processed: number;
	errors: number;
	skipped: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENRICH_VERSION = 1;

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Simple concurrency limiter. */
async function parallelMap<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let idx = 0;

	async function worker() {
		while (idx < items.length) {
			const i = idx++;
			results[i] = await fn(items[i], i);
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

/** Derive printing booleans from TCGPlayer variant keys. */
function derivePrintings(card: PokemonCard) {
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

/** Get headline (highest market price) variant from TCGPlayer data. */
function getHeadline(card: PokemonCard): { market: number | null; low: number | null } {
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

// ---------------------------------------------------------------------------
// Core enrichment for a single card
// ---------------------------------------------------------------------------

export async function enrichCard(
	card: PokemonCard,
	opts?: { force?: boolean }
): Promise<EnrichmentResult> {
	const errors: Record<'pricecharting', string | null> = {
		pricecharting: null
	};

	const printings = derivePrintings(card);
	const headline = getHeadline(card);
	const now = new Date().toISOString();

	// PriceCharting is the single source for prices AND pop data.
	// PSA's website blocks server-side requests (403), but PriceCharting
	// embeds PSA + CGC pop distributions in a JS variable on each page.
	let pc: PriceChartingData | null = null;
	try {
		pc = await fetchPriceCharting({
			name: card.name,
			setName: card.set.name,
			cardNumber: card.number
		});
	} catch (e: unknown) {
		errors.pricecharting = e instanceof Error ? e.message : String(e);
	}

	// Canonical raw price: PriceCharting Ungraded → TCG headline
	const rawFromPc = pc?.ungraded ?? null;
	const rawPrice = rawFromPc ?? headline.market;
	const rawSource = rawFromPc != null ? 'pricecharting' : 'tcgplayer';

	const normalPrices = card.tcgplayer?.prices?.['normal'];
	const holoPrices = card.tcgplayer?.prices?.['holofoil'];
	const reversePrices = card.tcgplayer?.prices?.['reverseHolofoil'];

	// Pop data from PriceCharting's embedded pop_data variable
	const psaPop = pc?.psaPop ?? null;
	const cgcPop = pc?.cgcPop ?? null;

	const row: CardIndexRow = {
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
		tag_pop_total: cgcPop?.total ?? null,  // Using tag columns for CGC until TAG scraper exists
		tag_pop_10: cgcPop?.grade10 ?? null,
		tag_fetched_at: cgcPop ? now : null,
		last_enriched_at: now,
		enrich_version: ENRICH_VERSION,
		enrich_errors: errors
	};

	return { card_id: card.id, row, errors };
}

// ---------------------------------------------------------------------------
// Batch enrichment for a set
// ---------------------------------------------------------------------------

export async function enrichSet(
	setId: string,
	supabaseClient: SupabaseClient,
	opts?: {
		concurrency?: number;
		onProgress?: (processed: number, total: number) => void;
		force?: boolean;
	}
): Promise<EnrichSetResult> {
	const concurrency = opts?.concurrency ?? 6;
	const result: EnrichSetResult = { processed: 0, errors: 0, skipped: 0 };

	// Fetch all cards in the set from TCG API (paginate through 250 at a time)
	let allCards: PokemonCard[] = [];
	let page = 1;
	const pageSize = 250;

	while (true) {
		const res = await searchCards(`set.id:${setId}`, page, pageSize, 'number');
		allCards = allCards.concat(res.data);
		if (allCards.length >= res.totalCount || res.data.length < pageSize) break;
		page++;
	}

	if (allCards.length === 0) return result;

	// Enrich in parallel with concurrency cap + polite delay
	const enriched = await parallelMap(allCards, concurrency, async (card, i) => {
		try {
			const er = await enrichCard(card, { force: opts?.force });

			// Upsert into card_index
			const { error } = await supabaseClient
				.from('card_index')
				.upsert(er.row, { onConflict: 'card_id' });

			if (error) {
				result.errors++;
				return;
			}

			result.processed++;
			opts?.onProgress?.(result.processed, allCards.length);

			// Polite delay between batches
			if (i > 0 && i % concurrency === 0) {
				await delay(300);
			}
		} catch {
			result.errors++;
		}
	});

	return result;
}

// ---------------------------------------------------------------------------
// Stale row re-enrichment
// ---------------------------------------------------------------------------

export async function enrichStale(
	supabaseClient: SupabaseClient,
	limit: number = 500,
	opts?: {
		concurrency?: number;
		onProgress?: (processed: number, total: number) => void;
	}
): Promise<EnrichSetResult> {
	const concurrency = opts?.concurrency ?? 6;
	const result: EnrichSetResult = { processed: 0, errors: 0, skipped: 0 };

	// Find the oldest card_index rows
	const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const { data: staleRows } = await supabaseClient
		.from('card_index')
		.select('card_id, set_id')
		.lt('last_enriched_at', staleThreshold)
		.order('last_enriched_at', { ascending: true })
		.limit(limit);

	if (!staleRows || staleRows.length === 0) return result;

	// For stale rows, we need to re-fetch the card from TCG API
	await parallelMap(staleRows, concurrency, async (stale: Record<string, unknown>, i) => {
		try {
			const cardId = stale.card_id as string;
			// Import dynamically to avoid circular deps in the script context
			const { getCard } = await import('./tcg-api');
			const card = await getCard(cardId);
			const er = await enrichCard(card, { force: true });

			const { error } = await supabaseClient
				.from('card_index')
				.upsert(er.row, { onConflict: 'card_id' });

			if (error) {
				result.errors++;
				return;
			}

			result.processed++;
			opts?.onProgress?.(result.processed, staleRows.length);

			if (i > 0 && i % concurrency === 0) {
				await delay(300);
			}
		} catch {
			result.errors++;
		}
	});

	return result;
}
