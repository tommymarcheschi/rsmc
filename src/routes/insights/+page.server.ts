import { getTrendingCards } from '$services/poketrace';
import { supabase } from '$services/supabase';
import {
	getUndervaluedCards,
	getSupplySqueezeCards,
	getPopDensityHeatmap,
	getSetValueTracker,
	getPsa10Momentum
} from '$services/insights';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Bump pool sizes so the client can shuffle/slice without going back
	// to the server. The display shows a random 15 per list; 40-60 in the
	// pool gives enough headroom that re-shuffles feel fresh without
	// dipping into low-confidence tails.
	const [
		trending,
		momentum,
		collectionRes,
		undervalued,
		supplySqueeze,
		heatmap,
		setValue
	] = await Promise.all([
		getTrendingCards('7d', 10),
		getPsa10Momentum(40).catch(() => ({ rising: [], cooling: [], cardsAnalyzed: 0 })),
		supabase.from('collection').select('card_id, quantity, purchase_price'),
		getUndervaluedCards(50),
		getSupplySqueezeCards(40),
		getPopDensityHeatmap(),
		getSetValueTracker()
	]);

	const collection = collectionRes.data ?? [];
	const totalInvested = collection.reduce(
		(sum, e) => sum + (e.purchase_price ?? 0) * e.quantity,
		0
	);
	const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);

	return {
		trending,
		momentum,
		undervalued,
		supplySqueeze,
		heatmap,
		setValue,
		portfolio: { totalInvested, totalCards, uniqueCards: collection.length }
	};
};
