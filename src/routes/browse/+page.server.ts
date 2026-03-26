import { searchCards, getSets } from '$services/tcg-api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const rarity = url.searchParams.get('rarity') ?? '';

	const queryParts: string[] = [];
	if (search) queryParts.push(`name:"${search}*"`);
	if (set) queryParts.push(`set.id:${set}`);
	if (type) queryParts.push(`types:${type}`);
	if (rarity) queryParts.push(`rarity:"${rarity}"`);

	// Use a specific recent set as default instead of broad supertype query (which times out)
	const query = queryParts.length > 0 ? queryParts.join(' ') : 'set.id:me2pt5';

	// Load cards and sets in parallel, but don't let sets failure block the page
	const [cardsResult, sets] = await Promise.all([
		searchCards(query, 1, 24).catch(() => ({ data: [], totalCount: 0 })),
		getSets().catch(() => [])
	]);

	return {
		cards: cardsResult.data,
		totalCount: cardsResult.totalCount,
		page: 1,
		pageSize: 24,
		query,
		sets,
		filters: { search, set, type, rarity }
	};
};
