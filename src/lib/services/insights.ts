/**
 * Trove — market insights (Tier 2 roadmap)
 *
 * Queries against card_index. Returns SQL-computed signals the user can
 * act on: cards whose PSA 10 multiple is abnormally low or high vs the
 * median multiple for their era × rarity bucket.
 *
 * Why era × rarity bucketed: rarity labels like "Promo" span everything
 * from 1999 black-star promos (expensive, high PSA 10 multiple) to 2024
 * stamped player promos (bulk). Same string, totally different markets.
 * Splitting by era as well as rarity keeps medians meaningful.
 */

import { supabase } from './supabase';
import { computeGradingROI, DEFAULT_TIER_BY_SERVICE } from './grading-roi';
import { getGradingFees } from './price-tracker';

export type Era = 'vintage' | 'ex' | 'modern' | 'current' | 'unknown';

export const ERA_LABELS: Record<Era, string> = {
	vintage: 'Vintage (pre-2003)',
	ex: 'EX era (2003–2010)',
	modern: 'Modern (2011–2019)',
	current: 'Current (2020+)',
	unknown: 'Unknown era'
};

export function eraForDate(date: string | null | undefined): Era {
	if (!date) return 'unknown';
	const year = Number.parseInt(date.slice(0, 4), 10);
	if (!Number.isFinite(year)) return 'unknown';
	if (year < 2003) return 'vintage';
	if (year < 2011) return 'ex';
	if (year < 2020) return 'modern';
	return 'current';
}

function bucketKey(era: Era, rarity: string): string {
	return `${era}::${rarity}`;
}

export interface UndervaluedRow {
	card_id: string;
	name: string;
	set_name: string;
	set_release_date: string | null;
	card_number: string | null;
	rarity: string | null;
	era: Era;
	image_small_url: string | null;
	raw_nm_price: number;
	psa10_price: number;
	actual_multiple: number;
	median_multiple: number;
	/** (actual - median) / median × 100. Negative = cheap PSA 10, Positive = hot PSA 10 */
	deviation_pct: number;
	psa_pop_total: number | null;
}

// Cards below these floors are bulk or illiquid — noise in multiples.
const MIN_RAW = 5;
const MIN_PSA10 = 20;

// Buckets (era × rarity) with fewer than this many indexed cards don't
// get a trustworthy median. Cards in thin buckets are excluded. Splitting
// by era as well as rarity thins each bucket vs. rarity-only, so the
// threshold trades some statistical confidence for meaningful peer sets
// (e.g. 1999 promos comparing against 1999 promos, not 2024 stamped ones).
// Will tighten back up as the full-index run completes.
const MIN_BUCKET_SAMPLE = 10;

type RawRow = {
	card_id: string;
	name: string;
	set_name: string;
	set_release_date: string | null;
	card_number: string | null;
	rarity: string | null;
	image_small_url: string | null;
	raw_nm_price: number;
	psa10_price: number;
	psa10_multiple: number;
	psa_pop_total: number | null;
};

async function loadAnalyzableCards(): Promise<RawRow[]> {
	const out: RawRow[] = [];
	const pageSize = 1000;
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select(
				'card_id, name, set_name, set_release_date, card_number, rarity, image_small_url, ' +
					'raw_nm_price, psa10_price, psa10_multiple, psa_pop_total'
			)
			.gte('raw_nm_price', MIN_RAW)
			.gte('psa10_price', MIN_PSA10)
			.not('psa10_multiple', 'is', null)
			.not('rarity', 'is', null)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);

		if (error) throw error;
		const batch = (data ?? []) as RawRow[];
		out.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	return out;
}

function median(sorted: number[]): number {
	const n = sorted.length;
	if (n === 0) return 0;
	return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
}

export interface UndervaluedResult {
	cheapPsa10: UndervaluedRow[];
	hotPsa10: UndervaluedRow[];
	bucketsSampled: number;
	cardsAnalyzed: number;
}

export interface CardSignal {
	actual_multiple: number;
	median_multiple: number;
	deviation_pct: number;
	rarity: string;
	era: Era;
	era_label: string;
	sample_size: number;
}

