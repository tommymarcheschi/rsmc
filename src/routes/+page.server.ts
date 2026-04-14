import { supabase } from '$services/supabase';
import { getCard } from '$services/tcg-api';
import { getCachedPricesForCards } from '$services/price-cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	// Per-user data — cache in the user's browser only, never share across users
	// or via shared CDNs. (Dashboard reflects the logged-in user's collection.)
	setHeaders({
		'cache-control': 'private, max-age=60, stale-while-revalidate=300'
	});

	const [collectionRes, watchlistRes, gradingRes] = await Promise.all([
		supabase.from('collection').select('*'),
		supabase.from('watchlist').select('*'),
		supabase.from('grading').select('*').neq('status', 'complete')
	]);

	const collection = collectionRes.data ?? [];
	const watchlist = watchlistRes.data ?? [];
	const grading = gradingRes.data ?? [];

	const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);
	const uniqueSets = new Set(collection.map((e) => e.card_id.split('-')[0])).size;
	const totalInvested = collection.reduce(
		(sum, e) => sum + (e.purchase_price ?? 0) * e.quantity,
		0
	);

	let portfolioValue = 0;
	let topHoldings: { card_id: string; name: string; quantity: number; marketPrice: number; totalValue: number; imageUrl: string; gainLoss: number }[] = [];

	if (collection.length > 0) {
		const uniqueCardIds = [...new Set(collection.map((e: { card_id: string }) => e.card_id))].slice(0, 20);

		// Get cached prices + fetch card metadata in one pass
		const [cachedPrices, ...cardResults] = await Promise.all([
			getCachedPricesForCards(uniqueCardIds),
			...uniqueCardIds.map((id) => getCard(id).catch(() => null))
		]);

		const cardMap = new Map<string, { name: string; marketPrice: number; imageUrl: string }>();

		for (const card of cardResults) {
			if (!card) continue;
			let marketPrice = (cachedPrices as Map<string, number>).get(card.id) ?? 0;
			if (marketPrice === 0 && card.tcgplayer?.prices) {
				for (const variant of Object.values(card.tcgplayer.prices)) {
					if (variant.market) { marketPrice = variant.market; break; }
					if (variant.mid) { marketPrice = variant.mid; break; }
				}
			}
			cardMap.set(card.id, { name: card.name, marketPrice, imageUrl: card.images.small });
		}

		for (const entry of collection) {
			const card = cardMap.get(entry.card_id);
			if (!card) continue;
			const totalValue = card.marketPrice * entry.quantity;
			portfolioValue += totalValue;
			const costBasis = (entry.purchase_price ?? 0) * entry.quantity;
			topHoldings.push({
				card_id: entry.card_id,
				name: card.name,
				quantity: entry.quantity,
				marketPrice: card.marketPrice,
				totalValue,
				imageUrl: card.imageUrl,
				gainLoss: totalValue - costBasis
			});
		}

		topHoldings.sort((a, b) => b.totalValue - a.totalValue);
		topHoldings = topHoldings.slice(0, 5);
	}

	const gainLoss = portfolioValue - totalInvested;
	const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

	return {
		stats: {
			totalCards,
			uniqueSets,
			totalInvested,
			portfolioValue,
			gainLoss,
			gainLossPct,
			watchlistCount: watchlist.length,
			gradingPending: grading.length
		},
		topHoldings,
		recentCollection: collection.slice(0, 5)
	};
};
