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

export interface GradingFees {
	service: string;
	tiers: {
		name: string;
		cost: number;
		turnaround_days: number;
		max_value?: number;
	}[];
}

function getHeaders(): HeadersInit {
	return { 'Content-Type': 'application/json' };
}

async function fetchPriceTracker(endpoint: string): Promise<Response> {
	return fetch(`${BASE_URL}${endpoint}`, { headers: getHeaders() });
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

export async function getGradingFees(): Promise<GradingFees[]> {
	try {
		const res = await fetchPriceTracker('/grading/fees');
		if (!res.ok) return getDefaultGradingFees();
		const json = await res.json();
		return json.data ?? getDefaultGradingFees();
	} catch {
		return getDefaultGradingFees();
	}
}

// Fallback data when API unavailable
function getDefaultGradingFees(): GradingFees[] {
	return [
		{
			service: 'PSA',
			tiers: [
				{ name: 'Economy', cost: 25, turnaround_days: 150 },
				{ name: 'Regular', cost: 50, turnaround_days: 65 },
				{ name: 'Express', cost: 100, turnaround_days: 20 },
				{ name: 'Super Express', cost: 200, turnaround_days: 10 }
			]
		},
		{
			service: 'CGC',
			tiers: [
				{ name: 'Economy', cost: 18, turnaround_days: 120 },
				{ name: 'Standard', cost: 30, turnaround_days: 50 },
				{ name: 'Express', cost: 65, turnaround_days: 15 },
				{ name: 'Walk-Through', cost: 150, turnaround_days: 2 }
			]
		},
		{
			service: 'BGS',
			tiers: [
				{ name: 'Economy', cost: 25, turnaround_days: 120 },
				{ name: 'Standard', cost: 50, turnaround_days: 50 },
				{ name: 'Express', cost: 100, turnaround_days: 10 },
				{ name: 'Premium', cost: 250, turnaround_days: 5 }
			]
		},
		{
			service: 'SGC',
			tiers: [
				{ name: 'Economy', cost: 15, turnaround_days: 90 },
				{ name: 'Regular', cost: 30, turnaround_days: 30 },
				{ name: 'Express', cost: 75, turnaround_days: 10 }
			]
		}
	];
}
