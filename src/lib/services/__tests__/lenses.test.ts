import { describe, expect, it } from 'vitest';
import {
	lensScore,
	rankingConfidence,
	LENSES,
	LENS_KEYS,
	AXES,
	type Axis
} from '../lenses';

const full = (n: number): Record<Axis, number> => ({
	value: n,
	scarcity: n,
	gem_difficulty: n,
	momentum: n,
	grade_roi: n,
	liquidity: n
});

describe('lensScore — composite math', () => {
	it('a fully-scored card at X scores X for every lens', () => {
		for (const k of LENS_KEYS) {
			expect(lensScore(LENSES[k].weights, full(80))).toBe(80);
		}
	});

	it('returns null only when no axis is scored', () => {
		expect(lensScore(LENSES.investor.weights, {})).toBeNull();
		expect(
			lensScore(LENSES.investor.weights, {
				value: null,
				scarcity: null,
				gem_difficulty: null,
				momentum: null,
				grade_roi: null,
				liquidity: null
			})
		).toBeNull();
		expect(lensScore(LENSES.investor.weights, { value: 50 })).not.toBeNull();
	});

	it('a missing axis contributes 0 (normalised by TOTAL weight) — the locked design decision', () => {
		// Investor weights: value 25 of total 100. A value-only 100 card
		// must NOT score 100; it scores 100 * 25/100 = 25.
		const w = LENSES.investor.weights;
		const totalW = Object.values(w).reduce((a, b) => a + b, 0);
		expect(lensScore(w, { value: 100 })).toBe(Math.round((100 * w.value) / totalW));
		expect(lensScore(w, { value: 100 })).toBeLessThan(100);
	});

	it('completeness is rewarded: a fully-average card beats a single strong axis', () => {
		const w = LENSES.investor.weights;
		const valueOnly = lensScore(w, { value: 100 })!;
		const fullyAverage = lensScore(w, full(50))!;
		expect(fullyAverage).toBeGreaterThan(valueOnly);
	});

	it('lenses differentiate: same axis profile, different weights → different composites', () => {
		// A card strong on scarcity/gem, weak on momentum/liquidity:
		// the Collector lens (scarcity-heavy) must outscore the Flipper
		// lens (liquidity/momentum-heavy).
		const profile: Partial<Record<Axis, number>> = {
			value: 50,
			scarcity: 95,
			gem_difficulty: 90,
			momentum: 10,
			grade_roi: 20,
			liquidity: 10
		};
		const collector = lensScore(LENSES.collector.weights, profile)!;
		const flipper = lensScore(LENSES.flipper.weights, profile)!;
		expect(collector).toBeGreaterThan(flipper);
	});

	it('is monotonic in a present axis score', () => {
		const w = LENSES.flipper.weights;
		const lo = lensScore(w, { liquidity: 10, momentum: 10 })!;
		const hi = lensScore(w, { liquidity: 90, momentum: 90 })!;
		expect(hi).toBeGreaterThan(lo);
	});
});

describe('rankingConfidence — coverage bands', () => {
	it('high ≥5, medium 3–4, low ≤2', () => {
		expect(rankingConfidence(6)).toBe('high');
		expect(rankingConfidence(5)).toBe('high');
		expect(rankingConfidence(4)).toBe('medium');
		expect(rankingConfidence(3)).toBe('medium');
		expect(rankingConfidence(2)).toBe('low');
		expect(rankingConfidence(1)).toBe('low');
		expect(rankingConfidence(0)).toBe('low');
	});
});

describe('lens + axis metadata integrity', () => {
	it('every lens weights every axis with a positive number', () => {
		for (const k of LENS_KEYS) {
			for (const a of AXES) {
				expect(LENSES[k].weights[a.key]).toBeGreaterThan(0);
			}
		}
	});

	it('axis columns are the migration-017 score_* names', () => {
		for (const a of AXES) expect(a.column).toBe(`score_${a.key}`);
		for (const k of LENS_KEYS) expect(LENSES[k].column).toBe(`score_${k}`);
	});
});
