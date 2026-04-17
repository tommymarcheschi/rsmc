/**
 * TCGPlayer Search API scraper
 *
 * Fills the gap when pokemontcg.io hasn't picked up prices for a set
 * yet — the case for recent releases like ME: Ascended Heroes / Perfect
 * Order. Hits mp-search-api.tcgplayer.com (the same JSON endpoint the
 * TCGPlayer site uses) which bypasses the Cloudflare-challenged HTML
 * search page entirely.
 *
 * One row per product — TCGPlayer lists each printing (normal, holo,
 * reverse holo, rainbow, etc.) as its own product, each with its own
 * productId and market price. Callers can dedup by card number if they
 * want a single "headline" price per card.
 */
export interface TcgPlayerProduct {
	productId: number;
	productName: string;
	/** "196/217" format. Null for sealed/booster products. */
	number: string | null;
	/** Parsed numeric prefix of `number` (196 from "196/217"). Null when `number` is null. */
	numberInt: number | null;
	rarityName: string | null;
	/** TCGPlayer's algorithmic market price. USD. Null when unavailable. */
	marketPrice: number | null;
	medianPrice: number | null;
	lowestPrice: number | null;
	totalListings: number;
}

const ENDPOINT =
	'https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false&mpfev=3247';

const HEADERS: HeadersInit = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	Accept: 'application/json, text/plain, */*',
	'Content-Type': 'application/json',
	Origin: 'https://www.tcgplayer.com',
	Referer: 'https://www.tcgplayer.com/'
};

// TCGPlayer's search API silently 400s above size=50.
const PAGE_SIZE = 50;

/**
 * Fetch every product in a TCGPlayer set by paginating their search API.
 *
 * @param tcgSetUrlName The kebab-case set name TCGPlayer uses in its
 *   filters — e.g. "me-ascended-heroes" for ME: Ascended Heroes.
 *   (URL: tcgplayer.com/search/pokemon/product?setName=…|me-ascended-heroes)
 * @param opts.limit Optional cap on total rows. Default: no cap (fetch all).
 */
export async function fetchTcgPlayerSet(
	tcgSetUrlName: string,
	opts: { limit?: number } = {}
): Promise<TcgPlayerProduct[]> {
	const out: TcgPlayerProduct[] = [];
	let from = 0;

	while (true) {
		const body = {
			algorithm: '',
			from,
			size: PAGE_SIZE,
			filters: {
				term: {
					productLineName: ['pokemon'],
					setName: [tcgSetUrlName]
				},
				range: {},
				match: {}
			},
			listingSearch: {
				context: { cart: {} },
				filters: { term: {}, range: {}, exclude: {} }
			},
			context: { cart: {}, shippingCountry: 'US' },
			settings: { useFuzzySearch: false, didYouMean: {} },
			sort: {}
		};

		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: HEADERS,
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			throw new Error(`TCGPlayer search ${res.status} ${res.statusText}`);
		}
		const data = (await res.json()) as {
			results?: Array<{
				totalResults?: number;
				results?: Array<{
					productId: number;
					productName: string;
					customAttributes?: { number?: string | null };
					rarityName?: string | null;
					marketPrice?: number | null;
					medianPrice?: number | null;
					lowestPrice?: number | null;
					totalListings?: number;
				}>;
			}>;
		};

		const block = data.results?.[0];
		const total = block?.totalResults ?? 0;
		const page = block?.results ?? [];

		for (const r of page) {
			const num = (r.customAttributes?.number ?? '').trim() || null;
			const numericPrefix = num ? parseInt(num.split('/')[0], 10) : null;
			out.push({
				productId: r.productId,
				productName: r.productName,
				number: num,
				numberInt: Number.isFinite(numericPrefix) ? (numericPrefix as number) : null,
				rarityName: r.rarityName ?? null,
				marketPrice: r.marketPrice ?? null,
				medianPrice: r.medianPrice ?? null,
				lowestPrice: r.lowestPrice ?? null,
				totalListings: r.totalListings ?? 0
			});
		}

		if (opts.limit && out.length >= opts.limit) {
			return out.slice(0, opts.limit);
		}
		if (page.length < PAGE_SIZE || out.length >= total) return out;
		from += PAGE_SIZE;

		// Polite delay — TCGPlayer's endpoint will 429 under sustained load.
		await new Promise((r) => setTimeout(r, 250));
	}
}

/**
 * Reduce multiple TCGPlayer products that share the same card number
 * (normal + holo + reverse holo variants of the same card) to a single
 * "headline" price — the highest market price among printings. Mirrors
 * how card_index.tcg_headline_market is computed from pokemontcg.io.
 */
export function headlineByNumber(
	products: TcgPlayerProduct[]
): Map<number, { market: number | null; low: number | null; productId: number }> {
	const byNum = new Map<
		number,
		{ market: number | null; low: number | null; productId: number }
	>();
	for (const p of products) {
		if (p.numberInt == null) continue;
		const existing = byNum.get(p.numberInt);
		const market = p.marketPrice ?? null;
		const low = p.lowestPrice ?? null;
		if (!existing) {
			byNum.set(p.numberInt, { market, low, productId: p.productId });
			continue;
		}
		// Prefer the variant with the higher market price (TCGPlayer's own
		// headline convention — matches what pokemontcg.io reports).
		if (market != null && (existing.market == null || market > existing.market)) {
			byNum.set(p.numberInt, { market, low, productId: p.productId });
		}
	}
	return byNum;
}
