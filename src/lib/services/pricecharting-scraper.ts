/**
 * PriceCharting Scraper — Graded & Ungraded Card Prices
 *
 * Scrapes publicly available price data from pricecharting.com.
 * Returns per-grade prices (Ungraded, PSA 10, CGC 10, TAG 10, etc.)
 * from their product pages. No API key required.
 *
 * Two-step process:
 *  1. Search for the card via their search endpoint
 *  2. Fetch the product page and parse the price tiers table
 */

const PC_BASE = 'https://www.pricecharting.com';

const HEADERS: HeadersInit = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'no-cache'
};

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PopDistribution {
	/** Grade counts indexed 0–9 = grades 1–10 */
	grades: number[];
	/** Sum of all grades */
	total: number;
	/** Count at grade 10 (last element) */
	grade10: number;
	/** Gem rate: grade10 / total as percentage */
	gemRate: number;
}

export interface PriceChartingData {
	/** PriceCharting "Ungraded" tier — the canonical raw price */
	ungraded: number | null;
	/** PSA 10 price */
	psa10: number | null;
	/** CGC 10 price (when available) */
	cgc10: number | null;
	/** BGS 10 price (when available) */
	bgs10: number | null;
	/** TAG 10 price (when available) */
	tag10: number | null;
	/** All parsed tiers as key→price map for future use */
	allTiers: Record<string, number>;
	/** PSA population distribution (from pop_data JS variable) */
	psaPop: PopDistribution | null;
	/** CGC population distribution */
	cgcPop: PopDistribution | null;
	/** ISO date (YYYY-MM-DD) of the most recent PSA 10 comp sale listed on
	 *  PriceCharting, or null when none. Used to flag stale graded prices. */
	psa10LastSold: string | null;
	/** Full URL of the matched product page */
	pcUrl: string;
	/** The product name as shown on PriceCharting */
	matchedName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
	// Try native fetch first (works from SvelteKit server context)
	try {
		const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
		if (res.ok) return await res.text();
		// If Cloudflare blocked us (403), fall through to curl
		if (res.status !== 403) return null;
	} catch {
		// Network error — fall through to curl
	}

	// Fallback: use curl subprocess. Cloudflare fingerprints Node.js's TLS
	// (undici) differently from curl, so curl often passes where fetch fails.
	return fetchPageWithCurl(url);
}

