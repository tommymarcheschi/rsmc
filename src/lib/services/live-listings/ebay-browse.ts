/**
 * eBay Browse API live-listings provider.
 *
 * Implements `LiveListingsProvider` against eBay's official Browse API
 * (project_ebay_listings_path). Uses client-credentials OAuth — no end-user
 * sign-in — and the `/buy/browse/v1/item_summary/search` endpoint for active
 * fixed-price + auction listings, scoped to category 183454 (Pokémon TCG).
 *
 * Credentials are Erik's borrowed keyset (project_ebay_dev_rejected). His
 * keyset = his daily quota — we cache aggressively (30 min/card) to stay
 * well under the 5k/day default ceiling.
 *
 * Fail-safe: with no `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` in env, every
 * call returns an empty result rather than throwing. The factory in
 * `./index.ts` only routes here when `LIVE_LISTINGS_PROVIDER=ebay` is
 * explicitly set, so the page keeps working on the stub otherwise.
 */

import type {
	BuyingOption,
	FetchForCardOptions,
	LiveListing,
	LiveListingsProvider,
	LiveListingsResult,
	ListingCondition,
	Marketplace
} from './types';

const SOURCE = 'ebay-browse';
const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MARKETPLACE_HEADER = 'EBAY_US';
const POKEMON_TCG_CATEGORY = '183454';
const CACHE_TTL_MS = 30 * 60 * 1000;
// Token TTL is 7200s per eBay docs; renew a minute early to avoid edge expiry.
const TOKEN_RENEW_LEAD_MS = 60 * 1000;

interface TokenCache {
	token: string;
	expires_at: number;
}
let tokenCache: TokenCache | null = null;
let tokenInFlight: Promise<string | null> | null = null;

interface CacheEntry {
	result: LiveListingsResult;
	expires_at: number;
}
const listingCache = new Map<string, CacheEntry>();

function emptyResult(query: string): LiveListingsResult {
	return {
		listings: [],
		fetched_at: new Date().toISOString(),
		source: SOURCE,
		query,
		lowest_ask_cents: null
	};
}

function cacheKey(opts: FetchForCardOptions): string {
	return [
		opts.card_id,
		opts.grader ?? '',
		opts.grade ?? '',
		opts.raw_only ? 'raw' : '',
		opts.limit ?? 20
	].join('|');
}

async function getAccessToken(): Promise<string | null> {
	const clientId = process.env.EBAY_CLIENT_ID;
	const clientSecret = process.env.EBAY_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;

	const now = Date.now();
	if (tokenCache && tokenCache.expires_at - TOKEN_RENEW_LEAD_MS > now) {
		return tokenCache.token;
	}

	// Coalesce concurrent renewals — if a refresh is already in flight, await it
	// instead of stampeding the token endpoint.
	if (tokenInFlight) return tokenInFlight;

	tokenInFlight = (async () => {
		try {
			const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
			const body = new URLSearchParams({
				grant_type: 'client_credentials',
				scope: 'https://api.ebay.com/oauth/api_scope'
			});
			const res = await fetch(TOKEN_URL, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${basic}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body
			});
			if (!res.ok) return null;
			const json = (await res.json()) as { access_token?: string; expires_in?: number };
			if (!json.access_token) return null;
			const ttlSec = json.expires_in ?? 7200;
			tokenCache = {
				token: json.access_token,
				expires_at: Date.now() + ttlSec * 1000
			};
			return tokenCache.token;
		} catch {
			return null;
		} finally {
			tokenInFlight = null;
		}
	})();

	return tokenInFlight;
}

// Title heuristics. eBay listings encode condition + grader + grade in free
// text — there is no clean structured field for "PSA 10". These regexes cover
// the patterns vendors actually use; anything ambiguous falls back to nulls.
const GRADER_PATTERNS: Array<{ grader: NonNullable<LiveListing['grader']>; re: RegExp }> = [
	{ grader: 'PSA', re: /\bPSA\s*(\d{1,2})\b/i },
	{ grader: 'CGC', re: /\bCGC\s*(\d{1,2}(?:\.\d)?)\b/i },
	{ grader: 'BGS', re: /\bBGS\s*(\d{1,2}(?:\.\d)?)\b/i },
	{ grader: 'SGC', re: /\bSGC\s*(\d{1,2}(?:\.\d)?)\b/i },
	{ grader: 'TAG', re: /\bTAG\s*(\d{1,3}(?:\.\d)?)\b/i }
];

function parseGradedFromTitle(
	title: string
): { grader: LiveListing['grader']; grade: number | null } {
	for (const { grader, re } of GRADER_PATTERNS) {
		const m = title.match(re);
		if (m) {
			const grade = parseFloat(m[1]);
			return { grader, grade: Number.isFinite(grade) ? grade : null };
		}
	}
	return { grader: null, grade: null };
}

function inferCondition(
	title: string,
	apiCondition: string | undefined
): ListingCondition {
	if (parseGradedFromTitle(title).grader != null) return 'graded';
	// eBay's `condition` strings: "New", "Used", "Like New", "Pre-Owned", etc.
	// All of those are raw for a single Pokémon card.
	if (apiCondition && /new|used|pre-?owned|like new|mint/i.test(apiCondition)) return 'raw';
	if (/\b(NM|LP|MP|HP|DMG|near mint|raw|ungraded)\b/i.test(title)) return 'raw';
	return 'unknown';
}

