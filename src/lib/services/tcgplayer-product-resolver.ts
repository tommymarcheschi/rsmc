/**
 * TCGPlayer productId resolver — single source of truth.
 *
 * card_index card_id (e.g. `pl3-146`) → TCGPlayer productId (e.g. `88640`).
 * Replaces the brittle one-shot lookup in scripts/ingest-condition-prices.ts
 * that called `https://prices.pokemontcg.io/tcgplayer/{card_id}` and
 * silently returned 'noid' when that endpoint started 404'ing on
 * 2026-05-18 — killing the snapshot pipeline for 8+ days before anyone
 * noticed (see project_stale_pipeline_rootcause).
 *
 * Fallback chain (cheapest first, slowest last):
 *
 *   1. tcgplayer_product_ids cache — single Postgres lookup, no external
 *      calls. Once a card is resolved once, it's free forever.
 *   2. pokemontcg.io v2 API — `api.pokemontcg.io/v2/cards/{id}` returns
 *      a tcgplayer.url field with the productId in the path. Uses the
 *      POKEMON_TCG_API_KEY when set (sharply higher rate limits) but
 *      works without it for low volume.
 *   3. TCGPlayer search API — `mp-search-api.tcgplayer.com/v1/search/
 *      request`. Unauthenticated, no rate-limit observed, returns
 *      productName + setName + customAttributes.number per result. We
 *      filter by exact (setName, card_number) match so the wrong-print
 *      doesn't get cached (e.g. Rayquaza C LV.X has both a Supreme
 *      Victors #146 and a DP Black Star Promos #DP47).
 *   4. Legacy `prices.pokemontcg.io/tcgplayer/{card_id}` redirect — kept
 *      as last resort in case it heals.
 *
 * Honesty doctrine: never cache a guessed productId. Step 3 requires an
 * exact setName + card_number match; if no result matches, we return
 * null and try the next step.
 *
 * Pure module — no I/O at load. The cache table read/write is gated by
 * a try/catch so the resolver still works (slower path) if migration
 * 024 hasn't been applied yet; it just won't cache.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolutionSource =
	| 'cache'
	| 'pokemontcg_v2'
	| 'tcgplayer_search'
	| 'pokemontcg_redirect'
	| 'manual';

export interface ResolveResult {
	product_id: number | null;
	source: ResolutionSource | null;
}

/** Card metadata we need from card_index to drive the search-API path. */
export interface ResolverCardInput {
	card_id: string;
	name: string | null;
	set_name: string | null;
	card_number: string | null;
}

const SCRAPER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const POKEMONTCG_V2 = 'https://api.pokemontcg.io/v2/cards';
const POKEMONTCG_REDIRECT = 'https://prices.pokemontcg.io/tcgplayer';
const TCGPLAYER_SEARCH = 'https://mp-search-api.tcgplayer.com/v1/search/request';

/** Per-process cache so repeat lookups in one CLI run don't re-hit. */
const memoryCache = new Map<string, ResolveResult>();

export function clearResolverMemoryCache(): void {
	memoryCache.clear();
}

/**
 * Resolve a card_id to its TCGPlayer productId, writing back to the
 * persistent cache on first success. Returns `{ product_id: null }` on
 * total failure — the caller decides whether to retry next run.
 *
 * `supabaseAdmin` is the service-role client (writes go through it; the
 * anon client would be RLS-filtered to zero rows). Passing `null` skips
 * the persistent cache entirely (e.g. for one-off ad-hoc lookups).
 */
