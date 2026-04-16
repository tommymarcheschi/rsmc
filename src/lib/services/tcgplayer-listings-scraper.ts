/**
 * TCGPlayer Listings Scraper — per-condition marketplace pricing
 *
 * Fetches the active marketplace listings for a single TCGPlayer product.
 * Unlike `tcgplayer-scraper.ts` (which scrapes the recent-sales table),
 * this one targets the listings section and returns one row per active
 * seller — with the condition TCGPlayer reports for that listing.
 *
 * This is the Phase 1 differentiator: PriceCharting reports a single
 * "ungraded" number; TCGPlayer listings let us derive structured
 * NM/LP/MP/HP/DMG ladders.
 *
 * Data flow:
 *   productId → POST mp-search-api.tcgplayer.com/v1/product/{id}/listings
 *             → results[].{ price, condition, printing, quantity, sellerName }
 *             → map through inferCondition (safety net) + price→cents
 *             → structured { price_cents, condition, confidence, … }
 *
 * Robustness:
 *   - HTML fallback for when the JSON API 403's (parses __NEXT_DATA__)
 *   - Optional `dryRun` flag — fetches and logs but never returns
 *     shaped data to downstream persistence code. Phase 1 verification
 *     step 3 uses this against smp-SM04 and base1-4.
 *
 * Non-goals (explicit):
 *   - Writing to DB. That's the ingestion script's job. This module is
 *     a pure fetcher with side-effects limited to network + console.
 *   - Pagination across thousands of listings. Capped at 200 per call;
 *     enough to compute medians without flooding the endpoint.
 */

import { inferCondition, type Condition } from './condition-detector';

const LISTINGS_ENDPOINT_BASE = 'https://mp-search-api.tcgplayer.com/v1/product';
const PRODUCT_PAGE_BASE = 'https://www.tcgplayer.com/product';

const HEADERS: HeadersInit = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	Accept: 'application/json, text/plain, */*',
	'Accept-Language': 'en-US,en;q=0.9',
	'Content-Type': 'application/json',
	Origin: 'https://www.tcgplayer.com',
	Referer: 'https://www.tcgplayer.com/'
};

const HTML_HEADERS: HeadersInit = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9'
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TCGListing {
	/** Always integer cents. Total asking price for a single copy (price only; shipping excluded). */
	price_cents: number;
	/** Normalised condition. Null when TCGPlayer's label didn't map to our 5-tier scale. */
	condition: Condition | null;
	/** 0–1. Canonical TCGPlayer labels resolve at ≥0.95. */
	confidence: number;
	/** Raw condition text TCGPlayer returned (for audit / debugging). */
	rawCondition: string | null;
	/** Printing variant — "Normal", "Holofoil", "Reverse Holofoil", "1st Edition Holofoil", etc. */
	printing: string | null;
	/** Number of copies in this listing. */
	quantity: number;
	/** Seller display name. Kept for future anti-spam heuristics. */
	seller: string | null;
	/** TCGPlayer's own listing id, used for dedup in sale_events. */
	listingId: string | null;
}

export interface FetchListingsOptions {
	productId: number | string;
	/** Max listings to return. Clamped 1–200. Default 100. */
	limit?: number;
	/** Filter to specific printings ("Normal", "Holofoil"…). Default: all printings. */
	printings?: string[];
	/**
	 * When true, the scraper runs the request and logs what it would
	 * return, but returns an empty array to callers. Intended for
	 * verification against known product ids before wiring into the
	 * ingestion script.
	 */
	dryRun?: boolean;
}

