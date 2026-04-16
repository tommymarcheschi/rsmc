import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import { fetchPriceCharting } from '$services/pricecharting-scraper';
import type { RequestHandler } from './$types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/pricecharting?name=Charizard&set=Base+Set&number=4
 *
 * Returns PriceCharting graded + ungraded prices for a Pokemon card.
 * Cached in scrape_cache for 24 hours.
 */
export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	const set = url.searchParams.get('set') ?? undefined;
	const number = url.searchParams.get('number') ?? undefined;

	if (!name) {
		throw error(400, 'Missing required parameter: name');
	}

	const cacheKey = `pc:${name.toLowerCase()}:${(set ?? '').toLowerCase()}:${(number ?? '').toLowerCase()}`;

	// Check cache first
	try {
		const { data: cached } = await supabase
			.from('scrape_cache')
			.select('data, fetched_at')
			.eq('cache_key', cacheKey)
			.single();

		if (cached) {
			const age = Date.now() - new Date(cached.fetched_at).getTime();
			if (age < CACHE_TTL_MS) {
				return json(cached.data, {
					headers: { 'cache-control': 'private, max-age=300' }
				});
			}
		}
	} catch {
		// Cache miss — proceed to scrape
	}

	// Scrape fresh data
	try {
		const data = await fetchPriceCharting({ name, setName: set, cardNumber: number });
		if (!data) {
			throw error(404, 'No PriceCharting data found for this card');
		}

		// Upsert into scrape_cache
		try {
			await supabase.from('scrape_cache').upsert(
				{
					cache_key: cacheKey,
					source: 'pricecharting',
					data,
					fetched_at: new Date().toISOString()
				},
				{ onConflict: 'cache_key' }
			);
		} catch {
			// Cache write failure is non-fatal
		}

		return json(data, {
			headers: { 'cache-control': 'private, max-age=300' }
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(500, 'Failed to fetch PriceCharting data');
	}
};
