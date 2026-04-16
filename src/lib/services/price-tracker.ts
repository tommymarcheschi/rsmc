/**
 * PokemonPriceTracker API — Grading intelligence
 * Docs: https://pokemonpricetracker.com/api
 *
 * Provides: PSA/CGC/BGS grade 1-10 prices, grading ROI calculator,
 * population reports, 1+ year historical price data
 */

import * as apiMonitor from './api-monitor';
import { supabase } from './supabase';

const BASE_URL = 'https://pokemonpricetracker.com/api/v1';
const SERVICE = 'price-tracker';

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
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	try {
		if (typeof window === 'undefined') {
			const key = process.env.PRICE_TRACKER_API_KEY ?? '';
			if (key) {
				(headers as Record<string, string>)['X-API-Key'] = key;
			}
		}
	} catch {
		// ignore — env not available
	}
	return headers;
}

async function fetchPriceTracker(endpoint: string): Promise<Response> {
	try {
		const res = await fetch(`${BASE_URL}${endpoint}`, { headers: getHeaders() });
		apiMonitor.record(SERVICE, res);
		return res;
	} catch (err) {
		apiMonitor.recordError(SERVICE, err);
		throw err;
	}
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

// Grading fees are sourced from the Supabase `grading_fee_schedules` table
// (migration 006). The table is the authoritative source — each row carries
// the grader's published cost + declared-value ceiling, so
// resolveGradingCost() in grading-roi.ts can escalate tiers for high-value
// cards. The hardcoded fallback below is a last resort when the query fails
// and matches the seeded rows' shape.
export async function getGradingFees(): Promise<GradingFees[]> {
	try {
		const { data, error } = await supabase
			.from('grading_fee_schedules')
			.select('service, tier_name, cost_cents, max_value_cents, turnaround_days, sort_order')
			.eq('active', true)
			.order('service', { ascending: true })
			.order('sort_order', { ascending: true });

		if (error || !data || data.length === 0) return getFallbackGradingFees();
		return groupFeeRows(data);
	} catch {
		return getFallbackGradingFees();
	}
}

interface FeeRow {
	service: string;
	tier_name: string;
	cost_cents: number;
	max_value_cents: number | null;
	turnaround_days: number | null;
	sort_order: number;
}

function groupFeeRows(rows: FeeRow[]): GradingFees[] {
	const byService = new Map<string, GradingFees>();
	for (const r of rows) {
		let svc = byService.get(r.service);
		if (!svc) {
			svc = { service: r.service, tiers: [] };
			byService.set(r.service, svc);
		}
		svc.tiers.push({
			name: r.tier_name,
			cost: r.cost_cents / 100,
			turnaround_days: r.turnaround_days ?? 0,
			max_value: r.max_value_cents != null ? r.max_value_cents / 100 : undefined
		});
	}
	return Array.from(byService.values());
}

// Last-resort fallback. Values intentionally mirror migration 006's seeds
// so behavior is continuous if the DB read fails.
function getFallbackGradingFees(): GradingFees[] {
	return [
		{
			service: 'PSA',
			tiers: [
				{ name: 'Value', cost: 25.99, turnaround_days: 65, max_value: 499 },
				{ name: 'Regular', cost: 49.99, turnaround_days: 45, max_value: 1499 },
				{ name: 'Express', cost: 100, turnaround_days: 20, max_value: 2499 },
				{ name: 'Super Express', cost: 200, turnaround_days: 10, max_value: 4999 },
				{ name: 'Walk-Through', cost: 400, turnaround_days: 5, max_value: 9999 },
				{ name: 'Premium 1', cost: 600, turnaround_days: 5, max_value: 14999 },
				{ name: 'Premium 3', cost: 1500, turnaround_days: 3, max_value: 49999 },
				{ name: 'Premium 5', cost: 3000, turnaround_days: 3, max_value: 99999 },
				{ name: 'Premium 10', cost: 5000, turnaround_days: 3 }
			]
		},
		{
			service: 'CGC',
			tiers: [
				{ name: 'Economy', cost: 18, turnaround_days: 40, max_value: 200 },
				{ name: 'Standard', cost: 30, turnaround_days: 20, max_value: 400 },
				{ name: 'Express', cost: 60, turnaround_days: 10, max_value: 1000 },
				{ name: 'Premium', cost: 125, turnaround_days: 5, max_value: 2500 },
				{ name: 'Elite', cost: 250, turnaround_days: 3, max_value: 10000 },
				{ name: 'Elite Plus', cost: 400, turnaround_days: 3 }
			]
		},
		{
			service: 'BGS',
			tiers: [
				{ name: 'Economy', cost: 20, turnaround_days: 60, max_value: 500 },
				{ name: 'Standard', cost: 35, turnaround_days: 30, max_value: 1500 },
				{ name: 'Express', cost: 100, turnaround_days: 10, max_value: 2500 },
				{ name: 'Premium', cost: 250, turnaround_days: 5, max_value: 10000 },
				{ name: 'Premium Plus', cost: 500, turnaround_days: 5 }
			]
		},
		{
			service: 'SGC',
			tiers: [
				{ name: 'Standard', cost: 30, turnaround_days: 20, max_value: 1500 },
				{ name: 'Express', cost: 50, turnaround_days: 10, max_value: 2500 },
				{ name: 'Premium', cost: 100, turnaround_days: 5, max_value: 5000 },
				{ name: 'Walk-Through', cost: 250, turnaround_days: 2 }
			]
		}
	];
}
