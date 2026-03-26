import { getArbitrageOpportunities, getTrendingCards, getBiggestMovers } from '$services/poketrace';
import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [arbitrage, trending, moversUp, moversDown, collectionRes] = await Promise.all([
		getArbitrageOpportunities(10, 20),
		getTrendingCards('7d', 10),
		getBiggestMovers('up', 10),
		getBiggestMovers('down', 10),
		supabase.from('collection').select('card_id, quantity, purchase_price')
	]);

	const collection = collectionRes.data ?? [];
	const totalInvested = collection.reduce(
		(sum, e) => sum + (e.purchase_price ?? 0) * e.quantity,
		0
	);
	const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);

	return {
		arbitrage,
		trending,
		moversUp,
		moversDown,
		portfolio: { totalInvested, totalCards, uniqueCards: collection.length }
	};
};
