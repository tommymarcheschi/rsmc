/**
 * Live-listings provider factory.
 *
 * Returns the configured provider based on the LIVE_LISTINGS_PROVIDER env
 * var. Defaults to 'stub' so the card page never breaks for lack of a
 * real source. When a real Path C source lands (eBay re-apply, 130point
 * partnership, Bright Data scrape), add it here as a new branch.
 *
 * Keeping the factory tiny + the providers in separate files means the
 * card page imports `getLiveListingsProvider()` and never touches a
 * specific implementation — the swap is one line here.
 */

import { stubProvider } from './stub';
import type { LiveListingsProvider } from './types';

export type { LiveListing, LiveListingsResult, LiveListingsProvider } from './types';
export { getCachedOrFetch, logCardQueryHit, deriveQueryKey } from './cache';

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
