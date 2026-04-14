import { getSets } from '$services/tcg-api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Do NOT cache the HTML document. The HTML references hashed JS bundles
	// (`_app/immutable/entry/*.{hash}.js`), and when Vercel promotes a new
	// deployment the old hashes 404. A browser holding cached HTML from a
	// previous deploy then fails to hydrate — the page renders, but every
	// interaction is a no-op because `kit.start()` never runs. ETag-based
	// revalidation (`no-cache` + must-revalidate) keeps reloads fast while
	// guaranteeing the browser always checks with the server first.
	// The sets list itself is cached via in-memory setsCache in tcg-api.ts,
	// and /api/cards has its own cache-control header, so losing the HTML
	// cache has negligible cost.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
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
