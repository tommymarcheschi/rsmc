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

	const query = queryParts.length > 0 ? queryParts.join(' ') : 'supertype:Pokémon';

	const [cardsResult, sets] = await Promise.all([
		searchCards(query, 1, 24),
		getSets()
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
