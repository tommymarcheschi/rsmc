import { searchCards, searchByName } from '$services/tcg-api';
import { findUndervaluedCards } from '$services/analytics';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const compName = url.searchParams.get('comp') ?? '';
	const scanSet = url.searchParams.get('set') ?? '';

	// Fetch undervalued cards from a popular recent set for the value scanner
	let scanQuery = scanSet ? `set.id:${scanSet}` : 'rarity:"Illustration Rare" OR rarity:"Ultra Rare" OR rarity:"Special Art Rare"';
	const [scanResult, compResult] = await Promise.all([
		searchCards(scanQuery, 1, 50).catch(() => ({ data: [], page: 1, pageSize: 50, count: 0, totalCount: 0 })),
		compName
			? searchByName(compName, 1, 50).catch(() => ({ data: [], page: 1, pageSize: 50, count: 0, totalCount: 0 }))
			: Promise.resolve({ data: [], page: 1, pageSize: 50, count: 0, totalCount: 0 })
	]);

	const undervalued = findUndervaluedCards(scanResult.data, 20);

	return {
		undervalued,
		compCards: compResult.data,
		compName,
		scanSet
	};
};
