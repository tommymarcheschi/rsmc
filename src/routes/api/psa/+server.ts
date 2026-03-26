import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import { searchPSAPop, lookupPSACert } from '$services/psa-scraper';
import type { RequestHandler } from './$types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/psa
 *
 * Two modes:
 *   ?cert=12345678        — single PSA cert lookup
 *   ?search=Charizard&set=Base+Set  — population report search
 */
export const GET: RequestHandler = async ({ url }) => {
	const cert = url.searchParams.get('cert');
	const search = url.searchParams.get('search');
	const set = url.searchParams.get('set');

	// ---------------------------------------------------------------
	// Mode 1: Cert lookup (no caching — results are static per cert)
	// ---------------------------------------------------------------
	if (cert) {
		try {
			const data = await lookupPSACert(cert);
			if (!data) throw error(404, 'Certification not found');
			return json(data);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			throw error(500, 'Failed to look up PSA certification');
		}
	}

	// ---------------------------------------------------------------
	// Mode 2: Pop report search (cached for 24 hours)
	// ---------------------------------------------------------------
	if (search) {
		const cacheKey = `psa-pop:${search.toLowerCase()}:${(set ?? '').toLowerCase()}`;

		// Check cache first
		try {
			const { data: cached } = await supabase
				.from('price_cache')
				.select('data, fetched_at')
				.eq('cache_key', cacheKey)
				.single();

			if (cached) {
				const age = Date.now() - new Date(cached.fetched_at).getTime();
				if (age < CACHE_TTL_MS) {
					return json(cached.data);
				}
			}
		} catch {
			// Cache miss or table issue — proceed to scrape
		}

		// Scrape fresh data
		try {
			const data = await searchPSAPop(search, set ?? undefined);
			if (!data) throw error(404, 'No population data found');

			// Upsert into cache
			try {
				await supabase.from('price_cache').upsert(
					{
						cache_key: cacheKey,
						data,
						fetched_at: new Date().toISOString()
					},
					{ onConflict: 'cache_key' }
				);
			} catch {
				// Cache write failure is non-fatal
			}

			return json(data);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			throw error(500, 'Failed to fetch PSA population data');
		}
	}

	throw error(400, 'Provide either ?cert=<number> or ?search=<card name>');
};
