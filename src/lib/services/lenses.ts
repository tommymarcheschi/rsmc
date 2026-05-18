// Trove — Card Ranking lenses (north star pillar #9)
//
// Six independent 0–100 axis scores are percentile-ranked across the whole
// catalog by scripts/rank-cards.ts. A "lens" re-weights those same axes for
// a particular intent. Kept in $lib/services (not a route) so the nightly
// scoring script, the /rankings loader, and the page all share ONE source
// of truth for the weights and the composite math.
//
// Honesty doctrine: a missing axis is never imputed (no fabricated 50). It
// contributes ZERO to the composite, which is normalised by the lens's
// TOTAL weight — so a fully-scored card outranks a card we only know one
// thing about. Thin-data cards are still ranked and shown (with a
// low-confidence badge) and every axis is independently sortable, so
// "low pop" discovery is one click regardless of composite. Earlier design
// renormalised over present axes only; that made single-axis cards score
// 100 on every lens and the lenses stopped differentiating — rejected.

export type Axis =
	| 'value'
	| 'scarcity'
	| 'gem_difficulty'
	| 'momentum'
	| 'grade_roi'
	| 'liquidity';

export const AXES: { key: Axis; label: string; column: string; hint: string }[] = [
	{ key: 'value', label: 'Value', column: 'score_value', hint: 'How much the card is worth' },
	{ key: 'scarcity', label: 'Scarcity', column: 'score_scarcity', hint: 'Rarer = higher (inverse graded pop)' },
	{ key: 'gem_difficulty', label: 'Gem Difficulty', column: 'score_gem_difficulty', hint: 'Harder to pull a 10 = higher' },
	{ key: 'momentum', label: 'Momentum', column: 'score_momentum', hint: '30-day pop-growth rate' },
	{ key: 'grade_roi', label: 'Grade ROI', column: 'score_grade_roi', hint: 'Gem-rate-weighted PSA 10 premium' },
	{ key: 'liquidity', label: 'Liquidity', column: 'score_liquidity', hint: 'Recent PSA 10 sale activity' }
];

export type LensKey = 'investor' | 'collector' | 'flipper';

export interface Lens {
	key: LensKey;
	label: string;
	column: string;
	blurb: string;
	weights: Record<Axis, number>;
}

// Weights need not sum to 1 — the composite renormalises over the axes a
// card actually has. They express relative emphasis.
export const LENSES: Record<LensKey, Lens> = {
	investor: {
		key: 'investor',
		label: 'Investor',
		column: 'score_investor',
		blurb: 'Appreciation, grading ROI and momentum',
		weights: { value: 25, scarcity: 15, gem_difficulty: 10, momentum: 20, grade_roi: 20, liquidity: 10 }
	},
	collector: {
		key: 'collector',
		label: 'Collector',
		column: 'score_collector',
		blurb: 'Scarce, hard-to-gem, desirable cards',
		weights: { value: 20, scarcity: 30, gem_difficulty: 25, momentum: 5, grade_roi: 5, liquidity: 15 }
	},
	flipper: {
		key: 'flipper',
		label: 'Flipper',
		column: 'score_flipper',
		blurb: 'Liquid, fast-moving, high-ROI cards',
		weights: { value: 10, scarcity: 5, gem_difficulty: 5, momentum: 25, grade_roi: 25, liquidity: 30 }
	}
};

export const LENS_KEYS: LensKey[] = ['investor', 'collector', 'flipper'];

/**
 * Composite score for a lens. A present axis contributes `weight * score`;
 * a missing axis contributes 0. The sum is divided by the lens's TOTAL
 * weight (all axes, present or not) — so completeness is rewarded and a
 * card we only know one thing about cannot top a fully-scored card.
 * Returns null only when the card has NO scored axis at all (nothing to
 * rank on); such cards sort last and carry a low-confidence badge.
 */
export function lensScore(
	weights: Record<Axis, number>,
	scores: Partial<Record<Axis, number | null>>
): number | null {
	let totalW = 0;
	let acc = 0;
	let anyPresent = false;
	for (const axis of Object.keys(weights) as Axis[]) {
		const w = weights[axis];
		totalW += w;
		const s = scores[axis];
		if (s == null) continue;
		anyPresent = true;
		acc += w * s;
	}
	if (!anyPresent || totalW === 0) return null;
	return Math.round(acc / totalW);
}

/** high ≥5 axes present, medium 3–4, low ≤2. Thin data stays visible. */
export function rankingConfidence(presentAxes: number): 'high' | 'medium' | 'low' {
	if (presentAxes >= 5) return 'high';
	if (presentAxes >= 3) return 'medium';
	return 'low';
}
