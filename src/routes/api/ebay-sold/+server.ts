import { json } from '@sveltejs/kit';
import { searchEbaySold } from '$services/ebay-scraper';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const setName = url.searchParams.get('set') ?? undefined;
	const limit = parseInt(url.searchParams.get('limit') ?? '20');

	if (!query) {
		return json({ error: 'Missing required parameter: q' }, { status: 400 });
	}

	const cacheKey = setName ? `${query}__${setName}` : query;

	try {
		// Check cache first
		const { data: cached } = await supabase
			.from('price_cache')
			.select('*')
			.eq('card_id', cacheKey)
			.eq('source', 'ebay_sold')
			.single();

		if (cached?.cached_at) {
			const cachedAt = new Date(cached.cached_at).getTime();
			const now = Date.now();

			if (now - cachedAt < CACHE_TTL_MS) {
				return json(cached.data);
			}
		}
	} catch {
		// Cache miss or error — proceed with fresh fetch
	}

	try {
		const result = await searchEbaySold(query, setName, limit);

		// Store in cache (upsert)
		try {
			await supabase.from('price_cache').upsert(
				{
					card_id: cacheKey,
					source: 'ebay_sold',
					data: result,
					cached_at: new Date().toISOString()
				},
				{ onConflict: 'card_id,source' }
			);
		} catch (cacheError) {
			console.error('Failed to cache eBay sold results:', cacheError);
		}

		return json(result);
	} catch (error) {
		console.error('eBay sold API error:', error);
		return json({ error: 'Failed to fetch eBay sold listings' }, { status: 500 });
	}
};
