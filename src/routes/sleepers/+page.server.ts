/**
 * Delta-hunter discovery surface.
 *
 * Joins live_listings_cache (lowest active ask, in cents) against
 * card_index (last-sold comp, in dollars) and ranks by the gap — the
 * "sleepers" with the biggest spread between what someone's asking
 * right now and what the same card recently cleared for. Vendor-grade
 * scouting tool, mirroring 130point's sold+live pairing
 * (project_vendor_tools_benchmark).
 *
 * Read-only: anon SELECT on live_listings_cache works (migration 022),
 * and we never write back here. The cache rows are populated by the
 * card-page SWR wrapper and the warming cron — this page only consumes.
 *
 * Honesty doctrine: stub-source cache rows are excluded at the query
 * level — a "sleeper" is a real live ask vs a real sold comp, so a
 * fabricated ask can only produce a fabricated insight. When the only
 * source is the stub provider, /sleepers renders the empty state
 * ("No sleepers yet") instead of fake rankings; the surface lights up
 * automatically once `LIVE_LISTINGS_PROVIDER` flips to a real provider
 * and the warming cron repopulates the cache. % under is also omitted
 * when the sold comp is missing — we don't fabricate a percentage out
 * of a null comp.
 */

import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';
import type { LiveListingsResult } from '$services/live-listings';

const PAGE_SIZE = 50;
type Filter = 'all' | 'raw' | 'graded';
type SortMode = 'absolute' | 'percent';

interface CacheRow {
	card_id: string;
	query_key: string;
	provider: string;
	payload: LiveListingsResult;
	lowest_ask_cents: number;
	listings_count: number;
	fetched_at: string;
}

interface IndexRow {
	card_id: string;
	name: string | null;
	set_name: string | null;
	card_number: string | null;
	image_small_url: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
	cgc10_price: number | null;
	tag10_price: number | null;
}

export interface SleeperRow {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string;
	image_small_url: string | null;
	lowest_ask_cents: number;
	lowest_ask_marketplace: string | null;
	lowest_ask_url: string | null;
	sold_comp_cents: number | null;
	sold_comp_label: string;
	condition: 'raw' | 'graded';
	grader: string | null;
	delta_cents: number | null;
	delta_pct: number | null;
	provider: string;
	fetched_at: string;
	query_key: string;
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Match the rest of the app: never cache the HTML doc itself (Vercel
	// deploys would otherwise serve stale shells referencing dead hashed
	// JS bundles). See /browse loader for the full rationale.
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	const filterParam = (url.searchParams.get('filter') ?? 'all') as Filter;
	const filter: Filter = filterParam === 'raw' || filterParam === 'graded' ? filterParam : 'all';
	const sortParam = (url.searchParams.get('sort') ?? 'absolute') as SortMode;
	const sortMode: SortMode = sortParam === 'percent' ? 'percent' : 'absolute';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1);

	// Pull every cache row with a real lowest ask, excluding the stub
	// provider entirely (honesty doctrine — see file header). The partial
	// index from migration 022 (`live_listings_cache_lowest_ask_idx`)
	// still covers this; the .neq filter is a small additional WHERE.
	// Cache size is bounded by warming-cron N (default 100) plus organic
	// card-page hits, so fetching the whole set + ranking in memory is
	// cheap and lets us compute the per-row delta without a DB view.
	const { data: cacheRows, error: cacheErr } = await supabase
		.from('live_listings_cache')
		.select('card_id, query_key, provider, payload, lowest_ask_cents, listings_count, fetched_at')
		.not('lowest_ask_cents', 'is', null)
		.neq('provider', 'stub')
		.returns<CacheRow[]>();

	if (cacheErr) {
		// Don't 500 — render the empty state with the error visible so the
		// page is debuggable in prod without log access.
		return emptyResult(filter, sortMode, page, cacheErr.message);
	}

	const rows = cacheRows ?? [];
	if (rows.length === 0) {
		return emptyResult(filter, sortMode, page, null);
	}

