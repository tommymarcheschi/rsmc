import { getSets } from '$services/tcg-api';
import { isCatalogReady, getAllSets as getCatalogSets } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Sets list is stable — cache aggressively at the edge
	setHeaders({
		'cache-control': 'private, max-age=600, stale-while-revalidate=3600'
	});

	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const rarity = url.searchParams.get('rarity') ?? '';
	const sort = url.searchParams.get('sort') ?? '';

	// Prefer the local catalog (instant, no rate limit). Fall back to the live
	// TCG API for environments that haven't run `npm run ingest:catalog` yet.
	let sets: Awaited<ReturnType<typeof getSets>> = [];
	if (await isCatalogReady()) {
		sets = await getCatalogSets().catch(() => []);
	}
	if (sets.length === 0) {
		sets = await getSets().catch(() => []);
	}

	return {
		sets,
		filters: { search, set, type, rarity, sort }
	};
};
