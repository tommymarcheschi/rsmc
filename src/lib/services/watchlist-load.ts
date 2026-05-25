/**
 * Watchlist loader — shared between /collection?tab=watchlist (Sprint 1D-i
 * fold) and any future surface that needs the same valuation contract.
 *
 * Returns the same shape the old /watchlist/+page.server.ts produced, so a
 * caller can swap in this helper without changing its consumer component.
 */

import { getCard } from './tcg-api';
import { supabase } from './supabase';
import type { PokemonCard, WatchlistEntry } from '$types';

export interface WatchlistValuation {
	current_nm: number | null;
	current_source: 'pricecharting' | 'tcgplayer' | null;
	triggered: boolean;
	distance_pct: number | null;
}

export interface WatchlistLoadResult {
	entries: WatchlistEntry[];
	cardCache: Record<string, PokemonCard>;
	valuationByEntry: Record<string, WatchlistValuation>;
	triggeredCount: number;
}

export async function loadWatchlistData(): Promise<WatchlistLoadResult> {
	const { data: rawEntries } = await supabase
		.from('watchlist')
		.select('*')
		.order('created_at', { ascending: false });
	const entries = (rawEntries ?? []) as WatchlistEntry[];

	const cardIds = Array.from(new Set(entries.map((e) => e.card_id)));

	const indexPrices: Record<
		string,
		{ raw_nm_price: number | null; psa10_price: number | null }
	> = {};
	if (cardIds.length > 0) {
		const { data: indexRows } = await supabase
			.from('card_index')
			.select('card_id, raw_nm_price, psa10_price')
			.in('card_id', cardIds);
		for (const r of (indexRows ?? []) as Array<{
			card_id: string;
			raw_nm_price: number | null;
			psa10_price: number | null;
		}>) {
			indexPrices[r.card_id] = {
				raw_nm_price: r.raw_nm_price,
				psa10_price: r.psa10_price
			};
		}
	}

	const cardLookups = await Promise.all(cardIds.map((id) => getCard(id).catch(() => null)));
	const cardCache: Record<string, PokemonCard> = {};
	for (let i = 0; i < cardIds.length; i++) {
		const card = cardLookups[i];
		if (card) cardCache[cardIds[i]] = card;
	}

	function tcgMarketFor(card: PokemonCard | undefined): number | null {
		if (!card?.tcgplayer?.prices) return null;
		for (const variant of Object.values(card.tcgplayer.prices)) {
			if (typeof variant.market === 'number' && variant.market > 0) return variant.market;
		}
		return null;
	}

	const valuationByEntry: Record<string, WatchlistValuation> = {};
	let triggeredCount = 0;
	for (const entry of entries) {
		const idx = indexPrices[entry.card_id];
		const fromIndex = idx?.raw_nm_price ?? null;
		const fromTcg = fromIndex == null ? tcgMarketFor(cardCache[entry.card_id]) : null;
		const current = fromIndex ?? fromTcg;
		const source: WatchlistValuation['current_source'] =
			fromIndex != null ? 'pricecharting' : fromTcg != null ? 'tcgplayer' : null;
		const target = entry.target_price ?? null;
		const triggered = !!(
			entry.alert_enabled &&
			target != null &&
			current != null &&
			current <= target
		);
		if (triggered) triggeredCount++;
		valuationByEntry[entry.id] = {
			current_nm: current,
			current_source: source,
			triggered,
			distance_pct:
				target != null && current != null && target > 0
					? Math.round(((current - target) / target) * 1000) / 10
					: null
		};
	}

	return { entries, cardCache, valuationByEntry, triggeredCount };
}
