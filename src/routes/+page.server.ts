import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
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

	return {
		stats: {
			totalCards,
			uniqueSets,
			totalInvested,
			watchlistCount: watchlist.length,
			gradingPending: grading.length
		},
		recentCollection: collection.slice(0, 5)
	};
};
