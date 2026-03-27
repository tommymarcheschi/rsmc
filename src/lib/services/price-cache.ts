/**
 * Price Cache Service — Caches TCGPlayer prices from the Pokemon TCG API into Supabase
 *
 * The Pokemon TCG API returns free TCGPlayer price data on every card.
 * This service caches that data in Supabase for:
 * 1. Price history over time (daily snapshots)
 * 2. Fast portfolio valuation (no API calls needed)
 * 3. Offline price access when the TCG API is slow/down
 */

import { supabase } from './supabase';
import type { TCGPlayerData, PriceData } from '$types';
import type { PriceHistory } from './price-tracker';

/** Preferred variant order for picking a "primary" price */
const VARIANT_PRIORITY = [
	'holofoil',
	'reverseHolofoil',
	'normal',
	'1stEditionHolofoil',
	'1stEditionNormal',
	'unlimited',
	'unlimitedHolofoil'
];

/**
 * Pick the best market price from a card's TCGPlayer variants.
 * Prefers holofoil > reverseHolofoil > normal > any other.
 */
function pickMarketPrice(prices: Record<string, PriceData>): number | null {
	for (const variant of VARIANT_PRIORITY) {
		const p = prices[variant];
		if (p?.market != null) return p.market;
		if (p?.mid != null) return p.mid;
	}
	// Fallback: first variant with a market or mid price
	for (const p of Object.values(prices)) {
		if (p?.market != null) return p.market;
		if (p?.mid != null) return p.mid;
	}
	return null;
}

/**
 * Check if we already cached this card's price today.
 * Returns true if cache is stale (needs update).
 */
export async function shouldCachePrice(cardId: string): Promise<boolean> {
	try {
		const today = new Date().toISOString().split('T')[0];
		const { data } = await supabase
			.from('price_cache')
			.select('cached_at')
			.eq('card_id', cardId)
			.eq('source', 'tcgplayer')
			.single();

		if (!data) return true;
		const cachedDate = data.cached_at?.split('T')[0];
		return cachedDate !== today;
	} catch {
		return true;
	}
}

/**
 * Cache TCGPlayer prices into both price_cache (latest) and price_history (daily snapshot).
 * Fire-and-forget — errors are caught and never block page loads.
 */
export async function cacheTcgPlayerPrices(
	cardId: string,
	tcgplayer: TCGPlayerData
): Promise<void> {
	const prices = tcgplayer.prices;
	if (!prices || Object.keys(prices).length === 0) return;

	const stale = await shouldCachePrice(cardId);
	if (!stale) return;

	const marketPrice = pickMarketPrice(prices);

	// 1. Upsert price_cache (latest snapshot)
	try {
		await supabase
			.from('price_cache')
			.upsert(
				{
					card_id: cardId,
					source: 'tcgplayer',
					raw_price: marketPrice,
					graded_prices: prices,
					cached_at: new Date().toISOString()
				},
				{ onConflict: 'card_id,source' }
			);
	} catch {
		// Ignore — fire-and-forget
	}

	// 2. Upsert price_history rows (one per variant)
	const today = new Date().toISOString().split('T')[0];
	const rows = Object.entries(prices).map(([variant, p]) => ({
		card_id: cardId,
		variant,
		low: p.low ?? null,
		mid: p.mid ?? null,
		high: p.high ?? null,
		market: p.market ?? null,
		direct_low: p.directLow ?? null,
		recorded_at: today
	}));

	if (rows.length > 0) {
		try {
			await supabase
				.from('price_history')
				.upsert(rows, { onConflict: 'card_id,variant,recorded_at' });
		} catch {
			// Ignore — fire-and-forget
		}
	}
}

/**
 * Get price history for a card from cached daily snapshots.
 * Returns data in the format PriceChart.svelte expects.
 */
export async function getPriceHistoryFromCache(
	cardId: string,
	days: number = 365
): Promise<PriceHistory | null> {
	try {
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().split('T')[0];

		const { data, error } = await supabase
			.from('price_history')
			.select('variant, market, mid, recorded_at')
			.eq('card_id', cardId)
			.gte('recorded_at', sinceStr)
			.order('recorded_at', { ascending: true });

		if (error || !data || data.length === 0) return null;

		// Group by date, pick best variant price per day
		const byDate = new Map<string, number>();
		for (const row of data) {
			const price = row.market ?? row.mid;
			if (price == null) continue;

			const existing = byDate.get(row.recorded_at);
			// Keep the first non-null price per date (data comes sorted)
			if (existing == null) {
				byDate.set(row.recorded_at, price);
			}
		}

		if (byDate.size === 0) return null;

		const dataPoints = Array.from(byDate.entries()).map(([date, price]) => ({
			date,
			price
		}));

		return {
			card_id: cardId,
			data_points: dataPoints,
			period: `${days}d`
		};
	} catch {
		return null;
	}
}

/**
 * Get the latest cached price for a single card.
 */
export async function getCachedPrice(
	cardId: string
): Promise<{ market: number; prices: Record<string, PriceData> } | null> {
	try {
		const { data } = await supabase
			.from('price_cache')
			.select('raw_price, graded_prices')
			.eq('card_id', cardId)
			.eq('source', 'tcgplayer')
			.single();

		if (!data || data.raw_price == null) return null;

		return {
			market: Number(data.raw_price),
			prices: (data.graded_prices as Record<string, PriceData>) ?? {}
		};
	} catch {
		return null;
	}
}

/**
 * Batch-fetch cached market prices for multiple cards.
 * Used by dashboard for portfolio valuation.
 */
export async function getCachedPricesForCards(
	cardIds: string[]
): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	if (cardIds.length === 0) return result;

	try {
		const { data } = await supabase
			.from('price_cache')
			.select('card_id, raw_price')
			.eq('source', 'tcgplayer')
			.in('card_id', cardIds);

		if (data) {
			for (const row of data) {
				if (row.raw_price != null) {
					result.set(row.card_id, Number(row.raw_price));
				}
			}
		}
	} catch {
		// Return whatever we got
	}

	return result;
}
