/**
 * Honesty-gated discovery signals for a card.
 *
 * Single source of truth for the "only surface a signal when it's real /
 * eligible, otherwise null" rule. Every field is either a trustworthy value
 * or `null` — `null` means *do not render anything* (never a fabricated or
 * low-confidence placeholder). This is the honesty doctrine in code.
 *
 * `value_rank` / `scarcity_rank` are modeled 0–100 ranks → callers MUST style
 * them as a rank (purple), never as money. `gem_rate` / `psa10_*` are real
 * acquired data.
 *
 * The grid component `CardThumbnail.svelte` predates this module and mirrors
 * the same logic inline via reactive `$derived` (its data shape includes
 * grid-only fields like combined_pop_total); keep the two in sync. Server
 * loaders (collection, sets, …) should use this helper rather than
 * re-implementing the gate.
 *
 * `score_momentum` / `score_liquidity` are deliberately absent — they are
 * ~null in prod, and surfacing an empty axis is itself a doctrine violation.
 */

export interface DiscoverySignals {
	value_rank: number | null;
	scarcity_rank: number | null;
	gem_rate: number | null;
	psa10_delta: number | null;
	psa10_multiple: number | null;
}

export interface RawDiscoveryRow {
	score_value: number | null;
	score_scarcity: number | null;
	psa_gem_rate: number | null;
	psa_pop_total: number | null;
	psa10_delta: number | null;
	psa10_multiple: number | null;
	ranking_confidence: string | null;
}

/**
 * The `card_index` columns the gate reads. Append `card_id` (and any
 * caller-specific columns) when building a select string.
 */
export const DISCOVERY_SELECT_COLS =
	'score_value, score_scarcity, psa_gem_rate, psa_pop_total, psa10_delta, psa10_multiple, ranking_confidence';

/** True only when this card's modeled ranks are trustworthy enough to show. */
function confident(ranking_confidence: string | null): boolean {
	return ranking_confidence === 'high' || ranking_confidence === 'medium';
}

/**
 * Apply the honesty gate to one raw `card_index` row. Pure; safe to call per
 * row in a loop.
 */
export function gateDiscoverySignals(r: RawDiscoveryRow): DiscoverySignals {
	const confOk = confident(r.ranking_confidence);
	// Modeled ranks: only at high|medium confidence — never headline a
	// low/null-confidence score.
	const valueRank = r.score_value != null && confOk ? r.score_value : null;
	const scarcityRank = r.score_scarcity != null && confOk ? r.score_scarcity : null;
	// Real gem rate: only when a real PSA pop actually backs it.
	const gemRate =
		r.psa_gem_rate != null && (r.psa_pop_total ?? 0) > 0 ? r.psa_gem_rate : null;
	// Real raw → PSA 10 uplift: only a positive number is decision-relevant;
	// the multiple is a companion to the delta, never shown alone.
	const psa10Delta = r.psa10_delta != null && r.psa10_delta > 0 ? r.psa10_delta : null;
	return {
		value_rank: valueRank,
		scarcity_rank: scarcityRank,
		gem_rate: gemRate,
		psa10_delta: psa10Delta,
		psa10_multiple: psa10Delta != null ? r.psa10_multiple : null
	};
}

/** True when the row carries at least one renderable signal. */
export function hasAnyDiscoverySignal(d: DiscoverySignals): boolean {
	return (
		d.value_rank != null ||
		d.scarcity_rank != null ||
		d.gem_rate != null ||
		d.psa10_delta != null
	);
}
