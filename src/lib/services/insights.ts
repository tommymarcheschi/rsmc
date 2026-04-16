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

export interface SupplySqueezeRow {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string | null;
	rarity: string | null;
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
			'card_id, name, set_name, card_number, rarity, image_small_url, ' +
				'raw_nm_price, psa10_price, psa_pop_total, psa_pop_10, psa_gem_rate'
		)
		.gte('psa10_price', 100)
		.gte('psa_pop_total', 1)
		.lte('psa_pop_total', 200)
		.order('psa_pop_total', { ascending: true })
		.order('psa10_price', { ascending: false })
		.limit(limit);

	if (error || !data) return [];
	return data as SupplySqueezeRow[];
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