// Cache the (era::rarity)→median map for 10 minutes so per-card signal
// lookups don't re-scan card_index on every /card/[id] hit.
let bucketMedianCache: { at: number; map: Map<string, { median: number; size: number }> } | null =
	null;
const BUCKET_CACHE_TTL_MS = 10 * 60 * 1000;

async function getBucketMedians(): Promise<Map<string, { median: number; size: number }>> {
	if (bucketMedianCache && Date.now() - bucketMedianCache.at < BUCKET_CACHE_TTL_MS) {
		return bucketMedianCache.map;
	}
	const rows = await loadAnalyzableCards();
	const byBucket = new Map<string, number[]>();
	for (const r of rows) {
		const rar = r.rarity ?? 'Unknown';
		const era = eraForDate(r.set_release_date);
		const key = bucketKey(era, rar);
		if (!byBucket.has(key)) byBucket.set(key, []);
		byBucket.get(key)!.push(r.psa10_multiple);
	}
	const map = new Map<string, { median: number; size: number }>();
	for (const [key, mults] of byBucket) {
		if (mults.length < MIN_BUCKET_SAMPLE) continue;
		const sorted = [...mults].sort((a, b) => a - b);
		map.set(key, { median: median(sorted), size: mults.length });
	}
	bucketMedianCache = { at: Date.now(), map };
	return map;
}

export interface HeatmapCell {
	era: Era;
	rarity: string;
	card_count: number;
	median_pop: number;
	median_psa10_price: number | null;
	/** Share of cards in this bucket with PSA 10 pop ≤ 50 (the "graded hunt" zone). */
	scarce_share: number;
}

export interface HeatmapResult {
	/** Era order for the grid rows. */
	eras: Era[];
	/** Rarity columns, sorted by total card count descending. */
	rarities: string[];
	cells: HeatmapCell[];
	totalCards: number;
}

/**
 * Era × rarity grid summarizing PSA population density. Purpose: help the
 * user spot pockets where graded supply is genuinely thin — the places
 * their grading budget moves the needle. No price floor here; low-value
 * cards are the ones with the most uncertain pop numbers and belong on
 * the map too.
 */
export async function getPopDensityHeatmap(): Promise<HeatmapResult> {
	const rows: Array<{
		rarity: string | null;
		set_release_date: string | null;
		psa_pop_total: number | null;
		psa_pop_10: number | null;
		psa10_price: number | null;
	}> = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select('rarity, set_release_date, psa_pop_total, psa_pop_10, psa10_price')
			.not('rarity', 'is', null)
			.not('psa_pop_total', 'is', null)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);
		if (error) break;
		const batch = data ?? [];
		rows.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	type Bucket = { pops: number[]; prices: number[]; scarce: number };
	const buckets = new Map<string, Bucket>();
	for (const r of rows) {
		const rar = r.rarity ?? 'Unknown';
		const era = eraForDate(r.set_release_date);
		const key = bucketKey(era, rar);
		if (!buckets.has(key)) buckets.set(key, { pops: [], prices: [], scarce: 0 });
		const b = buckets.get(key)!;
		b.pops.push(r.psa_pop_total ?? 0);
		if (r.psa10_price != null) b.prices.push(r.psa10_price);
		if ((r.psa_pop_10 ?? 0) <= 50) b.scarce += 1;
	}

	const cells: HeatmapCell[] = [];
	const rarityCounts = new Map<string, number>();
	for (const [key, bucket] of buckets) {
		if (bucket.pops.length < 3) continue;
		const [era, rarity] = key.split('::') as [Era, string];
		const sortedPops = [...bucket.pops].sort((a, b) => a - b);
		const sortedPrices = [...bucket.prices].sort((a, b) => a - b);
		cells.push({
			era,
			rarity,
			card_count: bucket.pops.length,
			median_pop: median(sortedPops),
			median_psa10_price: sortedPrices.length ? median(sortedPrices) : null,
			scarce_share: bucket.scarce / bucket.pops.length
		});
		rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + bucket.pops.length);
	}

	const ERA_ORDER: Era[] = ['vintage', 'ex', 'modern', 'current', 'unknown'];
	const presentEras = ERA_ORDER.filter((e) => cells.some((c) => c.era === e));
	const rarities = [...rarityCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([r]) => r);

	return {
		eras: presentEras,
		rarities,
		cells,
		totalCards: rows.length
	};
}

