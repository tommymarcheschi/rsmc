/**
 * Grading ROI — real-data profit math
 *
 * Single source of truth for the grading decision. Takes a `card_index` row
 * plus a service/tier choice and returns the expected realistic and
 * optimistic profits, the break-even gem rate, and a confidence flag.
 *
 * The "premium" number here mirrors the stored generated column
 * `card_index.grading_roi_premium` — the SQL column exists so
 * /browse?mode=hunt can ORDER BY it without calling TypeScript. Anywhere
 * else we compute profit we go through this helper so service switching
 * stays consistent (and honest — no multiplier fallbacks).
 *
 * Formula:
 *   premium         = (psa_gem_rate / 100) × (psa10 − raw)
 *   realistic_roi   = premium − grading_cost
 *   optimistic_roi  = (psa10 − raw) − grading_cost       // if it hits 10
 *   break_even_rate = grading_cost / (psa10 − raw) × 100 // gem rate needed
 *
 * Assumption: non-10 grades recoup raw value at resale. We don't have
 * sub-10 prices stored in `card_index` — PriceCharting returns them in
 * `allTiers` but the enricher only persists `psa10_price` / `tag10_price`.
 * This assumption is surfaced to the user in the explanation panel, not
 * hidden.
 */

import type { GradingService } from '$types';
import type { GradingFees } from './price-tracker';

// Minimum PSA-graded sample size for a "confident" gem rate. Below this the
// rate is noise (e.g. 1 of 3 = 33% gem rate looks identical in the UI to
// 300 of 900). We don't hide these rows — we flag them.
export const GEM_RATE_MIN_SAMPLE = 20;

// Default tier per service — cheapest available, per user directive.
// Names match the `tier_name` column in migration 006's grading_fee_schedules
// seed rows. Note: PSA's cheapest individual tier is "Value" (renamed from
// the pre-2023 "Economy"); SGC has no "Economy" tier — "Standard" is the
// cheapest. resolveGradingCost() falls back to the first tier in the list
// if the name doesn't match, so misses here degrade to cheapest-available.
export const DEFAULT_TIER_BY_SERVICE: Record<GradingService, string> = {
	PSA: 'Value',
	CGC: 'Economy',
	BGS: 'Economy',
	SGC: 'Standard'
};

export interface GradingROIInput {
	raw_nm_price: number | null;
	psa10_price: number | null;
	psa_gem_rate: number | null; // percentage 0–100
	psa_pop_total: number | null;
}

export interface GradingROIResult {
	/** Service-independent expected PSA 10 premium. Mirrors SQL column. */
	premium: number | null;
	gradingCost: number;
	/** premium − gradingCost */
	realisticProfit: number | null;
	/** (psa10 − raw) − gradingCost (if it hits 10) */
	optimisticProfit: number | null;
	/** Gem rate needed to break even, 0–100 scale. Null if delta ≤ 0. */
	breakEvenGemRate: number | null;
	/** True when we have enough PSA pop to trust the gem rate. */
	confident: boolean;
	/** Fee tier that was actually used (after value escalation). */
	resolvedTier: {
		name: string;
		cost: number;
		turnaroundDays: number;
	} | null;
}

/**
 * Resolve the effective grading cost for a card given the user's service+tier
 * preference. If the card's PSA 10 value exceeds the tier's `max_value`
 * ceiling, we escalate to the next tier up (PSA's value-based fee tiers).
 * This keeps the quoted cost realistic for high-value cards.
 */
export function resolveGradingCost(
	service: GradingService,
	tierName: string,
	psa10Price: number | null,
	fees: GradingFees[]
): { name: string; cost: number; turnaroundDays: number } | null {
	const svc = fees.find((f) => f.service === service);
	if (!svc) return null;

	const matchesName = (name: string) =>
		name.toLowerCase() === tierName.toLowerCase();

	let tier = svc.tiers.find((t) => matchesName(t.name));
	if (!tier) tier = svc.tiers[0];
	if (!tier) return null;

	// Value escalation: if the card's PSA 10 price exceeds max_value, climb
	// until we find a tier that covers it. Tiers in getDefaultGradingFees()
	// are listed cheapest-first, so forward iteration is correct.
	if (psa10Price != null && tier.max_value != null && psa10Price > tier.max_value) {
		const idx = svc.tiers.indexOf(tier);
		for (let i = idx + 1; i < svc.tiers.length; i++) {
			const next = svc.tiers[i];
			if (next.max_value == null || psa10Price <= next.max_value) {
				tier = next;
				break;
			}
			tier = next;
		}
	}

	return {
		name: tier.name,
		cost: tier.cost,
		turnaroundDays: tier.turnaround_days
	};
}

export function computeGradingROI(
	row: GradingROIInput,
	service: GradingService,
	tierName: string,
	fees: GradingFees[]
): GradingROIResult {
	const resolved = resolveGradingCost(service, tierName, row.psa10_price, fees);
	const gradingCost = resolved?.cost ?? 0;

	const hasCore =
		row.raw_nm_price != null && row.psa10_price != null && row.psa_gem_rate != null;

	const delta =
		row.psa10_price != null && row.raw_nm_price != null
			? row.psa10_price - row.raw_nm_price
			: null;

	const premium =
		hasCore && delta != null
			? round2((row.psa_gem_rate as number / 100) * delta)
			: null;

	const realisticProfit = premium != null ? round2(premium - gradingCost) : null;
	const optimisticProfit = delta != null ? round2(delta - gradingCost) : null;

	const breakEvenGemRate =
		delta != null && delta > 0 ? round2((gradingCost / delta) * 100) : null;

	const confident =
		row.psa_pop_total != null &&
		row.psa_pop_total >= GEM_RATE_MIN_SAMPLE &&
		row.psa_gem_rate != null;

	return {
		premium,
		gradingCost,
		realisticProfit,
		optimisticProfit,
		breakEvenGemRate,
		confident,
		resolvedTier: resolved
	};
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
