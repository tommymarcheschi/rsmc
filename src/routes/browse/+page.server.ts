import { getSets, searchCards } from '$services/tcg-api';
import type { PageServerLoad } from './$types';
import type { PokemonCard } from '$types';

const INITIAL_PAGE_SIZE = 24;

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Do NOT cache the HTML document. The HTML references hashed JS bundles
	// (`_app/immutable/entry/*.{hash}.js`), and when Vercel promotes a new
	// deployment the old hashes 404. A browser holding cached HTML from a
	// previous deploy then fails to hydrate — the page renders, but every
	// interaction is a no-op because `kit.start()` never runs. ETag-based
	// revalidation (`no-cache` + must-revalidate) keeps reloads fast while
	// guaranteeing the browser always checks with the server first.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const rarity = url.searchParams.get('rarity') ?? '';

	// Build the TCG API query from the current filters. If no filters are
	// applied, default to the newest set (first in the release-sorted list).
	const sets = await getSets().catch(() => []);

	function buildQuery(): string {
		const parts: string[] = [];
		if (search) parts.push(`name:"${search}*"`);
		if (set) parts.push(`set.id:${set}`);
		if (type) parts.push(`types:${type}`);
		if (rarity) parts.push(`rarity:"${rarity}"`);
		if (parts.length > 0) return parts.join(' ');
		const latestSetId = sets[0]?.id;
		return latestSetId ? `set.id:${latestSetId}` : '';
	}

	// Server-render the first page of cards so /browse works without any
	// client-side JS. Clients with JS still get infinite scroll on top of
	// this baseline via /api/cards. The retry + timeout budget in tcg-api.ts
	// keeps this well under Vercel's 30s function limit.
	const query = buildQuery();
	let initialCards: PokemonCard[] = [];
	let totalCount = 0;
	if (query) {
		try {
			const result = await searchCards(query, 1, INITIAL_PAGE_SIZE);
			initialCards = result.data;
			totalCount = result.totalCount;
		} catch {
			// Swallow — the client will retry via /api/cards on hydration.
		}
	}

	return {
		sets,
		filters: { search, set, type, rarity },
		initialCards,
		initialTotalCount: totalCount
	};
};
