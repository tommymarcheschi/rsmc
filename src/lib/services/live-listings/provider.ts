/**
 * Live-listings provider factory + cache-key derivation.
 *
 * Lives apart from cache.ts on purpose: cache.ts pulls in $lib/server
 * (service-role Supabase) which only resolves inside SvelteKit. The
 * warming cron (scripts/warm-live-listings.ts) is a plain tsx script
 * and needs the factory + key derivation WITHOUT the SvelteKit env
 * machinery. Splitting these out makes the script side import-safe.
 *
 * Both helpers are intentionally tiny and pure — no I/O, no global
 * state — so this file is safe to load in any runtime.
 */

import { stubProvider } from './stub';
import type { FetchForCardOptions, LiveListingsProvider } from './types';

export function getLiveListingsProvider(): LiveListingsProvider {
	const choice = (process.env.LIVE_LISTINGS_PROVIDER ?? 'stub').toLowerCase();
	switch (choice) {
		case 'stub':
			return stubProvider;
		// case 'ebay':     return ebayBrowseProvider;        // Sprint 2.x — when EBAY_CLIENT_ID is set
		// case '130point': return onethreezeropointProvider; // Sprint 2.x — when partnership signed
		// case 'brightdata': return brightDataProvider;      // Sprint 2.x — when paid subscription active
		default:
			// Unknown provider name = fall back to stub rather than crash. Real
			// providers should be added explicitly here as they land.
			return stubProvider;
	}
}

/**
 * Stable, human-readable cache key for a fetch-options bundle. Sorted
 * deterministically so {grader, grade} and {grade, grader} hash the same.
 *
 * Single source of truth for the (card_id, query_key) PK in
 * live_listings_cache — used by both the SWR write path (cache.ts) and
 * the warming cron (scripts/warm-live-listings.ts) so the two never
 * fight over different keys for the same logical filter combo.
 */
export function deriveQueryKey(opts: FetchForCardOptions): string {
	const parts: string[] = [];
	if (opts.grader) parts.push(`grader=${opts.grader}`);
	if (opts.grade != null) parts.push(`grade=${opts.grade}`);
	if (opts.raw_only) parts.push('raw_only=1');
	if (opts.limit != null) parts.push(`limit=${opts.limit}`);
	return parts.length === 0 ? 'all' : parts.join('&');
}
