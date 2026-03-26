/**
 * eBay Sold Listings Scraper for Pokemon TCG cards
 *
 * Scrapes eBay's completed/sold listings search results
 * to extract recent sale prices for price comparison.
 */

const EBAY_SEARCH_URL = 'https://www.ebay.com/sch/i.html';
const POKEMON_TCG_CATEGORY = '183454';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Words that indicate a listing is a lot/bundle rather than a single card */
const BUNDLE_KEYWORDS = [
	'lot',
	'bundle',
	'x4',
	'x3',
	'x2',
	'playset',
	'set of',
	'collection',
	'bulk'
];

export interface EbaySoldListing {
	title: string;
	soldPrice: number;
	soldDate: string;
	imageUrl: string;
	listingUrl: string;
	shippingCost: number | null;
	totalPrice: number;
}

export interface EbaySoldResult {
	query: string;
	listings: EbaySoldListing[];
	averagePrice: number;
	medianPrice: number;
	lowPrice: number;
	highPrice: number;
	totalSold: number;
}

function emptyResult(query: string): EbaySoldResult {
	return {
		query,
		listings: [],
		averagePrice: 0,
		medianPrice: 0,
		lowPrice: 0,
		highPrice: 0,
		totalSold: 0
	};
}

/**
 * Parse a price string into a number. Returns null for non-USD prices.
 * Handles: "$12.99", "$1,234.56", "C $15.00" (rejected), "GBP 10.00" (rejected)
 */
function parsePrice(raw: string): number | null {
	const trimmed = raw.trim();

	// Reject non-USD currencies: "C $", "AU $", "GBP", "EUR", etc.
	if (/^[A-Z]{1,3}\s*\$/.test(trimmed) || /^(GBP|EUR|CAD|AUD|JPY)/i.test(trimmed)) {
		return null;
	}

	// Extract numeric value — match digits, commas, and decimal point after a $ sign
	const match = trimmed.match(/\$\s*([\d,]+\.?\d*)/);
	if (!match) return null;

	const value = parseFloat(match[1].replace(/,/g, ''));
	return isNaN(value) ? null : value;
}

/**
 * Check if a title indicates a lot/bundle rather than a single card.
 */