export interface Psa10MoverRow {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string | null;
	rarity: string | null;
	era: Era;
	image_small_url: string | null;
	raw_nm_price: number | null;
	/** Median PSA 10 sale price in the recent 30-day window. */
	recent_median: number;
	recent_sample: number;
	/** Median PSA 10 sale price in the prior 30–60 day window. */
	prior_median: number;
	prior_sample: number;
	delta_pct: number;
	delta_dollars: number;
}

export interface Psa10MomentumResult {
	rising: Psa10MoverRow[];
	cooling: Psa10MoverRow[];
	cardsAnalyzed: number;
}

const MOMENTUM_MIN_SAMPLE = 3;

/**
 * PSA 10 momentum ranker. Uses the psa10_sales table (populated by
 * Tier 5.21) — no 7-day wait for card_index_history snapshots. For
 * each card with enough sales in both the recent (last 30d) and prior
 * (30–60d) windows, compares median prices. Cards appear on rising
 * or cooling leaderboards based on the signed delta.
 *
 * "rising" = recent median > prior median (hot).
 * "cooling" = recent median < prior median (cooling).
 */
export async function getPsa10Momentum(limit = 15): Promise<Psa10MomentumResult> {
	// 60-day window — we need both halves. Single SQL read, joined to
	// card_index for display metadata.
	const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	type Row = {
		card_id: string;
		sold_at: string;
		price_cents: number;
		card_index: {
			name: string;
			set_name: string;
			card_number: string | null;
			rarity: string | null;
			image_small_url: string | null;
			raw_nm_price: number | null;
			set_release_date: string | null;
		} | null;
	};

	const rows: Row[] = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabase
			.from('psa10_sales')
			.select(
				'card_id, sold_at, price_cents, card_index(name, set_name, card_number, rarity, image_small_url, raw_nm_price, set_release_date)'
			)
			.gte('sold_at', since)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);
		if (error) break;
		const batch = (data ?? []) as unknown as Row[];
		rows.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	type Bucket = { recent: number[]; prior: number[]; meta: Row['card_index'] };
	const byCard = new Map<string, Bucket>();
	for (const r of rows) {
		if (!byCard.has(r.card_id)) {
			byCard.set(r.card_id, { recent: [], prior: [], meta: r.card_index });
		}
		const b = byCard.get(r.card_id)!;
		if (r.sold_at >= thirtyDaysAgo) b.recent.push(r.price_cents);
		else b.prior.push(r.price_cents);
	}

	const analyzed: Psa10MoverRow[] = [];
	for (const [cardId, b] of byCard) {
		if (b.recent.length < MOMENTUM_MIN_SAMPLE || b.prior.length < MOMENTUM_MIN_SAMPLE) continue;
		if (!b.meta) continue;
		const recentSorted = [...b.recent].sort((a, b) => a - b);
		const priorSorted = [...b.prior].sort((a, b) => a - b);
		const recentMedian = median(recentSorted) / 100;
		const priorMedian = median(priorSorted) / 100;
		if (priorMedian <= 0) continue;
		const deltaDollars = recentMedian - priorMedian;
		analyzed.push({
			card_id: cardId,
			name: b.meta.name,
			set_name: b.meta.set_name,
			card_number: b.meta.card_number,
			rarity: b.meta.rarity,
			era: eraForDate(b.meta.set_release_date),
			image_small_url: b.meta.image_small_url,
			raw_nm_price: b.meta.raw_nm_price,
			recent_median: Math.round(recentMedian * 100) / 100,
			recent_sample: b.recent.length,
			prior_median: Math.round(priorMedian * 100) / 100,
			prior_sample: b.prior.length,
			delta_pct: Math.round(((deltaDollars / priorMedian) * 100) * 10) / 10,
			delta_dollars: Math.round(deltaDollars * 100) / 100
		});
	}

	const rising = [...analyzed].sort((a, b) => b.delta_pct - a.delta_pct).slice(0, limit);
	const cooling = [...analyzed].sort((a, b) => a.delta_pct - b.delta_pct).slice(0, limit);

	return { rising, cooling, cardsAnalyzed: analyzed.length };
}

