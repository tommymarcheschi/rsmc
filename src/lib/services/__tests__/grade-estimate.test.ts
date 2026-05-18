import { describe, expect, it } from 'vitest';
import { buildGradeLadders, type CohortRow, type EstimatorInput } from '../grade-estimate';

// Vintage Rare Holo so cohort + input share one era×rarity bucket.
const baseInput: EstimatorInput = {
	rarity: 'Rare Holo',
	setReleaseDate: '2000-01-01',
	rawNm: null,
	psa10: null,
	cgc10: null,
	tag10: null,
	gradeLadder: null,
	cohort: null
};

function cohort(n: number, opts: Partial<CohortRow>): CohortRow[] {
	return Array.from({ length: n }, () => ({
		rarity: 'Rare Holo',
		set_release_date: '2000-01-01',
		raw_nm_price: null,
		psa10_price: null,
		cgc10_price: null,
		tag10_price: null,
		...opts
	}));
}

const grader = (out: ReturnType<typeof buildGradeLadders>, g: string) =>
	out.find((l) => l.grader === g);
const cell = (out: ReturnType<typeof buildGradeLadders>, g: string, grade: string) =>
	grader(out, g)?.cells.find((c) => c.grade === grade);

describe('real PSA ladder is passed through, never re-estimated', () => {
	const out = buildGradeLadders({
		...baseInput,
		gradeLadder: { psa: { '8': 100, '9': 200, '10': 500 } }
	});

	it('shows real PSA cells as real, unchanged', () => {
		for (const [g, v] of [
			['8', 100],
			['9', 200],
			['10', 500]
		] as const) {
			const c = cell(out, 'PSA', g)!;
			expect(c.real).toBe(true);
			expect(c.value).toBe(v);
			expect(c.confidence).toBeUndefined();
			expect(c.basis).toBeUndefined();
		}
	});

	it('does NOT fabricate PSA sub-10 cells with no real anchor', () => {
		// grades 1–7 and 9.5 have no real PriceCharting price → absent.
		for (const g of ['1', '5', '7', '9.5']) expect(cell(out, 'PSA', g)).toBeUndefined();
	});
});

describe('cross-grader estimate anchored on this card (near-real)', () => {
	// Real PSA ladder + real CGC 10 on the same card ⇒ R = 250/500 = 0.5.
	const out = buildGradeLadders({
		...baseInput,
		gradeLadder: { psa: { '8': 100, '9': 200, '10': 500 }, cgc: { '10': 250 } }
	});

	it('CGC 10 stays real', () => {
		const c = cell(out, 'CGC', '10')!;
		expect(c.real).toBe(true);
		expect(c.value).toBe(250);
	});

	it('CGC 8/9 estimated = real PSA@grade × own-card R, high confidence', () => {
		const c8 = cell(out, 'CGC', '8')!;
		expect(c8.real).toBe(false);
		expect(c8.value).toBe(50); // 100 × 0.5
		expect(c8.confidence).toBeGreaterThanOrEqual(0.8);
		expect(c8.tier).toBe('high');
		expect(c8.basis).toContain('Not a market price');
		expect(cell(out, 'CGC', '9')!.value).toBe(100); // 200 × 0.5
	});

	it('CGC grades with no real PSA shape anchor are omitted', () => {
		expect(cell(out, 'CGC', '7')).toBeUndefined();
		expect(cell(out, 'CGC', '9.5')).toBeUndefined();
	});
});

describe('cross-grader estimate calibrated from the cohort', () => {
	it('uses calibrated CGC10/PSA10 when the card has no own pair', () => {
		const out = buildGradeLadders({
			...baseInput,
			gradeLadder: { psa: { '9': 100, '10': 300 } },
			cohort: cohort(20, { psa10_price: 100, cgc10_price: 60, raw_nm_price: 10 })
		});
		const c9 = cell(out, 'CGC', '9')!;
		expect(c9.real).toBe(false);
		expect(c9.value).toBe(60); // 100 × 0.6
		expect(c9.tier).toBe('low'); // calibrated, mid cohort → dimmer
		expect(c9.basis).toContain('calibrated');
	});

	it('omits the estimate entirely when the cohort is too thin (<8 pairs)', () => {
		const out = buildGradeLadders({
			...baseInput,
			gradeLadder: { psa: { '9': 100, '10': 300 } },
			cohort: cohort(5, { psa10_price: 100, cgc10_price: 60 })
		});
		expect(grader(out, 'CGC')).toBeUndefined();
	});
});

describe('Path B — raw→PSA10 only when there is no real PSA at all', () => {
	it('emits one gated, clearly-marked blue PSA 10 estimate', () => {
		const out = buildGradeLadders({
			...baseInput,
			rawNm: 20,
			cohort: cohort(130, { raw_nm_price: 10, psa10_price: 80 })
		});
		const c = cell(out, 'PSA', '10')!;
		expect(c.real).toBe(false);
		expect(c.value).toBe(160); // 20 × (80/10)
		expect(c.confidence).toBeLessThanOrEqual(0.6); // never "high"
		expect(c.basis).toContain('no real PSA sale');
	});

	it('does NOT anchor other graders on an estimated PSA10 (no estimate-of-estimate)', () => {
		const out = buildGradeLadders({
			...baseInput,
			rawNm: 20,
			cohort: cohort(130, { raw_nm_price: 10, psa10_price: 80 })
		});
		expect(grader(out, 'CGC')).toBeUndefined();
		expect(grader(out, 'TAG')).toBeUndefined();
	});

	it('shows nothing when the multiple cohort is too thin', () => {
		const out = buildGradeLadders({
			...baseInput,
			rawNm: 20,
			cohort: cohort(5, { raw_nm_price: 10, psa10_price: 80 })
		});
		expect(out).toHaveLength(0);
	});
});

describe('BGS has no cohort column — estimates only from this card', () => {
	it('estimates BGS sub-10 from own real BGS10 + real PSA ladder', () => {
		const out = buildGradeLadders({
			...baseInput,
			gradeLadder: { psa: { '8': 100, '10': 400 }, bgs: { '10': 600, '10BL': 1500 } }
		});
		expect(cell(out, 'BGS', '10')!.real).toBe(true);
		expect(cell(out, 'BGS', '10BL')!.real).toBe(true);
		const c8 = cell(out, 'BGS', '8')!;
		expect(c8.real).toBe(false);
		expect(c8.value).toBe(150); // 100 × (600/400)
		expect(c8.tier).toBe('high');
	});

	it('cannot estimate BGS from the cohort (no bgs10 column) — real cells only', () => {
		const out = buildGradeLadders({
			...baseInput,
			gradeLadder: { psa: { '8': 100, '10': 400 } },
			cohort: cohort(200, { psa10_price: 100, cgc10_price: 50, tag10_price: 70 })
		});
		expect(grader(out, 'BGS')).toBeUndefined();
	});
});

describe('honesty invariants', () => {
	const out = buildGradeLadders({
		...baseInput,
		gradeLadder: { psa: { '7': 50, '8': 100, '10': 500 }, cgc: { '10': 300 }, tag: { '10': 450 } }
	});

	it('every real cell has no confidence/basis; every estimate has both + is blue (real:false)', () => {
		for (const l of out)
			for (const c of l.cells) {
				if (c.real) {
					expect(c.confidence).toBeUndefined();
					expect(c.basis).toBeUndefined();
				} else {
					expect(typeof c.confidence).toBe('number');
					expect(c.confidence!).toBeGreaterThanOrEqual(0.4);
					expect(c.basis).toContain('Not a market price');
				}
			}
	});
});
