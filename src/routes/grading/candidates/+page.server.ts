/**
 * /grading/candidates — ranked list of cards with positive gem-rate-weighted
 * PSA 10 premium. Mirrors the hunt-mode server-load shape: plain GET form,
 * SQL-backed sort on `grading_roi_premium`, service/tier cost layered in UI.
 */

import { supabase } from '$services/supabase';
import { getGradingFees } from '$services/price-tracker';
import type { PageServerLoad } from './$types';
import type { GradingService } from '$types';
import { GEM_RATE_MIN_SAMPLE } from '$services/grading-roi';

const PAGE_SIZE = 24;

interface CandidateRow {
	card_id: string;
	name: string;
	set_id: string;
	set_name: string;
	card_number: string | null;
	rarity: string | null;
	image_small_url: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
	psa_gem_rate: number | null;
	psa_pop_total: number | null;
	psa_pop_10: number | null;
	grading_roi_premium: number | null;
	graded_prices_fetched_at: string | null;
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	const service = (url.searchParams.get('service') ?? 'PSA') as GradingService;
	const tier = url.searchParams.get('tier') ?? 'Economy';
	const minGemRate = parseFloat(url.searchParams.get('min_gem_rate') ?? '0');
	const maxRaw = parseFloat(url.searchParams.get('max_raw') ?? '');
	const minPop = parseInt(
		url.searchParams.get('min_pop') ?? String(GEM_RATE_MIN_SAMPLE)
	);
	const setId = url.searchParams.get('set') ?? '';
	const sort = url.searchParams.get('sort') ?? 'roi_desc';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));

	// ── Main candidate query ──────────────────────────────────────────
	let q = supabase
		.from('card_index')
		.select(
			'card_id, name, set_id, set_name, card_number, rarity, image_small_url, ' +
				'raw_nm_price, psa10_price, psa_gem_rate, psa_pop_total, psa_pop_10, ' +
				'grading_roi_premium, graded_prices_fetched_at',
			{ count: 'exact' }
		)
		.gt('grading_roi_premium', 0);

	if (!Number.isNaN(minGemRate) && minGemRate > 0) q = q.gte('psa_gem_rate', minGemRate);
	if (!Number.isNaN(maxRaw) && maxRaw > 0) q = q.lte('raw_nm_price', maxRaw);
	if (!Number.isNaN(minPop) && minPop > 0) q = q.gte('psa_pop_total', minPop);
	if (setId) q = q.eq('set_id', setId);

	// Sort
	switch (sort) {
		case 'gem_rate_desc':
			q = q.order('psa_gem_rate', { ascending: false, nullsFirst: false });
			break;
		case 'raw_asc':
			q = q.order('raw_nm_price', { ascending: true, nullsFirst: false });
			break;
		case 'psa10_desc':
			q = q.order('psa10_price', { ascending: false, nullsFirst: false });
			break;
		case 'pop_asc':
			q = q.order('psa_pop_total', { ascending: true, nullsFirst: false });
			break;
		case 'roi_desc':
		default:
			q = q.order('grading_roi_premium', { ascending: false, nullsFirst: false });
	}

	const from = (page - 1) * PAGE_SIZE;
	q = q.range(from, from + PAGE_SIZE - 1);

	let rows: CandidateRow[] = [];
	let totalCount = 0;
	let queryError: string | null = null;
	try {
		const result = await q;
		rows = (result.data ?? []) as unknown as CandidateRow[];
		totalCount = result.count ?? 0;
		if (result.error) queryError = result.error.message;
	} catch (e) {
		queryError = e instanceof Error ? e.message : 'query failed';
	}

	// ── Stats (computed over the full filtered set, not just page) ────
	// Two small aggregation queries so totals don't get truncated to the
	// page. Kept cheap — same WHERE clauses + a single aggregate.
	let stats = {
		candidateCount: totalCount,
		totalPremium: 0,
		medianGemRate: null as number | null,
		medianPremium: null as number | null
	};
	try {
		const agg = await buildAggregates({
			minGemRate,
			maxRaw,
			minPop,
			setId
		});
		stats = { candidateCount: totalCount, ...agg };
	} catch {
		// Non-fatal — UI handles null stats.
	}

	// ── Tracked sets for the set dropdown ─────────────────────────────
	let trackedSets: Array<{ set_id: string; set_name: string }> = [];
	try {
		const result = await supabase
			.from('tracked_sets')
			.select('set_id, set_name, release_date')
			.eq('enabled', true)
			.order('release_date', { ascending: false });
		trackedSets = (result.data ?? []) as Array<{ set_id: string; set_name: string }>;
	} catch {
		// If the table's missing we still want the page to render.
	}

	const gradingFees = await getGradingFees();

	return {
		rows,
		totalCount,
		page,
		pageSize: PAGE_SIZE,
		stats,
		gradingFees,
		trackedSets,
		filters: {
			service,
			tier,
			minGemRate: Number.isNaN(minGemRate) ? 0 : minGemRate,
			maxRaw: Number.isNaN(maxRaw) ? null : maxRaw,
			minPop: Number.isNaN(minPop) ? GEM_RATE_MIN_SAMPLE : minPop,
			setId,
			sort
		},
		queryError
	};
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate helper — totals + medians for the stats header.
// ─────────────────────────────────────────────────────────────────────────────

async function buildAggregates(opts: {
	minGemRate: number;
	maxRaw: number;
	minPop: number;
	setId: string;
}): Promise<{
	totalPremium: number;
	medianGemRate: number | null;
	medianPremium: number | null;
}> {
	// Supabase client doesn't expose percentile_cont directly. Pull a slim
	// projection of the filtered set (capped) and compute medians in TS.
	let q = supabase
		.from('card_index')
		.select('psa_gem_rate, grading_roi_premium')
		.gt('grading_roi_premium', 0);

	if (!Number.isNaN(opts.minGemRate) && opts.minGemRate > 0)
		q = q.gte('psa_gem_rate', opts.minGemRate);
	if (!Number.isNaN(opts.maxRaw) && opts.maxRaw > 0) q = q.lte('raw_nm_price', opts.maxRaw);
	if (!Number.isNaN(opts.minPop) && opts.minPop > 0)
		q = q.gte('psa_pop_total', opts.minPop);
	if (opts.setId) q = q.eq('set_id', opts.setId);

	// 5k cap is fine for the current ~24k card index. If it grows past
	// 50k we'll want a proper SQL RPC.
	q = q.limit(5000);

	const { data, error } = await q;
	if (error || !data) return { totalPremium: 0, medianGemRate: null, medianPremium: null };

	const gemRates: number[] = [];
	const premiums: number[] = [];
	let totalPremium = 0;
	for (const row of data as Array<{
		psa_gem_rate: number | null;
		grading_roi_premium: number | null;
	}>) {
		if (row.grading_roi_premium != null) {
			premiums.push(row.grading_roi_premium);
			totalPremium += row.grading_roi_premium;
		}
		if (row.psa_gem_rate != null) gemRates.push(row.psa_gem_rate);
	}

	return {
		totalPremium: Math.round(totalPremium * 100) / 100,
		medianGemRate: median(gemRates),
		medianPremium: median(premiums)
	};
}

function median(arr: number[]): number | null {
	if (arr.length === 0) return null;
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const val =
		sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
	return Math.round(val * 100) / 100;
}
