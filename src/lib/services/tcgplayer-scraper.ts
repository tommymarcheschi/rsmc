/**
 * TCGPlayer Recent Sales Scraper
 *
 * Scrapes pricing data and recent sales from TCGPlayer product pages.
 * Uses HTML parsing with regex/string methods (no external DOM parser).
 * Graceful degradation: returns null on any failure, never throws.
 */

export interface TCGPlayerSale {
	date: string;
	price: number;
	condition: string;
	quantity: number;
	variant: string; // "Holofoil", "Normal", "Reverse Holofoil"
}

export interface TCGPlayerPriceData {
	productUrl: string;
	productName: string;
	setName: string;
	marketPrice: number | null;
	lowPrice: number | null;
	midPrice: number | null;
	highPrice: number | null;
	recentSales: TCGPlayerSale[];
	lastUpdated: string;
	priceHistory: { date: string; price: number }[];
}

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_HEADERS: HeadersInit = {
	'User-Agent': USER_AGENT,
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'no-cache'
};

/** Simple rate-limit: track last request time */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1500;

async function rateLimitedFetch(url: string): Promise<Response | null> {
	const now = Date.now();
	const elapsed = now - lastRequestTime;
	if (elapsed < MIN_REQUEST_INTERVAL_MS) {
		await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
	}
	lastRequestTime = Date.now();

	const response = await fetch(url, {
		headers: FETCH_HEADERS,
		redirect: 'follow'
	});

	if (!response.ok) return null;
	return response;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

function extractJsonLd(html: string): Record<string, unknown> | null {
	const pattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(html)) !== null) {
		try {
			const data = JSON.parse(match[1]);
			// Product schema contains pricing info
			if (data['@type'] === 'Product' || data?.['@type'] === 'IndividualProduct') {
				return data as Record<string, unknown>;
			}
		} catch {
			// Malformed JSON-LD, skip
		}
	}
	return null;
}

function extractMetaContent(html: string, property: string): string | null {
	const pattern = new RegExp(
		`<meta[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
		'i'
	);
	const match = pattern.exec(html);
	if (match) return match[1];

	// Try reversed attribute order
	const altPattern = new RegExp(
		`<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`,
		'i'
	);
	const altMatch = altPattern.exec(html);
	return altMatch ? altMatch[1] : null;
}

function parsePrice(text: string): number | null {
	const cleaned = text.replace(/[^0-9.]/g, '');
	const value = parseFloat(cleaned);
	return isNaN(value) ? null : value;
}

function extractPriceFromLabel(html: string, label: string): number | null {
	// Look for patterns like "Market Price: $12.34" or data attributes near the label
	const patterns = [
		new RegExp(`${label}[^<]*?\\$([0-9]+\\.?[0-9]*)`, 'i'),
		new RegExp(`${label}[\\s\\S]{0,200}?\\$([0-9]+\\.?[0-9]*)`, 'i'),
		new RegExp(
			`data-testid=["']${label.toLowerCase().replace(/\s+/g, '-')}["'][^>]*>[^$]*\\$([0-9]+\\.?[0-9]*)`,
			'i'
		)
	];
	for (const pattern of patterns) {
		const match = pattern.exec(html);
		if (match) return parsePrice(match[1]);
	}
	return null;
}

function extractProductName(html: string): string {
	// Try og:title first, then <title>
	const ogTitle = extractMetaContent(html, 'og:title');
	if (ogTitle) return ogTitle.replace(/\s*[-|].*TCGplayer.*$/i, '').trim();

	const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
	if (titleMatch) return titleMatch[1].replace(/\s*[-|].*TCGplayer.*$/i, '').trim();

	return '';
}

