import { json } from '@sveltejs/kit';
import { searchCards } from '$services/tcg-api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q') ?? 'set.id:me2pt5';
	const page = parseInt(url.searchParams.get('page') ?? '1');
	const pageSize = parseInt(url.searchParams.get('pageSize') ?? '24');

	try {
		const result = await searchCards(query, page, pageSize);
		return json(result);
	} catch {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}
};