function mapBuyingOption(options: string[] | undefined): BuyingOption {
	if (!options || options.length === 0) return 'fixed_price';
	// eBay returns an array, e.g. ["FIXED_PRICE", "BEST_OFFER"]. Prefer the
	// most user-facing semantic — auction beats best-offer beats fixed-price.
	const upper = options.map((o) => o.toUpperCase());
	if (upper.includes('AUCTION')) return 'auction';
	if (upper.includes('BEST_OFFER')) return 'best_offer';
	return 'fixed_price';
}

function priceToCents(value: string | number | undefined): number | null {
	if (value == null) return null;
	const n = typeof value === 'string' ? parseFloat(value) : value;
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100);
}

interface EbayItemSummary {
	title?: string;
	price?: { value?: string; currency?: string };
	shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
	condition?: string;
	buyingOptions?: string[];
	itemWebUrl?: string;
	image?: { imageUrl?: string };
	itemEndDate?: string;
}

function mapItem(item: EbayItemSummary): LiveListing | null {
	const price_cents = priceToCents(item.price?.value);
	if (price_cents == null) return null;
	const title = item.title ?? '';
	const url = item.itemWebUrl;
	if (!url) return null;

	const { grader, grade } = parseGradedFromTitle(title);
	const condition = inferCondition(title, item.condition);
	const buying = mapBuyingOption(item.buyingOptions);

	return {
		title,
		price_cents,
		shipping_cents: priceToCents(item.shippingOptions?.[0]?.shippingCost?.value),
		condition,
		grader: condition === 'graded' ? grader : null,
		grade: condition === 'graded' ? grade : null,
		marketplace: 'ebay' satisfies Marketplace,
		buying_option: buying,
		listing_url: url,
		image_url: item.image?.imageUrl ?? null,
		ends_at: buying === 'auction' ? item.itemEndDate ?? null : null
	};
}

function buildQuery(opts: FetchForCardOptions): string {
	return [opts.name, opts.set_name, opts.card_number].filter(Boolean).join(' ').trim();
}

function buildSearchParams(opts: FetchForCardOptions, q: string): URLSearchParams {
	const limit = Math.min(opts.limit ?? 20, 50);
	const params = new URLSearchParams({
		q,
		category_ids: POKEMON_TCG_CATEGORY,
		limit: String(limit),
		sort: 'price'
	});

	// Filter syntax is comma-separated `key:{val|val}` clauses.
	const filters: string[] = ['buyingOptions:{FIXED_PRICE|AUCTION}'];

	if (opts.grader && opts.grade != null) {
		// eBay's `condition` enum doesn't model graded cards distinctly; vendors
		// encode grading in the title. Narrow by also requiring the grader name
		// + grade to appear via a description filter — this is best-effort, the
		// final source of truth is the title-parse on the way back.
		// (eBay doesn't accept arbitrary text filters; the title-parse is the
		// only reliable gate. We leave the API filter list to non-text axes.)
	} else if (opts.raw_only) {
		// "NEW" + "USED_*" cover all raw-card listings.
		filters.push('conditions:{NEW|USED_EXCELLENT|USED_VERY_GOOD|USED_GOOD|USED_ACCEPTABLE}');
	}

	params.set('filter', filters.join(','));
	return params;
}

function filterByGraderGrade(
	listings: LiveListing[],
	grader: FetchForCardOptions['grader'],
	grade: FetchForCardOptions['grade'],
	raw_only: boolean | undefined
): LiveListing[] {
	if (grader) {
		return listings.filter(
			(l) => l.grader === grader && (grade == null || l.grade === grade)
		);
	}
	if (raw_only) {
		return listings.filter((l) => l.condition === 'raw');
	}
	return listings;
}

export const ebayBrowseProvider: LiveListingsProvider = {
	name: SOURCE,

	async fetchForCard(opts: FetchForCardOptions): Promise<LiveListingsResult> {
		const query = buildQuery(opts);
		const key = cacheKey(opts);
		const now = Date.now();
		const cached = listingCache.get(key);
		if (cached && cached.expires_at > now) {
			return cached.result;
		}

		const token = await getAccessToken();
		if (!token) return emptyResult(query);

		try {
			const params = buildSearchParams(opts, query);
			const res = await fetch(`${SEARCH_URL}?${params}`, {
				headers: {
					Authorization: `Bearer ${token}`,
					'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_HEADER,
					Accept: 'application/json'
				}
			});
			if (!res.ok) {
				// Cache a short empty result on 4xx/5xx so a sustained eBay outage
				// doesn't hammer the upstream on every page view. 5 min is short
				// enough that a real recovery shows up promptly.
				const stale = emptyResult(query);
				listingCache.set(key, { result: stale, expires_at: now + 5 * 60 * 1000 });
				return stale;
			}
			const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
			const raw = (json.itemSummaries ?? [])
				.map(mapItem)
				.filter((l): l is LiveListing => l != null);
			const filtered = filterByGraderGrade(raw, opts.grader, opts.grade, opts.raw_only);
			filtered.sort((a, b) => a.price_cents - b.price_cents);

			const result: LiveListingsResult = {
				listings: filtered,
				fetched_at: new Date().toISOString(),
				source: SOURCE,
				query,
				lowest_ask_cents: filtered.length > 0 ? filtered[0].price_cents : null
			};
			listingCache.set(key, { result, expires_at: now + CACHE_TTL_MS });
			return result;
		} catch {
			return emptyResult(query);
		}
	}
};

// Exported for tests only — lets the test reset the in-process token + listing
// caches between cases without resorting to module re-import tricks.
export const __ebayBrowseInternals = {
	resetCaches(): void {
		tokenCache = null;
		tokenInFlight = null;
		listingCache.clear();
	}
};