function isBundleListing(title: string): boolean {
	const lower = title.toLowerCase();
	return BUNDLE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Extract text content from an HTML string, stripping all tags.
 */
function stripHtml(html: string): string {
	return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Extract a substring between two markers in an HTML string.
 */
function extractBetween(html: string, start: string, end: string): string | null {
	const startIdx = html.indexOf(start);
	if (startIdx === -1) return null;
	const afterStart = startIdx + start.length;
	const endIdx = html.indexOf(end, afterStart);
	if (endIdx === -1) return null;
	return html.substring(afterStart, endIdx);
}

/**
 * Parse individual listing items from the eBay search results HTML.
 */
function parseListings(html: string): EbaySoldListing[] {
	const listings: EbaySoldListing[] = [];

	// Split on each s-item list element
	const items = html.split('<li class="s-item');

	for (const item of items) {
		try {
			// Skip the first split chunk (before any item) and the "results header" item
			if (!item.includes('s-item__title') || !item.includes('s-item__price')) {
				continue;
			}

			// Extract title
			const titleBlock = extractBetween(item, 's-item__title"', '</span>');
			if (!titleBlock) continue;
			// The title may be wrapped in another span
			const title = stripHtml(titleBlock).replace(/^[\s>]+/, '');
			if (!title || title === 'Shop on eBay' || title === 'Results matching fewer words') {
				continue;
			}

			// Skip bundles/lots
			if (isBundleListing(title)) continue;

			// Extract sold price
			const priceBlock = extractBetween(item, 's-item__price"', '</span>');
			if (!priceBlock) continue;
			const priceText = stripHtml(priceBlock);
			const soldPrice = parsePrice(priceText);
			if (soldPrice === null) continue;

			// Extract sold date (from POSITIVE or title--tag spans containing "Sold")
			let soldDate = '';
			const soldTagMatch = item.match(/(?:s-item__title--tag|s-item__ended-date|POSITIVE)[^>]*>([^<]*Sold[^<]*)/i);
			if (soldTagMatch) {
				soldDate = soldTagMatch[1]
					.replace(/Sold\s*/i, '')
					.trim();
			}
			// Also try the endedDate or caption area
			if (!soldDate) {
				const endedMatch = item.match(/Sold\s+([\w]{3}\s+\d{1,2},?\s*\d{4})/i);
				if (endedMatch) {
					soldDate = endedMatch[1].trim();
				}
			}

			// Extract image URL
			let imageUrl = '';
			const imgMatch = item.match(/s-item__image-wrapper[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
			if (imgMatch) {
				imageUrl = imgMatch[1];
			}
			// Fallback: look for any img src in the item
			if (!imageUrl) {
				const fallbackImg = item.match(/<img[^>]+src="(https:\/\/i\.ebayimg\.com[^"]+)"/);
				if (fallbackImg) {
					imageUrl = fallbackImg[1];
				}
			}

			// Extract listing URL
			let listingUrl = '';
			const linkMatch = item.match(/s-item__link"?\s+href="([^"]+)"/);
			if (linkMatch) {
				listingUrl = linkMatch[1];
			}
			// Fallback
			if (!listingUrl) {
				const fallbackLink = item.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
				if (fallbackLink) {
					listingUrl = fallbackLink[1];
				}
			}

			// Extract shipping cost
			let shippingCost: number | null = null;
			const shippingMatch = item.match(/s-item__shipping[^>]*>([^<]+)/);
			if (shippingMatch) {
				const shippingText = shippingMatch[1].trim();
				if (/free/i.test(shippingText)) {
					shippingCost = 0;
				} else {
					const parsedShipping = parsePrice(shippingText);
					if (parsedShipping !== null) {
						shippingCost = parsedShipping;
					}
				}
			}

			const totalPrice = soldPrice + (shippingCost ?? 0);

			listings.push({
				title,
				soldPrice,
				soldDate,
				imageUrl,
				listingUrl,
				shippingCost,
				totalPrice
			});
		} catch {
			// Skip any listing that fails to parse
			continue;
		}
	}

	return listings;
}

/**
 * Calculate price statistics from a list of sold listings.
 */
function calculateStats(listings: EbaySoldListing[]): {
	averagePrice: number;
	medianPrice: number;
	lowPrice: number;
	highPrice: number;
} {
	if (listings.length === 0) {
		return { averagePrice: 0, medianPrice: 0, lowPrice: 0, highPrice: 0 };
	}

	const prices = listings.map((l) => l.totalPrice).sort((a, b) => a - b);

	const sum = prices.reduce((acc, p) => acc + p, 0);
	const averagePrice = Math.round((sum / prices.length) * 100) / 100;

	const mid = Math.floor(prices.length / 2);
	const medianPrice =
		prices.length % 2 === 0
			? Math.round(((prices[mid - 1] + prices[mid]) / 2) * 100) / 100
			: prices[mid];

	const lowPrice = prices[0];
	const highPrice = prices[prices.length - 1];

	return { averagePrice, medianPrice, lowPrice, highPrice };
}

/**
 * Search eBay sold/completed listings for a Pokemon card.
 *
 * @param cardName - The name of the card to search for
 * @param setName - Optional set name to narrow the search
 * @param limit - Maximum number of listings to return (default 20)
 */
export async function searchEbaySold(
	cardName: string,
	setName?: string,
	limit: number = 20
): Promise<EbaySoldResult> {
	const query = setName ? `${cardName} ${setName}` : cardName;

	try {
		const params = new URLSearchParams({
			_nkw: query,
			LH_Complete: '1',
			LH_Sold: '1',
			_sacat: POKEMON_TCG_CATEGORY,
			_sop: '13',
			rt: 'nc'
		});

		const url = `${EBAY_SEARCH_URL}?${params.toString()}`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5',
				'Accept-Encoding': 'gzip, deflate, br',
				Connection: 'keep-alive',
				'Upgrade-Insecure-Requests': '1'
			}
		});

		if (!response.ok) {
			console.error(`eBay scraper: HTTP ${response.status} for query "${query}"`);
			return emptyResult(query);
		}

		const html = await response.text();
		const allListings = parseListings(html);
		const listings = allListings.slice(0, limit);
		const stats = calculateStats(listings);

		return {
			query,
			listings,
			...stats,
			totalSold: listings.length
		};
	} catch (error) {
		console.error('eBay scraper error:', error);
		return emptyResult(query);
	}
}
