/**
 * Per-grade value estimator — honest, real-anchored.
 *
 * Doctrine (see feedback_multipliers_vs_real_data / north-star honesty):
 * an estimate is NEVER a free `raw × constant`. Every estimated cell is
 * pinned to a real price on THIS card and a ratio calibrated from real
 * cross-sectional catalog data, gated on confidence, and rendered
 * unmistakably as an estimate by the UI.
 *
 * Architecture (real-ladder-first):
 *  - PSA ladder is REAL or ABSENT. PriceCharting's `#full-prices` table
 *    gives a real PSA price ladder (its generic "Grade N" = PSA-graded
 *    sales). We show those real cells; we NEVER fabricate a PSA sub-10
 *    cell (no real shape anchor → render nothing). The single exception
 *    is a card with no real PSA at all: a calibrated raw→PSA10 estimate
 *    (Path B), hard-gated, clearly marked, and never used to anchor any
 *    other grader (no estimate-of-estimate).
 *  - CGC / BGS / TAG: real where PriceCharting names them (their 10 /
 *    9.5 / pristine / black-label). Every other grade is estimated as
 *    `realPSA@grade × R`, where R = that grader's 10 ÷ PSA 10 — taken
 *    from THIS card's own real pair when present (near-real), else the
 *    calibrated median over the era×rarity cohort. A grade with no real
 *    PSA shape anchor is omitted (no fabrication).
 */

import type { GradeLadder } from './pricecharting-scraper';

// Era bucketing for curve calibration. Mirrors insights.ts::eraForDate
// intentionally — this module stays pure/DB-free (insights.ts transitively
// imports the Supabase client), and the boundaries are a stable domain fact.
type Era = 'vintage' | 'ex' | 'modern' | 'current' | 'unknown';
function eraForDate(date: string | null | undefined): Era {
	if (!date) return 'unknown';
	const year = Number.parseInt(date.slice(0, 4), 10);
	if (!Number.isFinite(year)) return 'unknown';
	if (year < 2003) return 'vintage';
	if (year < 2011) return 'ex';
	if (year < 2020) return 'modern';
	return 'current';
}

export interface CohortRow {
	rarity: string | null;
	set_release_date: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
	cgc10_price: number | null;
	tag10_price: number | null;
}

export interface EstimatorInput {
	rarity: string | null;
	setReleaseDate: string | null;
	rawNm: number | null;
	/** Real PSA 10 / CGC 10 / TAG 10 columns (card_index). */
	psa10: number | null;
	cgc10: number | null;
	tag10: number | null;
	/** This card's REAL per-grade ladder (migration 020), real cells only. */
	gradeLadder: GradeLadder | null;
	/** Calibration cohort (catalog rows with real raw + real PSA 10). */
	cohort: CohortRow[] | null;
}

export type Grader = 'PSA' | 'CGC' | 'BGS' | 'TAG';
export type Tier = 'high' | 'medium' | 'low';

export interface GradeCell {
	grade: string;
	value: number;
	/** true = real market price (UI: bold white). false = estimate (UI: blue). */
	real: boolean;
	confidence?: number;
	tier?: Tier;
	/** Human, spelled-out derivation for the estimate tooltip. */
	basis?: string;
}

export interface GraderLadder {
	grader: Grader;
	cells: GradeCell[];
}

// Standard low→high ladder shown for every grader. PriceCharting prices
// the integer ladder + 9.5; grader-specific specials are appended only
// when that grader has a real value for them.
const BASE_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9.5', '10'] as const;
const SPECIALS: Partial<Record<Grader, string[]>> = {
	CGC: ['10P'],
	BGS: ['10BL']
};