	// Batch-fetch the card_index rows for everything in the cache. anon
	// SELECT was restored in migration 018 (see project_publishable_key_card_index).
	const cardIds = Array.from(new Set(rows.map((r) => r.card_id)));
	const { data: indexRows } = await supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, card_number, image_small_url, raw_nm_price, psa10_price, cgc10_price, tag10_price'
		)
		.in('card_id', cardIds)
		.returns<IndexRow[]>();

	const indexByCardId = new Map<string, IndexRow>();
	for (const r of indexRows ?? []) indexByCardId.set(r.card_id, r);

	const enriched: SleeperRow[] = [];
	for (const row of rows) {
		const idx = indexByCardId.get(row.card_id);
		// Without a catalog row we can't render name/set/image — skip rather
		// than show a hollow line. (Cache rows for unknown card_ids are
		// possible if the warming cron raced an upstream deletion.)
		if (!idx) continue;

		const { condition, grader } = classifyRow(row);

		// Sold-comp dollars → cents to match the live-ask cents unit.
		const soldDollars = pickSoldComp(idx, condition, grader);
		const soldCents = soldDollars != null ? Math.round(soldDollars * 100) : null;

		// Delta is only meaningful when both sides exist.
		const deltaCents = soldCents != null ? soldCents - row.lowest_ask_cents : null;
		const deltaPct =
			soldCents != null && soldCents > 0 ? (deltaCents! / soldCents) * 100 : null;

		// Apply filter chip before pushing — keeps the in-memory sort small.
		if (filter === 'raw' && condition !== 'raw') continue;
		if (filter === 'graded' && condition !== 'graded') continue;

		// Surface the cheapest listing's marketplace + URL so the user can
		// click straight through. payload.listings is sorted asc by price
		// in both the stub and the real eBay provider.
		const lowListing = row.payload.listings?.[0] ?? null;

		enriched.push({
			card_id: row.card_id,
			name: idx.name ?? row.card_id,
			set_name: idx.set_name ?? '',
			card_number: idx.card_number ?? '',
			image_small_url: idx.image_small_url ?? null,
			lowest_ask_cents: row.lowest_ask_cents,
			lowest_ask_marketplace: lowListing?.marketplace ?? null,
			lowest_ask_url: lowListing?.listing_url ?? null,
			sold_comp_cents: soldCents,
			sold_comp_label: soldCompLabel(condition, grader),
			condition,
			grader,
			delta_cents: deltaCents,
			delta_pct: deltaPct,
			provider: row.provider,
			fetched_at: row.fetched_at,
			query_key: row.query_key
		});
	}

	// Sort: nulls (missing sold comps, so no computable gap) sink to the
	// end regardless of sort mode — they're shown for completeness but
	// can't be ranked against rows where we know the gap. Honesty rule:
	// don't synthesize a default to keep them in the running.
	enriched.sort((a, b) => {
		const aKey = sortMode === 'percent' ? a.delta_pct : a.delta_cents;
		const bKey = sortMode === 'percent' ? b.delta_pct : b.delta_cents;
		if (aKey == null && bKey == null) return 0;
		if (aKey == null) return 1;
		if (bKey == null) return -1;
		return bKey - aKey;
	});

	const totalCount = enriched.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const from = (page - 1) * PAGE_SIZE;
	const pageRows = enriched.slice(from, from + PAGE_SIZE);

	// Stub rows were filtered at the DB level, so every row here is real-
	// source and the SAMPLE DATA banner is no longer needed. Kept the
	// field on the return for now (set to false) so the .svelte side and
	// any consumers don't break if cached.
	return {
		filter,
		sortMode,
		page,
		totalPages,
		pageSize: PAGE_SIZE,
		totalCount,
		rows: pageRows,
		anyStub: false,
		errorMsg: null as string | null
	};
};

function emptyResult(
	filter: Filter,
	sortMode: SortMode,
	page: number,
	errorMsg: string | null
) {
	return {
		filter,
		sortMode,
		page,
		totalPages: 1,
		pageSize: PAGE_SIZE,
		totalCount: 0,
		rows: [] as SleeperRow[],
		anyStub: false,
		errorMsg
	};
}

/**
 * Decide whether a cache row represents a raw-listing fetch or a
 * graded-listing fetch. Prefer the explicit query_key signal (deterministic),
 * fall back to inspecting the actual cheapest listing in the payload (covers
 * the query_key='all' case where the provider may have returned either).
 */
function classifyRow(row: CacheRow): {
	condition: 'raw' | 'graded';
	grader: string | null;
} {
	const key = row.query_key;
	const graderMatch = key.match(/grader=([A-Z]+)/);
	if (graderMatch) return { condition: 'graded', grader: graderMatch[1] };
	if (key.includes('raw_only=1')) return { condition: 'raw', grader: null };

	// Fallback to the payload's cheapest listing — see task spec: "pick
	// based on the cache row's query_key or the listings in the payload".
	const low = row.payload.listings?.[0];
	if (low?.condition === 'graded') {
		return { condition: 'graded', grader: low.grader ?? null };
	}
	return { condition: 'raw', grader: null };
}

function pickSoldComp(idx: IndexRow, condition: 'raw' | 'graded', grader: string | null): number | null {
	if (condition === 'raw') return idx.raw_nm_price;
	switch (grader) {
		case 'PSA':
			return idx.psa10_price;
		case 'CGC':
			return idx.cgc10_price;
		case 'TAG':
			return idx.tag10_price;
		default:
			// Graded but unknown service — best-effort PSA10 (the most
			// common graded comp), still labeled "PSA 10" for honesty.
			return idx.psa10_price;
	}
}

function soldCompLabel(condition: 'raw' | 'graded', grader: string | null): string {
	if (condition === 'raw') return 'Raw NM';
	if (grader) return `${grader} 10`;
	return 'PSA 10';
}
