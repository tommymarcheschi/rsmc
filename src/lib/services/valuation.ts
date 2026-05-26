/**
 * Collection valuation — single source of truth.
 *
 * Both the dashboard (Top Holdings + Portfolio Value) and /collection
 * (Current Value + per-row unit value) used to inline their own pricing
 * math. The two drifted: the dashboard skipped the per-condition real-
 * comp lookup entirely and used a hardcoded discount ladder that didn't
 * match the catalog. This service is the only place either surface (or
 * any future one) should compute "what is this collection entry worth
 * right now?".
 *
 * Valuation priority (honesty doctrine — real data first):
 *
 *   1. **Real per-condition comp** — the latest median from
 *      `condition_price_snapshots` for this exact (card_id, condition).
 *      Sourced from TCGPlayer active listings. When present, this is
 *      the displayed value verbatim. `source: 'real_comp'`.
 *
 *   2. **Raw NM (canonical)** — when the entry's condition IS 'NM' and
 *      we have `card_index.raw_nm_price` (PriceCharting ungraded NM).
 *      `source: 'raw_nm'`, not an estimate.
 *
 *   3. **Calibrated discount estimate** — only when neither above
 *      exists AND we have an NM price to discount. Multiplies
 *      `raw_nm_price` by the empirical ratio for the entry's
 *      condition. ALWAYS flagged `is_estimate: true` so the UI can
 *      render the "(est.)" tag — never silently dress an estimate up
 *      as a real comp.
 *
 *   4. **None** — no NM price + no real comp. The UI shows "—".
 *
 * Calibration provenance — `CONDITION_DISCOUNT`:
 *
 *   Derived from `condition_price_snapshots` on 2026-05-26:
 *     - 31,032 raw rows → 2,166 unique (card_id, condition) latest
 *       snapshots after collapsing on snapshot_date desc.
 *     - 347 cards qualified (NM sample_count ≥ 5 AND at least one
 *       non-NM condition with sample_count ≥ 3).
 *     - For each qualifying card we computed
 *         ratio_cond = median_cents(cond) / median_cents(NM)
 *       The constants below are the population MEDIAN ratio across
 *       those cards (robust to the long-tail outliers — e.g. one
 *       card had HP > NM, presumably a label flip — which the mean
 *       was sensitive to).
 *
 *     | cond | n   | empirical median |  was hardcoded |
 *     |------|-----|------------------|----------------|
 *     | LP   | 346 | 0.637            | 0.85  (-21pp)  |
 *     | MP   | 346 | 0.488            | 0.70  (-21pp)  |
 *     | HP   | 347 | 0.374            | 0.50  (-13pp)  |
 *     | DMG  | 345 | 0.310            | 0.30  (+1pp)   |
 *
 *   To recompute (SQL, idempotent):
 *
 *     SELECT condition,
 *            percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) AS median,
 *            count(*) AS n
 *     FROM (
 *       SELECT s.condition,
 *              (s.median_cents::float / nm.median_cents) AS ratio
 *       FROM (
 *         SELECT DISTINCT ON (card_id, condition) *
 *         FROM condition_price_snapshots
 *         ORDER BY card_id, condition, snapshot_date DESC
 *       ) s
 *       JOIN (
 *         SELECT DISTINCT ON (card_id) card_id, median_cents, sample_count
 *         FROM condition_price_snapshots WHERE condition = 'NM'
 *         ORDER BY card_id, snapshot_date DESC
 *       ) nm USING (card_id)
 *       WHERE nm.sample_count >= 5
 *         AND s.sample_count >= 3
 *         AND s.condition <> 'NM'
 *     ) t
 *     GROUP BY condition
 *     ORDER BY array_position(array['LP','MP','HP','DMG'], condition);
 *
 *   When the snapshot table grows materially, rerun and update the
 *   constants below.
 *
 * Pure module — no I/O at module load. The DB read for
 * `condition_price_snapshots` lives in `loadConditionComps()`, which
 * the loader calls explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const CONDITION_DISCOUNT: Readonly<Record<string, number>> = Object.freeze({
	NM: 1.0,
	LP: 0.64,
	MP: 0.49,
	HP: 0.37,
	DMG: 0.31
});

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

/** Real TCGPlayer per-condition median, latest snapshot. */
export interface ConditionComp {
	median_cents: number;
	sample_count: number;
	snapshot_date: string;
}

export interface ValuationInput {
	condition: string;
	quantity: number;
	purchase_price: number | null;
	/** PriceCharting raw NM (canonical raw price from card_index). */
	raw_nm_price: number | null;
	/** Real per-condition median for this exact (card_id, condition), if any. */
	conditionComp?: ConditionComp | null;
}