// Confidence gates (doctrine #3): below 0.4 → render NOTHING.
const SHOW = 0.6; // ≥ medium/high
const DIM = 0.4; // [0.4,0.6) low-confidence, still shown faintly

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const n = s.length;
	if (n === 0) return NaN;
	return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function iqr(xs: number[]): number {
	if (xs.length < 4) return 0;
	const s = [...xs].sort((a, b) => a - b);
	const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
	return q(0.75) - q(0.25);
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

// Cohort-size → calibration factor. < 8 pairs anywhere ⇒ no estimate.
function calibrationFactor(n: number): number {
	if (n >= 120) return 1;
	if (n >= 40) return 0.85;
	if (n >= 15) return 0.65;
	if (n >= 8) return 0.5;
	return 0;
}

interface RatioStat {
	ratio: number;
	n: number;
	dispFactor: number;
	scope: 'era×rarity' | 'era' | 'catalog';
}

/**
 * Calibrate grader10 ÷ PSA10 from real cohort pairs, bucketed by
 * era×rarity; broaden to era-only then whole-catalog if a bucket is
 * thin. Returns null when even the catalog has < 8 real pairs.
 */
function calibrateRatio(
	cohort: CohortRow[],
	field: 'cgc10_price' | 'tag10_price',
	era: Era,
	rarity: string | null
): RatioStat | null {
	const ratiosFor = (rows: CohortRow[]): number[] =>
		rows
			.filter((r) => (r.psa10_price ?? 0) > 0 && (r[field] ?? 0) > 0)
			.map((r) => (r[field] as number) / (r.psa10_price as number))
			.filter((x) => Number.isFinite(x) && x > 0);

	const sameEra = cohort.filter((r) => eraForDate(r.set_release_date) === era);
	const buckets: Array<{ rows: CohortRow[]; scope: RatioStat['scope'] }> = [
		{ rows: sameEra.filter((r) => (r.rarity ?? '') === (rarity ?? '')), scope: 'era×rarity' },
		{ rows: sameEra, scope: 'era' },
		{ rows: cohort, scope: 'catalog' }
	];

	for (const b of buckets) {
		const rs = ratiosFor(b.rows);
		if (rs.length >= 8) {
			const m = median(rs);
			const disp = m > 0 ? clamp(iqr(rs) / m, 0, 1) : 1;
			return {
				ratio: m,
				n: rs.length,
				dispFactor: clamp(1 - 0.6 * disp, 0.4, 1),
				scope: b.scope
			};
		}
	}
	return null;
}

/** Calibrate the PSA10 ÷ raw multiple (Path B) the same way. */
function calibrateMultiple(cohort: CohortRow[], era: Era, rarity: string | null): RatioStat | null {
	const multFor = (rows: CohortRow[]): number[] =>
		rows
			.filter((r) => (r.raw_nm_price ?? 0) > 0 && (r.psa10_price ?? 0) > 0)
			.map((r) => (r.psa10_price as number) / (r.raw_nm_price as number))
			.filter((x) => Number.isFinite(x) && x > 0);

	const sameEra = cohort.filter((r) => eraForDate(r.set_release_date) === era);
	const buckets: Array<{ rows: CohortRow[]; scope: RatioStat['scope'] }> = [
		{ rows: sameEra.filter((r) => (r.rarity ?? '') === (rarity ?? '')), scope: 'era×rarity' },
		{ rows: sameEra, scope: 'era' },
		{ rows: cohort, scope: 'catalog' }
	];
	for (const b of buckets) {
		const ms = multFor(b.rows);
		if (ms.length >= 8) {
			const m = median(ms);
			const disp = m > 0 ? clamp(iqr(ms) / m, 0, 1) : 1;
			return { ratio: m, n: ms.length, dispFactor: clamp(1 - 0.6 * disp, 0.4, 1), scope: b.scope };
		}
	}
	return null;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function tierFor(conf: number): Tier {
	return conf >= 0.8 ? 'high' : conf >= SHOW ? 'medium' : 'low';
}

/**
 * Build the per-grade ladders for PSA / CGC / BGS / TAG.
 * Real cells (real:true) are bold-white market prices; estimates
 * (real:false) are the darker-blue, tooltip-disclosed cells.
 */
export function buildGradeLadders(input: EstimatorInput): GraderLadder[] {
	const gl = input.gradeLadder ?? {};
	const era = eraForDate(input.setReleaseDate);
	const cohort = input.cohort ?? [];

	// This card's unified REAL PSA ladder = scraped Grade-N ladder, with
	// the real PSA 10 column filling "10" if the ladder lacks it.
	const psaReal: Record<string, number> = { ...(gl.psa ?? {}) };
	if (psaReal['10'] == null && (input.psa10 ?? 0) > 0) psaReal['10'] = input.psa10 as number;

	// This card's real grader-10 (for the near-real own-card ratio path).
	const ownTen: Record<Grader, number | null> = {
		PSA: psaReal['10'] ?? null,
		CGC: gl.cgc?.['10'] ?? input.cgc10 ?? null,
		BGS: gl.bgs?.['10'] ?? null,
		TAG: gl.tag?.['10'] ?? input.tag10 ?? null
	};
	const realPsa10 = psaReal['10'] ?? null;

	const ladders: GraderLadder[] = [];

	for (const grader of ['PSA', 'CGC', 'BGS', 'TAG'] as const) {
		const realMap: Record<string, number> = {
			...((gl[grader.toLowerCase() as keyof GradeLadder] as Record<string, number>) ?? {})
		};
		// Legacy real 10-columns merge in for their grader.
		if (grader === 'PSA' && psaReal['10'] != null) realMap['10'] = psaReal['10'];
		if (grader === 'CGC' && (input.cgc10 ?? 0) > 0 && realMap['10'] == null)
			realMap['10'] = input.cgc10 as number;
		if (grader === 'TAG' && (input.tag10 ?? 0) > 0 && realMap['10'] == null)
			realMap['10'] = input.tag10 as number;

		const grades = [...BASE_GRADES, ...(SPECIALS[grader] ?? [])];
		const cells: GradeCell[] = [];

		// Pre-compute this grader's cross-grader ratio R once.
		// 1) own card: real grader-10 & real PSA-10 → near-real.
		// 2) else calibrated median over the cohort (CGC/TAG only — no
		//    bgs10 column exists to calibrate from).
		let ratio: number | null = null;
		let ratioConf = 0;
		let ratioBasis = '';
		if (grader !== 'PSA') {
			if (ownTen[grader] != null && realPsa10 != null && realPsa10 > 0) {
				ratio = (ownTen[grader] as number) / realPsa10;
				ratioConf = 0.9;
				ratioBasis = `real ${grader} 10 $${round2(ownTen[grader] as number)} ÷ real PSA 10 $${round2(realPsa10)} on this card (${round2(ratio)}×)`;
			} else if (grader === 'CGC' || grader === 'TAG') {
				const stat = calibrateRatio(
					cohort,
					grader === 'CGC' ? 'cgc10_price' : 'tag10_price',
					era,
					input.rarity
				);
				if (stat) {
					ratio = stat.ratio;
					ratioConf = 0.62 * calibrationFactor(stat.n) * stat.dispFactor;
					ratioBasis = `calibrated ${grader} 10 ÷ PSA 10 = ${round2(stat.ratio)}× (${stat.scope} cohort, n=${stat.n})`;
				}
			}
		}

		for (const g of grades) {
			const real = realMap[g];
			if (real != null && real > 0) {
				cells.push({ grade: g, value: round2(real), real: true });
				continue;
			}

			if (grader === 'PSA') {
				// PSA is real-or-absent. The ONLY estimate allowed is a
				// PSA 10 from raw when the card has NO real PSA at all
				// (Path B) — hard-gated, never anchors other graders.
				if (g === '10' && realPsa10 == null && (input.rawNm ?? 0) > 0) {
					const stat = calibrateMultiple(cohort, era, input.rarity);
					if (stat) {
						const conf = clamp(0.55 * calibrationFactor(stat.n) * stat.dispFactor, 0, 0.6);
						if (conf >= DIM) {
							cells.push({
								grade: g,
								value: round2((input.rawNm as number) * stat.ratio),
								real: false,
								confidence: conf,
								tier: tierFor(conf),
								basis: `Estimate — no real PSA sale for this card. Raw $${round2(input.rawNm as number)} × calibrated PSA10/raw ${round2(stat.ratio)}× (${stat.scope} cohort, n=${stat.n}). Not a market price.`
							});
						}
					}
				}
				continue;
			}

			// CGC / BGS / TAG estimate: real PSA price at THIS grade ×
			// the cross-grader ratio. No real PSA anchor at g ⇒ omit.
			const psaAnchor = psaReal[g];
			if (psaAnchor == null || psaAnchor <= 0 || ratio == null) continue;

			const conf = ratioConf; // shape anchor is real PSA@g (1.0)
			if (conf < DIM) continue;
			cells.push({
				grade: g,
				value: round2(psaAnchor * ratio),
				real: false,
				confidence: conf,
				tier: tierFor(conf),
				basis: `Estimate — no real ${grader} ${g} sale for this card. Real PSA ${g} $${round2(psaAnchor)} × ${ratioBasis}. Not a market price.`
			});
		}

		if (cells.length > 0) ladders.push({ grader, cells });
	}

	return ladders;
}
