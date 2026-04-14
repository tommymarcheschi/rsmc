/**
 * PokeTrace API — Multi-marketplace pricing
 * Docs: https://api.poketrace.com
 *
 * Provides: TCGPlayer + eBay + CardMarket prices in one call,
 * US vs EU arbitrage data, confidence scores
 */

import * as apiMonitor from './api-monitor';

const BASE_URL = 'https://api.poketrace.com/v1';
const SERVICE = 'poketrace';

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
	set_name: string;
	us_price: number;
	eu_price: number;
	eu_price_usd: number;
	savings_pct: number;
	image_url?: string;
}

export interface TrendingCard {
	card_id: string;
	card_name: string;
	set_name: string;
	current_price: number;
	previous_price: number;
	change_pct: number;
	volume: number;
	image_url?: string;
}

function getHeaders(): HeadersInit {
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	try {
		if (typeof window === 'undefined') {
			// Dynamic import to avoid client-side errors
			const key = process.env.POKETRACE_API_KEY ?? '';
			if (key) {
				(headers as Record<string, string>)['X-API-Key'] = key;
			}
		}
	} catch {
		// ignore — env not available
	}
	return headers;
}

async function fetchPokeTrace(endpoint: string): Promise<Response> {
	try {
		const res = await fetch(`${BASE_URL}${endpoint}`, { headers: getHeaders() });
		apiMonitor.record(SERVICE, res);
		return res;
	} catch (err) {
		apiMonitor.recordError(SERVICE, err);
		throw err;
	}
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
	minSavings = 10,
	limit = 20
): Promise<ArbitrageOpportunity[]> {
	try {
		const res = await fetchPokeTrace(`/arbitrage?min_savings=${minSavings}&limit=${limit}`);
		if (!res.ok) return [];
		const json = await res.json();
		return json.data ?? [];
	} catch {
		return [];
	}
}

export async function getTrendingCards(
	period = '7d',
	limit = 20
): Promise<TrendingCard[]> {
	try {
		const res = await fetchPokeTrace(`/trending?period=${period}&limit=${limit}`);
		if (!res.ok) return [];
		const json = await res.json();
		return json.data ?? [];
	} catch {
		return [];
	}
}

export async function getBiggestMovers(
	direction: 'up' | 'down' = 'up',
	limit = 10
): Promise<TrendingCard[]> {
	try {
		const res = await fetchPokeTrace(`/movers?direction=${direction}&limit=${limit}`);
		if (!res.ok) return [];
		const json = await res.json();
		return json.data ?? [];
	} catch {
		return [];
	}
}