async function fetchPageWithCurl(url: string): Promise<string | null> {
	try {
		const { execSync } = await import('child_process');
		// Full browser header set required to pass Cloudflare's bot detection.
		// Cloudflare checks Sec-Fetch-* headers and Accept-Encoding — without
		// them it returns a 403 "Just a moment" challenge page.
		const result = execSync(
			`curl -sL --compressed --max-time 10 ` +
			`-H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" ` +
			`-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" ` +
			`-H "Accept-Language: en-US,en;q=0.9" ` +
			`-H "Accept-Encoding: gzip, deflate, br" ` +
			`-H "Sec-Fetch-Dest: document" ` +
			`-H "Sec-Fetch-Mode: navigate" ` +
			`-H "Sec-Fetch-Site: none" ` +
			`-H "Sec-Fetch-User: ?1" ` +
			`-H "Upgrade-Insecure-Requests: 1" ` +
			`"${url}"`,
			{ encoding: 'utf-8', timeout: 15000 }
		);
		if (!result || result.includes('Just a moment')) return null;
		return result;
	} catch {
		return null;
	}
}

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#?\w+;/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Parse a price string like "$12.50" or "$1,234.00" into a number. */
function parsePrice(raw: string): number | null {
	const cleaned = raw.replace(/[$,\s]/g, '');
	const num = parseFloat(cleaned);
	return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Normalise a card/set name for matching: lowercase, strip special chars,
 * collapse whitespace.
 */
function normalise(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// ---------------------------------------------------------------------------
// Search → resolve product URL
// ---------------------------------------------------------------------------

interface SearchResult {
	name: string;
	url: string;
}

/**
 * Search PriceCharting for a Pokemon card and return candidate results.
 * Their search endpoint returns an HTML results page with links like
 * /game/pokemon-<set-slug>/<card-slug>.
 */
async function searchProducts(query: string): Promise<SearchResult[]> {
	const searchUrl = `${PC_BASE}/search-products?q=${encodeURIComponent(query)}&type=prices`;
	const html = await fetchPage(searchUrl);
	if (!html) return [];

	const results: SearchResult[] = [];

	// PriceCharting search results render as links in a list/table.
	// Links can be relative (/game/pokemon-*) or full URLs (https://www.pricecharting.com/game/pokemon-*).
	const linkRegex = /<a[^>]*href="((?:https?:\/\/www\.pricecharting\.com)?\/game\/pokemon[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	for (const m of html.matchAll(linkRegex)) {
		let url = m[1];
		const name = stripHtml(m[2]);
		if (!url || !name) continue;
		// Normalise to full URL
		if (url.startsWith('/')) url = `${PC_BASE}${url}`;
		// Deduplicate (PriceCharting renders each link twice — image + text)
		if (!results.some((r) => r.url === url)) {
			results.push({ name, url });
		}
	}

	return results;
}

/**
 * Pick the best search result by matching against the card name and set name.
 * Prefers exact name+set matches over partial matches.
 */
function pickBestResult(
	results: SearchResult[],
	cardName: string,
	setName?: string,
	cardNumber?: string
): SearchResult | null {
	if (results.length === 0) return null;

	const normCard = normalise(cardName);
	const normSet = setName ? normalise(setName) : '';
	const normNumber = cardNumber?.replace(/^0+/, '') ?? '';

	// Score each result
	let bestScore = -1;
	let bestResult: SearchResult | null = null;

	for (const r of results) {
		const normResult = normalise(r.name);
		const normUrl = r.url.toLowerCase();
		let score = 0;

		// Name match
		if (normResult.includes(normCard)) score += 10;
		else if (normCard.split(' ').every((w) => normResult.includes(w))) score += 7;

		// Set match
		if (normSet && normResult.includes(normSet)) score += 5;
		else if (normSet && normUrl.includes(normalise(setName!).replace(/\s/g, '-'))) score += 4;

		// Card number in the URL slug (e.g. "charizard-4")
		if (normNumber && normUrl.match(new RegExp(`-${normNumber}$`))) score += 3;

		// Prefer non-special variants (avoid 1st edition, shadowless, error, etc.)
		// unless the card name itself contains those terms
		const specialTerms = ['1st edition', 'shadowless', 'error', 'misprint'];
		const hasSpecial = specialTerms.some((t) => normResult.includes(t));
		const wantsSpecial = specialTerms.some((t) => normCard.includes(t));
		if (hasSpecial && !wantsSpecial) score -= 2;

		if (score > bestScore) {
			bestScore = score;
			bestResult = r;
		}
	}

	return bestResult;
}

// ---------------------------------------------------------------------------
// Parse product page price tiers
// ---------------------------------------------------------------------------

/**
 * Extract price tiers from a PriceCharting product page.
 *
 * PriceCharting renders a table/section with rows like:
 *   Ungraded  |  $12.50
 *   Grade 7   |  $45.00
 *   PSA 10    |  $350.00
 *   CGC 10    |  $280.00
 *
 * The exact HTML varies but prices are consistently inside elements
 * with class "price" or in table cells next to tier labels.
 */
function parsePriceTiers(html: string): Record<string, number> {
	const tiers: Record<string, number> = {};

	// Strategy 1 (primary): Parse the #full-prices table.
	// PriceCharting renders a clean table under <div id="full-prices"> with rows:
	//   <td>Ungraded</td>
	//   <td class="price js-price">$336.87</td>
	// This is the most reliable source and contains all grading tiers.
	const fullPricesMatch = html.match(/id="full-prices"[\s\S]*?<table>([\s\S]*?)<\/table>/i);
	if (fullPricesMatch) {
		const tableHtml = fullPricesMatch[1];
		// Match pairs of <td>Label</td> <td ...>$Price</td>
		const rowRegex = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
		for (const m of tableHtml.matchAll(rowRegex)) {
			const label = stripHtml(m[1]).trim();
			const priceText = stripHtml(m[2]).trim();
			if (!label || priceText === '-') continue;
			const price = parsePrice(priceText);
			if (price != null) {
				tiers[label] = price;
			}
		}
	}

	// Strategy 2: If #full-prices wasn't found, try the id-based price elements.
	// PriceCharting uses ids like "used_price" (= Ungraded), "graded_price", etc.
	if (Object.keys(tiers).length === 0) {
		const idPriceRegex = /id="([^"]*_price)"[\s\S]*?class="price[\s\S]*?\$([\d,.]+)/gi;
		for (const m of html.matchAll(idPriceRegex)) {
			const id = m[1].toLowerCase();
			const price = parsePrice(m[2]);
			if (price == null) continue;

			if (id.includes('used') || id.includes('loose')) {
				tiers['Ungraded'] = tiers['Ungraded'] ?? price;
			} else if (id === 'complete_price') {
				tiers['Complete'] = tiers['Complete'] ?? price;
			} else if (id === 'new_price') {
				tiers['New'] = tiers['New'] ?? price;
			} else if (id === 'graded_price') {
				tiers['Graded'] = tiers['Graded'] ?? price;
			}
		}
	}

	// Strategy 3: Fallback — tier label → price patterns anywhere in the HTML.
	if (Object.keys(tiers).length === 0) {
		const tierPriceRegex =
			/(Ungraded|Grade\s*\d+(?:\.\d)?|PSA\s*10|CGC\s*(?:10|9\.5|Pristine)|BGS\s*(?:10|9\.5|Black\s*Label)|TAG\s*10|SGC\s*10|ACE\s*10)[^$]*?\$\s*([\d,.]+)/gi;
		for (const m of html.matchAll(tierPriceRegex)) {
			const label = stripHtml(m[1]).trim();
			const price = parsePrice(m[2]);
			if (label && price != null) {
				tiers[label] = tiers[label] ?? price;
			}
		}
	}

	return tiers;
}