export interface FetchListingsResult {
	productId: string;
	productUrl: string;
	listings: TCGListing[];
	/** Whether results came from the JSON API or the HTML fallback. */
	source: 'api' | 'html' | 'none';
	error?: string;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchTCGPlayerListings(
	opts: FetchListingsOptions
): Promise<FetchListingsResult> {
	const productId = String(opts.productId);
	const limit = clamp(opts.limit ?? 100, 1, 200);
	const productUrl = `${PRODUCT_PAGE_BASE}/${productId}/`;

	// Try the JSON listings endpoint first.
	let listings = await fetchViaApi(productId, limit, opts.printings);
	let source: FetchListingsResult['source'] = listings.length > 0 ? 'api' : 'none';

	// Fallback to HTML __NEXT_DATA__ scraping if the API didn't return anything.
	if (listings.length === 0) {
		const htmlListings = await fetchViaHtml(productId, limit, opts.printings);
		if (htmlListings.length > 0) {
			listings = htmlListings;
			source = 'html';
		}
	}

	if (opts.dryRun) {
		const summary = summariseByCondition(listings);
		console.log(
			`[tcgplayer-listings dry-run] productId=${productId} source=${source} ` +
				`count=${listings.length} ${summary}`
		);
		return { productId, productUrl, listings: [], source };
	}

	return { productId, productUrl, listings, source };
}

// ---------------------------------------------------------------------------
// JSON API path
// ---------------------------------------------------------------------------

interface ApiListing {
	listingId?: number | string;
	productId?: number | string;
	price?: number;
	shippingPrice?: number;
	quantity?: number;
	sellerName?: string;
	condition?: string;
	printing?: string;
	language?: string;
}

interface ApiResponse {
	results?: Array<{
		results?: ApiListing[];
		totalResults?: number;
	}>;
}

// TCGPlayer's listings API caps page size at 50 — larger sizes silently
// return empty. We paginate with `from` offsets to reach the requested limit.
const PAGE_SIZE = 50;

async function fetchViaApi(
	productId: string,
	limit: number,
	printings: string[] | undefined
): Promise<TCGListing[]> {
	const collected: TCGListing[] = [];
	const seenListingIds = new Set<string>();

	for (let from = 0; from < limit && collected.length < limit; from += PAGE_SIZE) {
		const size = Math.min(PAGE_SIZE, limit - from);
		const body = {
			filters: {
				term: {
					sellerStatus: 'Live',
					channelId: 0,
					language: ['English'],
					...(printings && printings.length > 0 ? { printing: printings } : {})
				}
			},
			from,
			size,
			sort: { field: 'price+shipping', order: 'asc' },
			context: { shippingCountry: 'US' }
		};

		let raw: ApiListing[] = [];
		try {
			const res = await fetch(`${LISTINGS_ENDPOINT_BASE}/${productId}/listings`, {
				method: 'POST',
				headers: HEADERS,
				body: JSON.stringify(body)
			});
			if (!res.ok) break;
			const data = (await res.json()) as ApiResponse;
			raw = data.results?.[0]?.results ?? [];
		} catch {
			break;
		}

		if (raw.length === 0) break; // reached end of listings

		for (const r of raw) {
			const mapped = mapApiListing(r);
			if (!mapped) continue;
			const key = mapped.listingId ?? `${mapped.price_cents}:${mapped.seller}:${mapped.rawCondition}`;
			if (seenListingIds.has(key)) continue;
			seenListingIds.add(key);
			collected.push(mapped);
		}

		if (raw.length < size) break; // partial page = end of results
	}

	return collected;
}

function mapApiListing(r: ApiListing): TCGListing | null {
	if (typeof r.price !== 'number' || r.price <= 0) return null;
	const rawCondition = typeof r.condition === 'string' ? r.condition : null;
	const inferred = rawCondition ? inferCondition(rawCondition) : null;
	return {
		price_cents: Math.round(r.price * 100),
		condition: inferred?.condition ?? null,
		confidence: inferred?.confidence ?? 0,
		rawCondition,
		printing: typeof r.printing === 'string' ? r.printing : null,
		quantity: typeof r.quantity === 'number' ? r.quantity : 0,
		seller: typeof r.sellerName === 'string' ? r.sellerName : null,
		listingId: r.listingId != null ? String(r.listingId) : null
	};
}

// ---------------------------------------------------------------------------
// HTML fallback — parse __NEXT_DATA__
// ---------------------------------------------------------------------------

async function fetchViaHtml(
	productId: string,
	limit: number,
	printings: string[] | undefined
): Promise<TCGListing[]> {
	try {
		const res = await fetch(`${PRODUCT_PAGE_BASE}/${productId}/`, {
			headers: HTML_HEADERS,
			redirect: 'follow'
		});
		if (!res.ok) return [];
		const html = await res.text();
		const nextData = extractNextData(html);
		if (!nextData) return [];

		// __NEXT_DATA__ structure varies across TCGPlayer releases. We walk
		// the tree looking for arrays of objects that look like listings.
		const candidates = findListingArrays(nextData);
		for (const arr of candidates) {
			const mapped = arr
				.map((raw) => mapApiListing(raw as ApiListing))
				.filter((l): l is TCGListing => l !== null);
			if (mapped.length === 0) continue;
			const filtered =
				printings && printings.length > 0
					? mapped.filter((l) => !l.printing || printings.includes(l.printing))
					: mapped;
			return filtered.slice(0, limit);
		}
		return [];
	} catch {
		return [];
	}
}

function extractNextData(html: string): unknown {
	const match = html.match(
		/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
	);
	if (!match) return null;
	try {
		return JSON.parse(match[1]);
	} catch {
		return null;
	}
}

/**
 * Walk an arbitrary JSON tree and collect arrays that look like listings
 * (objects with price + condition keys). Keeps the scraper resilient to
 * the exact nesting path changing.
 */
function findListingArrays(root: unknown): unknown[][] {
	const out: unknown[][] = [];
	const seen = new Set<object>();

	function walk(node: unknown): void {
		if (node === null || typeof node !== 'object') return;
		if (seen.has(node as object)) return;
		seen.add(node as object);

		if (Array.isArray(node)) {
			const looksLikeListings =
				node.length > 0 &&
				node.every(
					(item) =>
						item !== null &&
						typeof item === 'object' &&
						'price' in (item as object) &&
						'condition' in (item as object)
				);
			if (looksLikeListings) {
				out.push(node);
				return; // don't descend further into this array
			}
			for (const item of node) walk(item);
			return;
		}

		for (const v of Object.values(node as Record<string, unknown>)) walk(v);
	}

	walk(root);
	return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n));
}

function summariseByCondition(listings: TCGListing[]): string {
	const buckets: Record<string, number[]> = {};
	for (const l of listings) {
		const key = l.condition ?? 'unknown';
		(buckets[key] ||= []).push(l.price_cents);
	}
	return Object.entries(buckets)
		.map(([c, prices]) => {
			const median = prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
			return `${c}=${prices.length}(med $${(median / 100).toFixed(2)})`;
		})
		.join(' ');
}
