import { getTrendingCards, getBiggestMovers } from '$services/poketrace';
import { supabase } from '$services/supabase';
import {
	getUndervaluedCards,
	getSupplySqueezeCards,
	getPopDensityHeatmap
} from '$services/insights';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [trending, moversUp, moversDown, collectionRes, undervalued, supplySqueeze, heatmap] =
		await Promise.all([
			getTrendingCards('7d', 10),
			getBiggestMovers('up', 10),
			getBiggestMovers('down', 10),
			supabase.from('collection').select('card_id, quantity, purchase_price'),
			getUndervaluedCards(15),
			getSupplySqueezeCards(20),
			getPopDensityHeatmap()
		]);

	const collection = collectionRes.data ?? [];
	const totalInvested = collection.reduce(
		(sum, e) => sum + (e.purchase_price ?? 0) * e.quantity,
		0
	);
	const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);

	return {
		trending,
		moversUp,
		moversDown,
		undervalued,
		supplySqueeze,
		heatmap,
		portfolio: { totalInvested, totalCards, uniqueCards: collection.length }
	};
};