export interface SimilarCard {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string | null;
	rarity: string | null;
	image_small_url: string | null;
	raw_nm_price: number | null;
	psa10_price: number;
	psa_pop_total: number | null;
	era: Era;
}

/**
 * Peer cards from the same era × rarity bucket with a comparable PSA 10
 * price — for the "Similar cards" panel on /card/[id]. Excludes the
 * current card and returns up to `limit` rows sorted by smallest price
 * deviation. Returns [] if the seed card lacks enough signal to compare.
 */
export async function getSimilarCards(
	cardId: string,
	rarity: string | null,
	releaseDate: string | null,
	psa10Price: number | null,
	limit = 8
): Promise<SimilarCard[]> {
	if (!rarity || psa10Price == null || psa10Price <= 0) return [];

	const era = eraForDate(releaseDate);
	// Date range for the era bucket. Matches eraForDate() exactly so the
	// peer set mirrors the Undervalued Finder / Heatmap bucketing.
	const eraRange: Record<Era, { gte?: string; lt?: string }> = {
		vintage: { lt: '2003-01-01' },
		ex: { gte: '2003-01-01', lt: '2011-01-01' },
		modern: { gte: '2011-01-01', lt: '2020-01-01' },
		current: { gte: '2020-01-01' },
		unknown: {}
	};
	const range = eraRange[era];

	const priceFloor = psa10Price * 0.5;
	const priceCeil = psa10Price * 1.5;

	let query = supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, card_number, rarity, image_small_url, raw_nm_price, psa10_price, psa_pop_total, set_release_date'
		)
		.eq('rarity', rarity)
		.neq('card_id', cardId)
		.gte('psa10_price', priceFloor)
		.lte('psa10_price', priceCeil);

	if (range.gte) query = query.gte('set_release_date', range.gte);
	if (range.lt) query = query.lt('set_release_date', range.lt);

	const { data, error } = await query.limit(100);
	if (error || !data) return [];

	type Raw = {
		card_id: string;
		name: string;
		set_name: string;
		card_number: string | null;
		rarity: string | null;
		image_small_url: string | null;
		raw_nm_price: number | null;
		psa10_price: number;
		psa_pop_total: number | null;
		set_release_date: string | null;
	};
	return (data as Raw[])
		.sort((a, b) => Math.abs(a.psa10_price - psa10Price) - Math.abs(b.psa10_price - psa10Price))
		.slice(0, limit)
		.map((r) => ({
			card_id: r.card_id,
			name: r.name,
			set_name: r.set_name,
			card_number: r.card_number,
			rarity: r.rarity,
			image_small_url: r.image_small_url,
			raw_nm_price: r.raw_nm_price,
			psa10_price: r.psa10_price,
			psa_pop_total: r.psa_pop_total,
			era: eraForDate(r.set_release_date)
		}));
}

export interface SetValueRow {
	set_id: string;
	set_name: string;
	set_release_date: string | null;
	indexed_cards: number;
	/** Sum of raw_nm_price across indexed cards (what it'd cost to acquire one of each raw). */
	raw_basis: number;
	/** Sum of psa10_price across indexed cards (hypothetical value if every one were PSA 10). */
	psa10_ceiling: number;
	/** Card count weighted by gem-rate confidence (pop ≥ GEM_RATE_MIN_SAMPLE). */
	confident_cards: number;
	/** Pop-weighted average PSA gem rate, in percent. null when no confident cards. */
	avg_gem_rate: number | null;
	/** Expected realistic net profit if you bought + graded one of each card in the set
	 *  (sum of per-card realistic grading ROI via PSA Value tier, tier-escalated). */
	expected_roi: number;
	/** How many cards have positive realistic ROI under the same assumptions. */
	positive_roi_cards: number;
}

export interface SetValueResult {
	rows: SetValueRow[];
	totalSets: number;
	totalCards: number;
}

