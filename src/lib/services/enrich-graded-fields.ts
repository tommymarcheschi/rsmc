/**
 * Graded/pop upsert fields derived from a PriceCharting scrape — the ONE
 * place this is built, used by both refresh-index write paths
 * (`enrichOneCard` full path + `stalePriceRow` stale path).
 *
 * WHY THIS EXISTS (data-loss incident 2026-05-19): both paths previously
 * inlined `psa10_price: pc?.psa10 ?? null` (etc.) directly into the upsert
 * row. PostgREST upsert is INSERT ... ON CONFLICT DO UPDATE and builds the
 * UPDATE SET clause from the keys PRESENT in the payload, so a transient /
 * Cloudflare-failed scrape (`pc == null`) wrote NULL over previously-good
 * graded data — a 3000-card cloud run nulled ~205 real PSA10 prices. The
 * two paths were "mirrored by hand", so the bug existed in both.
 *
 * The no-clobber contract: a graded field is included ONLY when the scrape
 * actually returned a real value for it; otherwise the key is OMITTED so
 * the ON CONFLICT UPDATE leaves the stored column untouched. This mirrors
 * the already-correct `tag_pop_*` omission in refresh-index and the
 * card-detail "Refresh now" action.
 *
 * `graded_prices_fetched_at` advances only when PriceCharting was actually
 * reached (`pc != null`), even if the card legitimately has no PSA10/pop —
 * that is the "checked, nothing here" signal the chronic-miss backoff
 * relies on. A transient miss (`pc == null`) advances nothing, so the card
 * stays top-priority for retry and no value is destroyed.
 */

import type { PriceChartingData } from './pricecharting-scraper';

export function pcGradedFields(
	pc: PriceChartingData | null,
	now: string
): Record<string, unknown> {
	// Transient / Cloudflare miss: write NOTHING graded. Omitting every key
	// means the upsert's UPDATE clause never touches these columns, so the
	// stored values survive and the card stays due for retry.
	if (pc == null) return {};

	// PriceCharting was reached. Record that (drives chronic-miss backoff)
	// regardless of whether this particular card has any graded market.
	const fields: Record<string, unknown> = { graded_prices_fetched_at: now };

	if (pc.psa10 != null) {
		fields.psa10_price = pc.psa10;
		fields.psa10_source = 'pricecharting';
	}
	if (pc.tag10 != null) {
		fields.tag10_price = pc.tag10;
		fields.tag10_source = 'pricecharting';
	}
	if (pc.cgc10 != null) {
		fields.cgc10_price = pc.cgc10;
		fields.cgc10_source = 'pricecharting';
	}
	// Only a non-empty ladder — never overwrite a good ladder with {}.
	if (pc.gradeLadder && Object.keys(pc.gradeLadder).length > 0) {
		fields.grade_ladder = pc.gradeLadder;
		fields.grade_ladder_fetched_at = now;
	}
	if (pc.psa10LastSold != null) {
		fields.psa10_last_sold_at = pc.psa10LastSold;
	}
	if (pc.psaPop) {
		fields.psa_pop_total = pc.psaPop.total;
		fields.psa_pop_10 = pc.psaPop.grade10;
		fields.psa_gem_rate = pc.psaPop.gemRate;
		fields.psa_fetched_at = now;
	}
	if (pc.cgcPop) {
		fields.cgc_pop_total = pc.cgcPop.total;
		fields.cgc_pop_10 = pc.cgcPop.grade10;
		fields.cgc_gem_rate = pc.cgcPop.gemRate;
		fields.cgc_fetched_at = now;
	}
	return fields;
}
