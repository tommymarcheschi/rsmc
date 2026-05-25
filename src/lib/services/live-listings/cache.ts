/**
 * SWR cache wrapper for live-listings providers.
 *
 * Why this exists: the card page used to call the provider on every load
 * (src/routes/card/[id]/+page.server.ts). Fine for the stub, but as soon
 * as a real provider lands (eBay Browse, scraper) that's an upstream call
 * per page view — wastes budget and adds latency. This wrapper turns each
 * page view into a single Postgres lookup, and only hits the provider
 * when the row is missing or older than the TTL.
 *
 * Stale-while-revalidate semantics:
 *   - Fresh hit  → return cached, no provider call.
 *   - Stale hit  → return cached, fire-and-forget refresh for next time.
 *   - Cache miss → await the provider, store, return.
 *
 * The fire-and-forget refresh is best-effort. On Vercel the function
 * instance can be frozen before the unawaited promise completes; that's
 * OK — the cache stays stale one more cycle and the NEXT request kicks
 * off another revalidate. The cache always catches up eventually.
 *
 * One row per (card_id, query_key) so PSA-only / raw-only / unfiltered
 * fetches don't clobber each other. Key derivation lives here so the
 * upstream `FetchForCardOptions` is the single source of truth.
 */

import { supabase } from '$services/supabase';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { stubProvider } from './stub';
import { deriveQueryKey } from './provider';
import type { FetchForCardOptions, LiveListingsProvider, LiveListingsResult } from './types';

const DEFAULT_TTL_SECONDS = 6 * 60 * 60; // 6h — listings move fast, but not hourly fast.

interface CachedRow {
	payload: LiveListingsResult;
	fetched_at: string;
	provider: string;
}

/**
 * SWR read: returns cached payload when fresh, cached-plus-background-
 * refresh when stale, fetches synchronously on cache miss. Returns null
 * only when the cache is empty AND the provider also fails.
 */
export async function getCachedOrFetch(
	provider: LiveListingsProvider,
	opts: FetchForCardOptions,
	ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<LiveListingsResult | null> {
	const queryKey = deriveQueryKey(opts);

	// Anon client read — migration 022 grants anon SELECT, so this works
	// during SSR without needing a service-role round-trip.
	const { data: cached } = await supabase
		.from('live_listings_cache')
		.select('payload, fetched_at, provider')
		.eq('card_id', opts.card_id)
		.eq('query_key', queryKey)
		.maybeSingle<CachedRow>();

	const ageMs = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
	const isFresh = ageMs < ttlSeconds * 1000;

	if (cached && isFresh) {
		return cached.payload;
	}

	if (cached && !isFresh) {
		// Stale → return cached, kick off background refresh.
		void refreshAndStore(provider, opts, queryKey);
		return cached.payload;
	}

	// Cache miss → must wait so the user gets data this render.
	return await refreshAndStore(provider, opts, queryKey);
}

async function refreshAndStore(
	provider: LiveListingsProvider,
	opts: FetchForCardOptions,
	queryKey: string
): Promise<LiveListingsResult | null> {
	let result: LiveListingsResult | null = null;
	try {
		result = await provider.fetchForCard(opts);
	} catch {
		// Provider failed — don't poison the cache; just return null and let
		// the existing-cached-row (if any) keep serving on the next read.
		return null;
	}

	// Persist via service-role: anon role has no write policy (migration
	// 022 keeps writes service-role-only, matching the engine-table posture
	// from migration 018). If supabaseAdmin is null (env not configured)
	// the data still rendered — just nothing got cached.
	if (supabaseAdmin && result) {
		await supabaseAdmin
			.from('live_listings_cache')
			.upsert(
				{
					card_id: opts.card_id,
					query_key: queryKey,
					provider: result.source,
					payload: result,
					lowest_ask_cents: result.lowest_ask_cents,
					listings_count: result.listings.length,
					fetched_at: result.fetched_at
				},
				{ onConflict: 'card_id,query_key' }
			)
			.then(({ error }) => {
				// Swallow — caching is best-effort. A logged warning is fine
				// but throwing here would break a working page render.
				if (error) console.warn('[live-listings cache] upsert failed:', error.message);
			});
	}

	return result;
}

/**
 * Fire-and-forget popularity log. Records that `card_id` was viewed so
 * the warming cron can rank cards by recent hits. Errors are swallowed —
 * the page should NEVER fail because the popularity log is unreachable.
 *
 * Caller does not await; the promise dangles intentionally. The Supabase
 * client batches the insert into its own request, so the SSR response is
 * not blocked on the network round-trip.
 */
export function logCardQueryHit(card_id: string): void {
	if (!supabaseAdmin) return;
	void supabaseAdmin
		.from('card_query_log')
		.insert({ card_id })
		.then(({ error }) => {
			if (error) console.warn('[card_query_log] insert failed:', error.message);
		});
}

// Re-export the default provider for callers that want to bypass the
// factory — keeps the import surface small for the common case.
export { stubProvider };