/**
 * Set-level market rollup: pick the best sets to grade out of. Computes
 * aggregate expected grading ROI per set using real PSA Value-tier fees
 * (with tier escalation) and the per-card gem rate. Only cards that have
 * the full signal — raw, PSA 10, gem rate, and enough pop to trust it —
 * contribute to the ROI sum. Raw_basis / psa10_ceiling include all
 * indexed cards so users still see the total spend + headline value.
 */
export async function getSetValueTracker(): Promise<SetValueResult> {
	const fees = await getGradingFees().catch(() => []);

	const rows: Array<{
		card_id: string;
		set_id: string;
		set_name: string;
		set_release_date: string | null;
		raw_nm_price: number | null;
		psa10_price: number | null;
		psa_gem_rate: number | null;
		psa_pop_total: number | null;
	}> = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select(
				'card_id, set_id, set_name, set_release_date, raw_nm_price, psa10_price, psa_gem_rate, psa_pop_total'
			)
			.not('psa10_price', 'is', null)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);
		if (error) break;
		const batch = data ?? [];
		rows.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	type Agg = {
		set_id: string;
		set_name: string;
		set_release_date: string | null;
		indexed_cards: number;
		raw_basis: number;
		psa10_ceiling: number;
		confident_cards: number;
		weighted_gem_numerator: number;
		expected_roi: number;
		positive_roi_cards: number;
	};
	const bySet = new Map<string, Agg>();

	for (const r of rows) {
		if (!bySet.has(r.set_id)) {
			bySet.set(r.set_id, {
				set_id: r.set_id,
				set_name: r.set_name,
				set_release_date: r.set_release_date,
				indexed_cards: 0,
				raw_basis: 0,
				psa10_ceiling: 0,
				confident_cards: 0,
				weighted_gem_numerator: 0,
				expected_roi: 0,
				positive_roi_cards: 0
			});
		}
		const agg = bySet.get(r.set_id)!;
		agg.indexed_cards += 1;
		agg.raw_basis += r.raw_nm_price ?? 0;
		agg.psa10_ceiling += r.psa10_price ?? 0;

		const roi = computeGradingROI(
			{
				raw_nm_price: r.raw_nm_price,
				psa10_price: r.psa10_price,
				psa_gem_rate: r.psa_gem_rate,
				psa_pop_total: r.psa_pop_total
			},
			'PSA',
			DEFAULT_TIER_BY_SERVICE.PSA,
			fees
		);

		if (roi.confident && roi.realisticProfit != null) {
			agg.confident_cards += 1;
			agg.weighted_gem_numerator += r.psa_gem_rate ?? 0;
			agg.expected_roi += roi.realisticProfit;
			if (roi.realisticProfit > 0) agg.positive_roi_cards += 1;
		}
	}

	const result: SetValueRow[] = [];
	for (const agg of bySet.values()) {
		result.push({
			set_id: agg.set_id,
			set_name: agg.set_name,
			set_release_date: agg.set_release_date,
			indexed_cards: agg.indexed_cards,
			raw_basis: Math.round(agg.raw_basis * 100) / 100,
			psa10_ceiling: Math.round(agg.psa10_ceiling * 100) / 100,
			confident_cards: agg.confident_cards,
			avg_gem_rate:
				agg.confident_cards > 0
					? Math.round((agg.weighted_gem_numerator / agg.confident_cards) * 10) / 10
					: null,
			expected_roi: Math.round(agg.expected_roi * 100) / 100,
			positive_roi_cards: agg.positive_roi_cards
		});
	}

	result.sort((a, b) => b.expected_roi - a.expected_roi);

	return {
		rows: result,
		totalSets: result.length,
		totalCards: rows.length
	};
}

export interface SupplySqueezeRow {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string | null;
	rarity: string | null;
	era: Era;
	image_small_url: string | null;
	raw_nm_price: number | null;
	psa10_price: number;
	psa_pop_total: number;
	psa_pop_10: number | null;
	psa_gem_rate: number | null;
}

/**
 * High-value cards with scarce PSA 10 supply. Surfaces the genuinely
 * rare + expensive combinations — where the PSA 10 comp carries a
 * "can't get one" premium. Filters out bulk (low psa10 price) so we're
 * not showing 50-cent commons that happen to have pop=3.
 */