function extractSetName(html: string): string {
	// Look for set name in breadcrumbs or structured data
	const breadcrumbPattern =
		/class=["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i;
	const breadcrumbMatch = breadcrumbPattern.exec(html);
	if (breadcrumbMatch) return breadcrumbMatch[2].trim();

	// Try the product-details or set-name area
	const setPattern = /class=["'][^"']*set-name[^"']*["'][^>]*>([^<]+)/i;
	const setMatch = setPattern.exec(html);
	if (setMatch) return setMatch[1].trim();

	return '';
}

function extractRecentSales(html: string): TCGPlayerSale[] {
	const sales: TCGPlayerSale[] = [];

	// TCGPlayer renders recent sales in a table/list structure
	// Look for sale row patterns with date, price, condition, quantity
	const saleRowPattern =
		/class=["'][^"']*(?:sale-row|recent-sale|last-sold)[^"']*["'][^>]*>([\s\S]*?)(?:<\/(?:tr|div|li)>)/gi;
	let rowMatch: RegExpExecArray | null;

	while ((rowMatch = saleRowPattern.exec(html)) !== null) {
		const rowHtml = rowMatch[1];

		const dateMatch = /(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(rowHtml);
		const priceMatch = /\$([0-9]+\.?[0-9]*)/i.exec(rowHtml);
		const conditionMatch =
			/(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged)/i.exec(rowHtml);
		const quantityMatch = /(\d+)\s*(?:qty|quantity|x\b)/i.exec(rowHtml);
		const variantMatch = /(Holofoil|Reverse Holofoil|Normal|1st Edition)/i.exec(rowHtml);

		if (priceMatch) {
			sales.push({
				date: dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0],
				price: parseFloat(priceMatch[1]),
				condition: conditionMatch ? conditionMatch[1] : 'Near Mint',
				quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 1,
				variant: variantMatch ? variantMatch[1] : 'Normal'
			});
		}
	}

	// Alternative: look for __NEXT_DATA__ or embedded JSON with sales data
	if (sales.length === 0) {
		const nextDataMatch = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
			html
		);
		if (nextDataMatch) {
			try {
				const nextData = JSON.parse(nextDataMatch[1]);
				const salesData = findNestedKey(nextData, 'recentSales') ?? findNestedKey(nextData, 'lastSoldListings');
				if (Array.isArray(salesData)) {
					for (const entry of salesData) {
						sales.push({
							date: entry.orderDate ?? entry.date ?? new Date().toISOString().split('T')[0],
							price: typeof entry.purchasePrice === 'number' ? entry.purchasePrice : (parseFloat(entry.price) || 0),
							condition: entry.condition ?? 'Near Mint',
							quantity: entry.quantity ?? 1,
							variant: entry.variant ?? entry.printing ?? 'Normal'
						});
					}
				}
			} catch {
				// Malformed JSON, skip
			}
		}
	}

	return sales;
}

function extractPriceHistory(html: string): { date: string; price: number }[] {
	const history: { date: string; price: number }[] = [];

	// TCGPlayer embeds chart data in script tags (often via __NEXT_DATA__ or inline JSON)
	const nextDataMatch = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
		html
	);
	if (nextDataMatch) {
		try {
			const nextData = JSON.parse(nextDataMatch[1]);
			const chartData = findNestedKey(nextData, 'priceHistory') ?? findNestedKey(nextData, 'chartData');
			if (Array.isArray(chartData)) {
				for (const point of chartData) {
					const date = point.date ?? point.x ?? point.timestamp;
					const price = point.price ?? point.y ?? point.value;
					if (date && typeof price === 'number') {
						history.push({ date: String(date), price });
					}
				}
			}
		} catch {
			// Ignore parse errors
		}
	}

	// Look for inline chart JSON patterns
	const chartPattern = /(?:priceHistory|chartData|historicalPrices)\s*[=:]\s*(\[[\s\S]*?\]);/i;
	const chartMatch = chartPattern.exec(html);
	if (chartMatch && history.length === 0) {
		try {
			const data = JSON.parse(chartMatch[1]);
			if (Array.isArray(data)) {
				for (const point of data) {
					const date = point.date ?? point.x ?? point.timestamp;
					const price = point.price ?? point.y ?? point.value;
					if (date && typeof price === 'number') {
						history.push({ date: String(date), price });
					}
				}
			}
		} catch {
			// Malformed chart data, skip
		}
	}

	return history;
}

/** Recursively find a key in a nested object */
function findNestedKey(obj: unknown, key: string): unknown {
	if (obj === null || obj === undefined || typeof obj !== 'object') return undefined;
	if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
	for (const v of Object.values(obj as Record<string, unknown>)) {
		const result = findNestedKey(v, key);
		if (result !== undefined) return result;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape TCGPlayer product page for pricing data and recent sales.
 * Returns null on any failure.
 */
export async function scrapeTCGPlayerPrices(
	tcgplayerUrl: string
): Promise<TCGPlayerPriceData | null> {
	try {
		const response = await rateLimitedFetch(tcgplayerUrl);
		if (!response) return null;

		const html = await response.text();

		// Extract structured data from JSON-LD
		const jsonLd = extractJsonLd(html);

		// Build pricing from multiple sources
		let marketPrice: number | null = null;
		let lowPrice: number | null = null;
		let midPrice: number | null = null;
		let highPrice: number | null = null;

		// Source 1: JSON-LD offers
		if (jsonLd) {
			const offers = jsonLd['offers'] as Record<string, unknown> | undefined;
			if (offers) {
				if (offers['lowPrice']) lowPrice = parsePrice(String(offers['lowPrice']));
				if (offers['highPrice']) highPrice = parsePrice(String(offers['highPrice']));
				if (offers['price']) marketPrice = parsePrice(String(offers['price']));
			}
		}

		// Source 2: Meta tags
		const ogPrice = extractMetaContent(html, 'product:price:amount');
		if (ogPrice && !marketPrice) marketPrice = parsePrice(ogPrice);

		// Source 3: HTML content with labeled prices
		if (!marketPrice) marketPrice = extractPriceFromLabel(html, 'Market Price');
		if (!lowPrice) lowPrice = extractPriceFromLabel(html, 'Low');
		if (!midPrice) midPrice = extractPriceFromLabel(html, 'Mid');
		if (!highPrice) highPrice = extractPriceFromLabel(html, 'High');

		// Source 4: __NEXT_DATA__ pricing
		const nextDataMatch = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
			html
		);
		if (nextDataMatch) {
			try {
				const nextData = JSON.parse(nextDataMatch[1]);
				const priceData =
					(findNestedKey(nextData, 'marketPrice') as number) ?? null;
				if (priceData && !marketPrice) marketPrice = priceData;

				const low = findNestedKey(nextData, 'lowPrice') as number | undefined;
				if (low && !lowPrice) lowPrice = low;

				const mid = findNestedKey(nextData, 'midPrice') as number | undefined;
				if (mid && !midPrice) midPrice = mid;

				const high = findNestedKey(nextData, 'highPrice') as number | undefined;
				if (high && !highPrice) highPrice = high;
			} catch {
				// Ignore
			}
		}

		const productName = extractProductName(html);
		const setName =
			extractSetName(html) ||
			(jsonLd?.['brand'] as Record<string, unknown>)?.['name']?.toString() ||
			'';

		return {
			productUrl: tcgplayerUrl,
			productName,
			setName,
			marketPrice,
			lowPrice,
			midPrice,
			highPrice,
			recentSales: extractRecentSales(html),
			lastUpdated: new Date().toISOString(),
			priceHistory: extractPriceHistory(html)
		};
	} catch {
		return null;
	}
}

/**
 * Build a TCGPlayer search URL from a card name and optional set name.
 */
export function buildTCGPlayerUrl(cardName: string, setName: string): string {
	const setSlug = setName
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	const encodedName = encodeURIComponent(cardName);
	return `https://www.tcgplayer.com/search/pokemon/${setSlug}?q=${encodedName}`;
}

/**
 * Search TCGPlayer for a card and scrape the first matching product page.
 * Returns null if no results found or on failure.
 */
export async function scrapeTCGPlayerSearch(
	cardName: string,
	setName?: string
): Promise<TCGPlayerPriceData | null> {
	try {
		const searchUrl = setName
			? buildTCGPlayerUrl(cardName, setName)
			: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(cardName)}`;

		const response = await rateLimitedFetch(searchUrl);
		if (!response) return null;

		const html = await response.text();

		// Extract the first product link from search results
		const productLinkPattern =
			/href=["'](\/product\/\d+\/[^"'?#]+)["']/i;
		const match = productLinkPattern.exec(html);
		if (!match) return null;

		const productUrl = `https://www.tcgplayer.com${match[1]}`;
		return scrapeTCGPlayerPrices(productUrl);
	} catch {
		return null;
	}
}
