/**
 * PokeTrace API — Multi-marketplace pricing
 * Docs: https://api.poketrace.com
 *
 * Provides: TCGPlayer + eBay + CardMarket prices in one call,
 * US vs EU arbitrage data, confidence scores
 */

const BASE_URL = 'https://api.poketrace.com/v1';

export interface PokeTracePrice {
	card_id: string;
	tcgplayer?: MarketPrice;
	ebay?: MarketPrice;
	cardmarket?: MarketPrice;
	confidence: number;
	updated_at: string;
}

export interface MarketPrice {
	raw: {
		low?: number;
		mid?: number;
		high?: number;
		market?: number;
	};
	graded?: Record<string, number>;
	currency: string;
}

export interface ArbitrageOpportunity {
	card_id: string;
	card_name: string;
	us_price: number;
	eu_price: number;
	eu_price_usd: number;
	savings_pct: number;
}

async function fetchPokeTrace(endpoint: string): Promise<Response> {
	// API key will be added from env when available
	return fetch(`${BASE_URL}${endpoint}`, {
		headers: { 'Content-Type': 'application/json' }
	});
}

export async function getCardPrices(cardId: string): Promise<PokeTracePrice | null> {
	try {
		const res = await fetchPokeTrace(`/prices/${cardId}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

export async function getArbitrageOpportunities(
	minSavings = 10
): Promise<ArbitrageOpportunity[]> {
	try {
		const res = await fetchPokeTrace(`/arbitrage?min_savings=${minSavings}`);
		if (!res.ok) return [];
		const json = await res.json();
		return json.data ?? [];
	} catch {
		return [];
	}
}
