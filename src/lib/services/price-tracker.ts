/**
 * PokemonPriceTracker API — Grading intelligence
 * Docs: https://pokemonpricetracker.com/api
 *
 * Provides: PSA/CGC/BGS grade 1-10 prices, grading ROI calculator,
 * population reports, 1+ year historical price data
 */

const BASE_URL = 'https://pokemonpricetracker.com/api/v1';

export interface GradedPrice {
	grade: number;
	service: string;
	price: number;
	last_sold_date?: string;
	population?: number;
}

export interface PopulationReport {
	card_id: string;
	service: string;
	grades: Record<string, { population: number; price: number }>;
	total_graded: number;
}

export interface GradingROI {
	card_id: string;
	raw_value: number;
	grading_cost: number;
	expected_grade_distribution: Record<string, number>;
	expected_value: number;
	expected_profit: number;
	recommendation: 'grade' | 'sell_raw' | 'hold';
}

export interface PriceHistory {
	card_id: string;
	data_points: { date: string; price: number }[];
	period: string;
}

async function fetchPriceTracker(endpoint: string): Promise<Response> {
	return fetch(`${BASE_URL}${endpoint}`, {
		headers: { 'Content-Type': 'application/json' }
	});
}

export async function getGradedPrices(cardId: string): Promise<GradedPrice[]> {
	try {
		const res = await fetchPriceTracker(`/cards/${cardId}/graded-prices`);
		if (!res.ok) return [];
		const json = await res.json();
		return json.data ?? [];
	} catch {
		return [];
	}
}

export async function getPopulationReport(
	cardId: string,
	service = 'PSA'
): Promise<PopulationReport | null> {
	try {
		const res = await fetchPriceTracker(`/cards/${cardId}/population?service=${service}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

export async function getGradingROI(
	cardId: string,
	service = 'PSA',
	tier = 'regular'
): Promise<GradingROI | null> {
	try {
		const res = await fetchPriceTracker(
			`/cards/${cardId}/grading-roi?service=${service}&tier=${tier}`
		);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

export async function getPriceHistory(
	cardId: string,
	period = '1y'
): Promise<PriceHistory | null> {
	try {
		const res = await fetchPriceTracker(`/cards/${cardId}/price-history?period=${period}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}