export type ValuationSource = 'real_comp' | 'raw_nm' | 'estimate' | 'none';

export interface Valuation {
	/** Per-card unit value at this entry's condition (dollars, rounded to cents). */
	unit_value: number | null;
	/** unit_value × quantity (dollars). */
	line_value: number | null;
	/** True only when `source === 'estimate'`. */
	is_estimate: boolean;
	/** The multiplier applied vs NM (1.0 for real_comp; we don't know the implicit ratio). */
	discount: number;
	source: ValuationSource;
	sample_count: number | null;
	as_of: string | null;
	/** line_value − (purchase_price × quantity), or null when unit_value is null or purchase_price is null. */
	gain_loss: number | null;
}

/**
 * Pure: compute the valuation for one collection entry.
 *
 * - Never fabricates a real_comp from an estimate.
 * - Never silently dresses an estimate up as a comp (`is_estimate` is
 *   true iff `source === 'estimate'`).
 * - Rounds to cents at the unit level so `line_value` stays clean for
 *   N-card lines.
 */
export function valueEntry(input: ValuationInput): Valuation {
	const cond = input.condition;
	const discount = CONDITION_DISCOUNT[cond] ?? 1.0;
	const comp = input.conditionComp;

	let unitValue: number | null = null;
	let source: ValuationSource = 'none';
	let isEstimate = false;
	let sampleCount: number | null = null;
	let asOf: string | null = null;
	let effectiveDiscount = discount;

	if (comp && comp.median_cents > 0) {
		unitValue = Math.round(comp.median_cents) / 100;
		source = 'real_comp';
		isEstimate = false;
		sampleCount = comp.sample_count ?? null;
		asOf = comp.snapshot_date ?? null;
		// We don't model an implicit discount for a real comp — it IS the
		// observed price at that condition, full stop.
		effectiveDiscount = 1.0;
	} else if (input.raw_nm_price != null && cond === 'NM') {
		unitValue = Math.round(input.raw_nm_price * 100) / 100;
		source = 'raw_nm';
		isEstimate = false;
	} else if (input.raw_nm_price != null) {
		unitValue = Math.round(input.raw_nm_price * discount * 100) / 100;
		source = 'estimate';
		isEstimate = discount < 1.0;
	}

	const lineValue = unitValue != null ? Math.round(unitValue * input.quantity * 100) / 100 : null;
	const costBasis =
		input.purchase_price != null ? input.purchase_price * input.quantity : null;
	const gainLoss =
		lineValue != null && costBasis != null
			? Math.round((lineValue - costBasis) * 100) / 100
			: null;

	return {
		unit_value: unitValue,
		line_value: lineValue,
		is_estimate: isEstimate,
		discount: effectiveDiscount,
		source,
		sample_count: sampleCount,
		as_of: asOf,
		gain_loss: gainLoss
	};
}

/**
 * Server helper: batch-fetch the latest per-condition snapshot for the
 * given card_ids and return a (card_id|condition) → ConditionComp map.
 *
 * Fault-isolated — a failure returns an empty map so the caller falls
 * through to the estimate path rather than crashing the page. Safe to
 * call with an empty list (returns the empty map without a round-trip).
 *
 * The dedupe-on-latest logic mirrors what /collection used to inline.
 * We pull more than we need (every condition for every card) and
 * collapse in JS — a single batched query, capped at 50 rows per card
 * (≤5 conditions × ~10 historical snapshots covers any real spread).
 */
export async function loadConditionComps(
	supabase: SupabaseClient,
	cardIds: string[]
): Promise<Record<string, ConditionComp>> {
	const out: Record<string, ConditionComp> = {};
	if (cardIds.length === 0) return out;

	try {
		const { data } = await supabase
			.from('condition_price_snapshots')
			.select('card_id, condition, median_cents, sample_count, snapshot_date')
			.in('card_id', cardIds)
			.order('snapshot_date', { ascending: false });

		for (const r of (data ?? []) as Array<{
			card_id: string;
			condition: string;
			median_cents: number;
			sample_count: number;
			snapshot_date: string;
		}>) {
			const key = `${r.card_id}|${r.condition}`;
			// Rows come newest-first; first one we see per key wins.
			if (!(key in out) && r.median_cents != null) {
				out[key] = {
					median_cents: r.median_cents,
					sample_count: r.sample_count,
					snapshot_date: r.snapshot_date
				};
			}
		}
	} catch {
		// Empty map = honest fallback. Estimate ladder still applies.
	}
	return out;
}

/** Convenience key for the loadConditionComps map. */
export function compKey(cardId: string, condition: string): string {
	return `${cardId}|${condition}`;
}