// ---------------------------------------------------------------------------
// Parse population data from the pop_data JS variable
// ---------------------------------------------------------------------------

/**
 * Extract graded population data from the page's `pop_data` JS variable.
 * PriceCharting embeds this as: `pop_data = {"cgc":[0,0,1,...],"psa":[18,18,31,...]}`
 * where each array is grades 1–10 (index 0 = grade 1, index 9 = grade 10).
 */
function parsePopData(html: string): { psa: PopDistribution | null; cgc: PopDistribution | null } {
	const match = html.match(/pop_data\s*=\s*(\{[^}]+\})/);
	if (!match) return { psa: null, cgc: null };

	try {
		const data = JSON.parse(match[1]) as Record<string, number[]>;

		function toDist(arr: number[] | undefined): PopDistribution | null {
			if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
			const total = arr.reduce((sum, n) => sum + n, 0);
			if (total === 0) return null;
			const grade10 = arr[arr.length - 1] ?? 0;
			return {
				grades: arr,
				total,
				grade10,
				gemRate: total > 0 ? Math.round((grade10 / total) * 10000) / 100 : 0
			};
		}

		return {
			psa: toDist(data.psa),
			cgc: toDist(data.cgc)
		};
	} catch {
		return { psa: null, cgc: null };
	}
}

/**
 * Extract the most recent PSA 10 sale date from the completed-auctions
 * section. PriceCharting wraps the PSA 10 sold-comps table in a div with
 * class `completed-auctions-manual-only` and renders rows sorted newest
 * first, each with `<td class="date">YYYY-MM-DD</td>`.
 */
function parsePsa10LastSold(html: string): string | null {
	const section = html.match(
		/<div class="completed-auctions-manual-only">([\s\S]*?)<\/div>\s*<div class="/i
	);
	const scope = section ? section[1] : html;
	const first = scope.match(/<td class="date">(\d{4}-\d{2}-\d{2})<\/td>/);
	return first ? first[1] : null;
}

/**
 * Map the raw tiers dict into the structured PriceChartingData fields.
 */
function mapTiers(tiers: Record<string, number>): Pick<PriceChartingData, 'ungraded' | 'psa10' | 'cgc10' | 'bgs10' | 'tag10'> {
	// Normalise keys for lookup: lowercase, collapse spaces
	const norm = new Map<string, number>();
	for (const [k, v] of Object.entries(tiers)) {
		norm.set(k.toLowerCase().replace(/\s+/g, ' ').trim(), v);
	}

	const find = (...keys: string[]): number | null => {
		for (const k of keys) {
			const v = norm.get(k);
			if (v != null) return v;
		}
		return null;
	};

	return {
		ungraded: find('ungraded', 'loose', 'used'),
		psa10: find('psa 10'),
		cgc10: find('cgc 10', 'cgc 10 pristine'),
		bgs10: find('bgs 10', 'bgs 10 black'),
		tag10: find('tag 10')
	};
}

// ---------------------------------------------------------------------------
// Main public function
// ---------------------------------------------------------------------------

/**
 * Fetch PriceCharting data for a Pokemon card.
 *
 * @param opts.name    Card name (e.g. "Charizard")
 * @param opts.setName Set name (e.g. "Base Set") — improves match accuracy
 * @param opts.cardNumber Card number in set (e.g. "4") — tiebreaker
 * @returns Price data or null if no match found
 */
export async function fetchPriceCharting(opts: {
	name: string;
	setName?: string;
	cardNumber?: string;
}): Promise<PriceChartingData | null> {
	try {
		// Build a search query combining name and set
		const queryParts = [opts.name];
		if (opts.setName) queryParts.push(opts.setName);
		const query = queryParts.join(' ');

		const results = await searchProducts(query);
		if (results.length === 0) return null;

		const best = pickBestResult(results, opts.name, opts.setName, opts.cardNumber);
		if (!best) return null;

		// Polite delay before fetching the product page
		await delay(300);

		const productHtml = await fetchPage(best.url);
		if (!productHtml) return null;

		const tiers = parsePriceTiers(productHtml);
		if (Object.keys(tiers).length === 0) return null;

		const mapped = mapTiers(tiers);
		const popData = parsePopData(productHtml);
		const psa10LastSold = parsePsa10LastSold(productHtml);

		return {
			...mapped,
			allTiers: tiers,
			psaPop: popData.psa,
			cgcPop: popData.cgc,
			psa10LastSold,
			pcUrl: best.url,
			matchedName: best.name
		};
	} catch {
		return null;
	}
}