export async function getSupplySqueezeCards(limit = 20): Promise<SupplySqueezeRow[]> {
	const { data, error } = await supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, card_number, rarity, image_small_url, set_release_date, ' +
				'raw_nm_price, psa10_price, psa_pop_total, psa_pop_10, psa_gem_rate'
		)
		.gte('psa10_price', 100)
		.gte('psa_pop_total', 1)
		.lte('psa_pop_total', 200)
		.order('psa_pop_total', { ascending: true })
		.order('psa10_price', { ascending: false })
		.limit(limit);

	if (error || !data) return [];
	type Raw = Omit<SupplySqueezeRow, 'era'> & { set_release_date: string | null };
	return (data as Raw[]).map(({ set_release_date, ...rest }) => ({
		...rest,
		era: eraForDate(set_release_date)
	}));
}

/** Per-card deviation vs peers in the same era × rarity bucket. Null when we can't compute. */
export async function getCardSignal(
	cardId: string,
	rarity: string | null,
	releaseDate: string | null,
	rawPrice: number | null,
	psa10Price: number | null
): Promise<CardSignal | null> {
	if (!rarity || rawPrice == null || psa10Price == null) return null;
	if (rawPrice < MIN_RAW || psa10Price < MIN_PSA10) return null;

	const era = eraForDate(releaseDate);
	const map = await getBucketMedians();
	const entry = map.get(bucketKey(era, rarity));
	if (!entry) return null;

	const actual = psa10Price / rawPrice;
	return {
		actual_multiple: actual,
		median_multiple: entry.median,
		deviation_pct: ((actual - entry.median) / entry.median) * 100,
		rarity,
		era,
		era_label: ERA_LABELS[era],
		sample_size: entry.size
	};
}

/**
 * Find cards whose PSA 10 multiple deviates most from the median multiple
 * for their era × rarity bucket. Returns both directions in one pass.
 *
 * "cheapPsa10" = actual multiple far below bucket median → PSA 10 comp
 * looks underpriced relative to peers (buy graded).
 *
 * "hotPsa10" = actual multiple far above bucket median → raw looks
 * underpriced relative to what PSA 10s sell for (buy raw, maybe grade).
 */
export async function getUndervaluedCards(limit = 20): Promise<UndervaluedResult> {
	const rows = await loadAnalyzableCards();

	const byBucket = new Map<string, number[]>();
	for (const r of rows) {
		const rar = r.rarity ?? 'Unknown';
		const era = eraForDate(r.set_release_date);
		const key = bucketKey(era, rar);
		if (!byBucket.has(key)) byBucket.set(key, []);
		byBucket.get(key)!.push(r.psa10_multiple);
	}

	const medianByBucket = new Map<string, number>();
	for (const [key, mults] of byBucket) {
		if (mults.length < MIN_BUCKET_SAMPLE) continue;
		const sorted = [...mults].sort((a, b) => a - b);
		medianByBucket.set(key, median(sorted));
	}

	const analyzed = rows.flatMap<UndervaluedRow>((r) => {
		const rar = r.rarity ?? 'Unknown';
		const era = eraForDate(r.set_release_date);
		const med = medianByBucket.get(bucketKey(era, rar));
		if (med == null) return [];
		return [
			{
				card_id: r.card_id,
				name: r.name,
				set_name: r.set_name,
				set_release_date: r.set_release_date,
				card_number: r.card_number,
				rarity: r.rarity,
				era,
				image_small_url: r.image_small_url,
				raw_nm_price: r.raw_nm_price,
				psa10_price: r.psa10_price,
				actual_multiple: r.psa10_multiple,
				median_multiple: med,
				deviation_pct: ((r.psa10_multiple - med) / med) * 100,
				psa_pop_total: r.psa_pop_total
			}
		];
	});

	const cheapPsa10 = [...analyzed]
		.sort((a, b) => a.deviation_pct - b.deviation_pct)
		.slice(0, limit);
	const hotPsa10 = [...analyzed]
		.sort((a, b) => b.deviation_pct - a.deviation_pct)
		.slice(0, limit);

	return {
		cheapPsa10,
		hotPsa10,
		bucketsSampled: medianByBucket.size,
		cardsAnalyzed: analyzed.length
	};
}
