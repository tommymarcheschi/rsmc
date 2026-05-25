/**
 * Live-listings public surface.
 *
 * Two layers underneath:
 *   - `./provider` — factory + key derivation. Pure, script-safe.
 *   - `./cache`    — SWR read/write + popularity log. SvelteKit-only
 *                    (imports $lib/server for service-role writes).
 *
 * Card-page SSR imports from here. The warming cron imports from
 * `./provider` directly to stay out of the SvelteKit env chain.
 */

export type { LiveListing, LiveListingsResult, LiveListingsProvider, FetchForCardOptions } from './types';
export { getLiveListingsProvider, deriveQueryKey } from './provider';
export { getCachedOrFetch, logCardQueryHit } from './cache';
