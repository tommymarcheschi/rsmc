import { json } from '@sveltejs/kit';
import { searchCards, getSets } from '$services/tcg-api';
import { resolveSortOrderBy } from '$services/sort';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	let query = url.searchParams.get('q');
	const page = parseInt(url.searchParams.get('page') ?? '1');
	const pageSize = parseInt(url.searchParams.get('pageSize') ?? '24');
	const orderBy = resolveSortOrderBy(url.searchParams.get('sort'));

	// When no query is supplied, default to the latest set (sorted by release date).
	if (!query) {
		try {
			const sets = await getSets();
			const latest = sets[0];
			query = latest ? `set.id:${latest.id}` : '';
		} catch {
			query = '';
		}
	}

	if (!query) {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}

	try {
		const result = await searchCards(query, page, pageSize, orderBy);
		return json(result, {
			headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' }
		});
	} catch {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}
};
