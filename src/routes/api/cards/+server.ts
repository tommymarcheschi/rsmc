import { json } from '@sveltejs/kit';
import { searchCards, getSets } from '$services/tcg-api';
import { applyClientSort, resolveSortOption, resolveSortOrderBy } from '$services/sort';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	let query = url.searchParams.get('q');
	const sortParam = url.searchParams.get('sort');
	const sortOption = resolveSortOption(sortParam);
	const isClientSort = sortOption.kind === 'client';

	const page = parseInt(url.searchParams.get('page') ?? '1');
	// Client-side sort modes always return the full filtered set in one
	// shot (up to the TCG API's 250 cap) so infinite scroll has nothing to
	// request. For api-kind sorts the caller picks the page size.
	const pageSize = isClientSort
		? 250
		: parseInt(url.searchParams.get('pageSize') ?? '24');
	const orderBy = resolveSortOrderBy(sortParam);

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
		if (isClientSort) {
			const filtered = applyClientSort(result.data, sortParam);
			return json(
				{
					data: filtered,
					totalCount: filtered.length,
					page: 1,
					pageSize: filtered.length,
					count: filtered.length
				},
				{ headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' } }
			);
		}
		return json(result, {
			headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' }
		});
	} catch {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}
};
