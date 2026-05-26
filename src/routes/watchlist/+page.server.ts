import { getCard } from '$services/tcg-api';
import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';
import type { PokemonCard, WatchlistEntry } from '$types';

export const load: PageServerLoad = async () => {
	const { data: rawEntries } = await supabase
		.from('watchlist')
		.select('*')
		.order('created_at', { ascending: false });
	const entries = (rawEntries ?? []) as WatchlistEntry[];

	const cardIds = Array.from(new Set(entries.map((e) => e.card_id)));

	// Batch-pull current prices + metadata from card_index (single round-trip)
	// so the page can render triggered-alert state without hitting an external
	// API per row, AND so rows whose pokemontcg.io lookup misses (Scrydex
	// sets, or a 429 storm) still have a name/image/set instead of "..." +
	// bare card_id. card_index is our source of truth for every owned/
	// watched card; we synthesize a minimal PokemonCard from it whenever
	// getCard() returns null.
	const indexPrices: Record<string, { raw_nm_price: number | null; psa10_price: number | null }> = {};
	interface IndexMeta {
		name: string;
		set_id: string | null;
		set_name: string | null;
		card_number: string | null;
		image_small_url: string | null;
		image_large_url: string | null;
		rarity: string | null;
	}
	const indexMeta: Record<string, IndexMeta> = {};
	if (cardIds.length > 0) {
		const { data: indexRows } = await supabase
			.from('card_index')
			.select(
				'card_id, raw_nm_price, psa10_price, name, set_id, set_name, card_number, image_small_url, image_large_url, rarity'
			)
			.in('card_id', cardIds);
		for (const r of (indexRows ?? []) as Array<{
			card_id: string;
			raw_nm_price: number | null;
			psa10_price: number | null;
			name: string;
			set_id: string | null;
			set_name: string | null;
			card_number: string | null;
			image_small_url: string | null;
			image_large_url: string | null;
			rarity: string | null;
		}>) {
			indexPrices[r.card_id] = {
				raw_nm_price: r.raw_nm_price,
				psa10_price: r.psa10_price
			};
			indexMeta[r.card_id] = {
				name: r.name,
				set_id: r.set_id,
				set_name: r.set_name,
				card_number: r.card_number,
				image_small_url: r.image_small_url,
				image_large_url: r.image_large_url,
				rarity: r.rarity
			};
		}
	}

	// Server-side card metadata so the list renders without JS. Same pattern
	// as /collection. In-memory TTL cache in getCard() keeps repeat loads cheap.
	const cardLookups = await Promise.all(
		cardIds.map((id) => getCard(id).catch(() => null))
	);
	const cardCache: Record<string, PokemonCard> = {};
	for (let i = 0; i < cardIds.length; i++) {
		const card = cardLookups[i];
		if (card) cardCache[cardIds[i]] = card;
	}

	// Backfill cardCache for any pokemontcg.io miss. UI only reads card.name
	// / card.images.small / card.set.name / card.number — synthesize those.
	for (const id of cardIds) {
		if (cardCache[id]) continue;
		const m = indexMeta[id];
		if (!m) continue;
		cardCache[id] = {
			id,
			name: m.name,
			supertype: '',
			number: m.card_number ?? '',
			rarity: m.rarity ?? undefined,
			images: {
				small: m.image_small_url ?? '',
				large: m.image_large_url ?? m.image_small_url ?? ''
			},
			set: {
				id: m.set_id ?? '',
				name: m.set_name ?? '',
				series: '',
				printedTotal: 0,
				total: 0,
				releaseDate: '',
				images: { symbol: '', logo: '' }
			}
		} as PokemonCard;
	}

	function tcgMarketFor(card: PokemonCard | undefined): number | null {
		if (!card?.tcgplayer?.prices) return null;
		for (const variant of Object.values(card.tcgplayer.prices)) {
			if (typeof variant.market === 'number' && variant.market > 0) return variant.market;
		}
		return null;
	}

	// Compute triggered state: current market ≤ target. null target means
	// the user hasn't set one — not triggered, just "tracked".
	interface Valuation {
		current_nm: number | null;
		current_source: 'pricecharting' | 'tcgplayer' | null;
		triggered: boolean;
		distance_pct: number | null;
	}
	const valuationByEntry: Record<string, Valuation> = {};
	let triggeredCount = 0;
	for (const entry of entries) {
		const idx = indexPrices[entry.card_id];
		const fromIndex = idx?.raw_nm_price ?? null;
		const fromTcg = fromIndex == null ? tcgMarketFor(cardCache[entry.card_id]) : null;
		const current = fromIndex ?? fromTcg;
		const source: Valuation['current_source'] = fromIndex != null
			? 'pricecharting'
			: fromTcg != null
				? 'tcgplayer'
				: null;
		const target = entry.target_price ?? null;
		const triggered = !!(
			entry.alert_enabled && target != null && current != null && current <= target
		);
		if (triggered) triggeredCount++;
		valuationByEntry[entry.id] = {
			current_nm: current,
			current_source: source,
			triggered,
			distance_pct: target != null && current != null && target > 0
				? Math.round(((current - target) / target) * 1000) / 10
				: null
		};
	}

	return {
		entries,
		cardCache,
		valuationByEntry,
		triggeredCount
	};
};
