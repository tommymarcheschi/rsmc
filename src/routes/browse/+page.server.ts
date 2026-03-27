import { getSets } from '$services/tcg-api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Sets list is stable — cache aggressively at the edge
	setHeaders({
		'cache-control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600'
	});

	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const rarity = url.searchParams.get('rarity') ?? '';

	// Only load sets on the server (fast, cacheable).
	// Card search happens client-side via /api/cards to avoid Vercel 10s timeout.
	const sets = await getSets().catch(() => []);

	return {
		sets,
		filters: { search, set, type, rarity }
	};
};
