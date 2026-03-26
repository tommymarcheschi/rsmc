import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import {
	scrapeTCGPlayerPrices,
	scrapeTCGPlayerSearch
} from '$services/tcgplayer-scraper';
import type { TCGPlayerPriceData } from '$services/tcgplayer-scraper';
import type { RequestHandler } from './$types';

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Build a deterministic cache key from the request params.
 */
function cacheKey(url?: string | null, name?: string | null, set?: string | null): string {
	if (url) return `tcgplayer:url:${url}`;
	return `tcgplayer:search:${name ?? ''}:${set ?? ''}`;
}

/**
 * Check Supabase price_cache for a fresh entry.
 */
async function getCached(key: string): Promise<TCGPlayerPriceData | null> {
	try {
		const { data, error: err } = await supabase
			.from('price_cache')
			.select('value, updated_at')
			.eq('key', key)
			.single();

		if (err || !data) return null;

		const age = Date.now() - new Date(data.updated_at).getTime();
		if (age > CACHE_DURATION_MS) return null;

		return data.value as TCGPlayerPriceData;
	} catch {
		return null;
	}
}

/**
 * Upsert scraped data into Supabase price_cache.
 */
async function setCache(key: string, value: TCGPlayerPriceData): Promise<void> {
	try {
		await supabase
			.from('price_cache')
			.upsert(
				{ key, value, updated_at: new Date().toISOString() },
				{ onConflict: 'key' }
			);
	} catch {
		// Cache write failure is non-fatal
	}
}

/**
 * GET /api/tcgplayer-sales
 *
 * Query params:
 *   ?url=<tcgplayer-product-url>
 *   ?name=<card+name>&set=<set+name>
 */
export const GET: RequestHandler = async ({ url }) => {
	const tcgUrl = url.searchParams.get('url');
	const cardName = url.searchParams.get('name');
	const setName = url.searchParams.get('set');

	if (!tcgUrl && !cardName) {
		throw error(400, 'Provide either "url" or "name" query parameter');
	}

	const key = cacheKey(tcgUrl, cardName, setName);

	// Check cache first
	const cached = await getCached(key);
	if (cached) {
		return json({ ...cached, _cached: true });
	}

	// Scrape fresh data
	let result: TCGPlayerPriceData | null = null;

	try {
		if (tcgUrl) {
			result = await scrapeTCGPlayerPrices(tcgUrl);
		} else if (cardName) {
			result = await scrapeTCGPlayerSearch(cardName, setName ?? undefined);
		}
	} catch {
		throw error(502, 'Failed to fetch data from TCGPlayer');
	}

	if (!result) {
		throw error(404, 'No pricing data found');
	}

	// Store in cache (fire-and-forget)
	setCache(key, result);

	return json(result);
};