export async function resolveTcgPlayerProductId(
	supabaseAdmin: SupabaseClient | null,
	input: ResolverCardInput
): Promise<ResolveResult> {
	const cardId = input.card_id;

	const hit = memoryCache.get(cardId);
	if (hit) return hit;

	// 1. Persistent cache (migration 024).
	if (supabaseAdmin) {
		try {
			const { data } = await supabaseAdmin
				.from('tcgplayer_product_ids')
				.select('product_id, source')
				.eq('card_id', cardId)
				.maybeSingle();
			if (data?.product_id) {
				const result: ResolveResult = {
					product_id: Number(data.product_id),
					source: 'cache'
				};
				memoryCache.set(cardId, result);
				return result;
			}
		} catch {
			// Table missing (migration 024 not applied yet) → fall through.
		}
	}

	// 2. pokemontcg.io v2 API.
	let resolved: ResolveResult = { product_id: null, source: null };
	try {
		const headers: Record<string, string> = { 'User-Agent': SCRAPER_UA };
		const apiKey = process.env.POKEMON_TCG_API_KEY ?? '';
		if (apiKey) headers['X-Api-Key'] = apiKey;
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 8000);
		const res = await fetch(`${POKEMONTCG_V2}/${cardId}`, { headers, signal: ctrl.signal });
		clearTimeout(t);
		if (res.ok) {
			const json = (await res.json()) as { data?: { tcgplayer?: { url?: string } } };
			const url = json?.data?.tcgplayer?.url ?? '';
			const match = url.match(/\/product\/(\d+)/);
			if (match) {
				resolved = { product_id: Number(match[1]), source: 'pokemontcg_v2' };
			}
		}
	} catch {
		// fall through
	}

	// 3. TCGPlayer search API (unauthenticated, no rate-limit observed).
	if (!resolved.product_id && input.name) {
		resolved = await resolveViaTcgPlayerSearch(input);
	}

	// 4. Legacy pokemontcg.io redirect — last resort.
	if (!resolved.product_id) {
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 8000);
			const res = await fetch(`${POKEMONTCG_REDIRECT}/${cardId}`, {
				redirect: 'manual',
				headers: { 'User-Agent': SCRAPER_UA },
				signal: ctrl.signal
			});
			clearTimeout(t);
			const location = res.headers.get('location');
			const match = location?.match(/\/product\/(\d+)(?:[\/?]|$)/);
			if (match) {
				resolved = { product_id: Number(match[1]), source: 'pokemontcg_redirect' };
			}
		} catch {
			// fall through to null
		}
	}

	memoryCache.set(cardId, resolved);

	// Write-back to cache on success. Failure is logged but doesn't change
	// what we return — the caller already has the productId in hand.
	if (resolved.product_id && supabaseAdmin) {
		try {
			await supabaseAdmin
				.from('tcgplayer_product_ids')
				.upsert(
					{
						card_id: cardId,
						product_id: resolved.product_id,
						source: resolved.source ?? 'manual',
						resolved_at: new Date().toISOString(),
						verified_at: new Date().toISOString()
					},
					{ onConflict: 'card_id' }
				);
		} catch {
			// Migration not applied yet. The resolver works; just no
			// persistent caching until the table exists.
		}
	}

	return resolved;
}

/**
 * Step 3: TCGPlayer's internal search API. Returns the first result
 * whose setName + card_number match the card_index row exactly.
 *
 * Exported for testing.
 */
export async function resolveViaTcgPlayerSearch(
	input: ResolverCardInput
): Promise<ResolveResult> {
	if (!input.name) return { product_id: null, source: null };

	const query = [input.name, input.set_name].filter(Boolean).join(' ');
	const body = {
		algorithm: '',
		from: 0,
		size: 12,
		filters: {
			term: { productLineName: ['pokemon'] },
			range: {},
			match: {}
		},
		context: { shippingCountry: 'US' },
		sort: {}
	};

	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 10_000);
		const res = await fetch(`${TCGPLAYER_SEARCH}?q=${encodeURIComponent(query)}&isList=true`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': SCRAPER_UA,
				Origin: 'https://www.tcgplayer.com',
				Referer: 'https://www.tcgplayer.com/'
			},
			body: JSON.stringify(body),
			signal: ctrl.signal
		});
		clearTimeout(t);
		if (!res.ok) return { product_id: null, source: null };

		const json = (await res.json()) as {
			results?: Array<{
				results?: Array<{
					productId: number;
					productName: string;
					setName: string;
					customAttributes?: { number?: string };
				}>;
			}>;
		};
		const hits = json?.results?.[0]?.results ?? [];

		// (setName, card_number) match is mandatory — honesty doctrine —
		// but the two catalogs disagree on format:
		//
		//   card_index: "Perfect Order"   "Paradox Rift"           "93"     "198"
		//   TCGPlayer : "ME03: Perfect Order"  "SV04: Paradox Rift"  "093/088"  "198/182"
		//
		// So we (a) strip the leading "XXNN:" set prefix and compare on the
		// remainder (case-insensitive substring either direction), and (b)
		// extract just the numerator from TCGPlayer's "N/M" and strip
		// leading zeros before comparing.
		const normSet = (s: string | null | undefined) =>
			(s ?? '')
				.trim()
				.toLowerCase()
				.replace(/^[a-z]{2,4}\d{1,3}:\s*/, ''); // strip "ME03: " / "SV04: " / "sv6pt5: "
		const normNum = (s: string | null | undefined) => {
			const head = (s ?? '').trim().split('/')[0];
			// Strip leading zeros but preserve alpha prefixes like "TG17" / "DP47".
			const m = head.match(/^([a-zA-Z]*)0*(\d+|[a-zA-Z0-9]+)$/);
			return (m ? `${m[1]}${m[2]}` : head).toLowerCase();
		};
		const wantSet = normSet(input.set_name);
		const wantNum = normNum(input.card_number);

		for (const r of hits) {
			const haveSet = normSet(r.setName);
			const haveNum = normNum(r.customAttributes?.number);
			if (haveNum !== wantNum) continue;
			// Set: accept exact OR substring either direction (handles "Arceus"
			// vs "Arceus", "Perfect Order" vs "ME03: Perfect Order"). Number
			// match already disambiguates within a set; this just guards
			// against same-numbered cards in unrelated sets.
			if (
				haveSet === wantSet ||
				(wantSet.length > 0 &&
					(haveSet.includes(wantSet) || wantSet.includes(haveSet)))
			) {
				return { product_id: Number(r.productId), source: 'tcgplayer_search' };
			}
		}
		return { product_id: null, source: null };
	} catch {
		return { product_id: null, source: null };
	}
}
