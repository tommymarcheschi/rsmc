import { getSets, searchCards } from '$services/tcg-api';
import { applyClientSort, applyEnrichedSort, resolveSortOption, resolveSortOrderBy } from '$services/sort';
import { enrichCardsWithPriceCharting } from '$services/enrich';
import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';
import type { PokemonCard } from '$types';
import type { EnrichedCard } from '$services/sort';

const INITIAL_PAGE_SIZE = 24;
// When a client-side or enriched sort mode is active we fetch a bigger
// slice up front (TCG API max is 250) and do the filter + sort in memory.
// Infinite scroll is naturally disabled because the full result set is
// on the page. For enriched mode (PriceCharting lookups) we cap at 100
// to stay within the 30s serverless budget.
const CLIENT_SORT_PAGE_SIZE = 250;
const ENRICHED_SORT_PAGE_SIZE = 100;
const HUNT_PAGE_SIZE = 24;

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Do NOT cache the HTML document. The HTML references hashed JS bundles
	// (`_app/immutable/entry/*.{hash}.js`), and when Vercel promotes a new
	// deployment the old hashes 404. A browser holding cached HTML from a
	// previous deploy then fails to hydrate — the page renders, but every
	// interaction is a no-op because `kit.start()` never runs. ETag-based
	// revalidation (`no-cache` + must-revalidate) keeps reloads fast while
	// guaranteeing the browser always checks with the server first.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	const mode = url.searchParams.get('mode') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const rarity = url.searchParams.get('rarity') ?? '';
	const sort = url.searchParams.get('sort') ?? '';
	const sortOption = resolveSortOption(sort, mode);
	const orderBy = resolveSortOrderBy(sort);
	const isClientSort = sortOption.kind === 'client';
	const isEnrichedSort = sortOption.kind === 'enriched';
	const isHuntMode = mode === 'hunt';

	// ─── Hunt Mode: query card_index in Supabase ─────────────────────
	if (isHuntMode) {
		return loadHuntMode(url, setHeaders);
	}

	// ─── Default Mode: live TCG API ──────────────────────────────────
	const pageSize = isEnrichedSort
		? ENRICHED_SORT_PAGE_SIZE
		: isClientSort
			? CLIENT_SORT_PAGE_SIZE
			: INITIAL_PAGE_SIZE;

	// Build the TCG API query from the current filters. If no filters are
	// applied, default to the newest set (first in the release-sorted list).
	const sets = await getSets().catch(() => []);

	function buildQuery(): string {
		const parts: string[] = [];
		if (search) parts.push(`name:"${search}*"`);
		if (set) parts.push(`set.id:${set}`);
		if (type) parts.push(`types:${type}`);
		if (rarity) parts.push(`rarity:"${rarity}"`);
		if (parts.length > 0) return parts.join(' ');
		const latestSetId = sets[0]?.id;
		return latestSetId ? `set.id:${latestSetId}` : '';
	}

	// Server-render the first page of cards so /browse works without any
	// client-side JS. Clients with JS still get infinite scroll on top of
	// this baseline via /api/cards. The retry + timeout budget in tcg-api.ts
	// keeps this well under Vercel's 30s function limit.
	const query = buildQuery();
	let initialCards: PokemonCard[] | EnrichedCard[] = [];
	let totalCount = 0;
	let hiddenByClientSort = 0;
	if (query) {
		try {
			const result = await searchCards(query, 1, pageSize, orderBy);
			if (isEnrichedSort) {
				// Enrich cards with PriceCharting data, then sort.
				const enriched = await enrichCardsWithPriceCharting(result.data);
				initialCards = applyEnrichedSort(enriched, sort);
				totalCount = initialCards.length;
				hiddenByClientSort = result.data.length - initialCards.length;
			} else if (isClientSort) {
				// Apply the in-memory sort + filter. totalCount becomes the
				// size of the filtered list so the client doesn't try to
				// infinite-scroll past it.
				initialCards = applyClientSort(result.data, sort);
				totalCount = initialCards.length;
				hiddenByClientSort = result.data.length - initialCards.length;
			} else {
				initialCards = result.data;
				totalCount = result.totalCount;
			}
		} catch {
			// Swallow — the client will retry via /api/cards on hydration.
		}
	}

	return {
		mode: mode || 'default',
		sets,
		filters: { search, set, type, rarity, sort },
		activeFilters: buildDefaultPills(url, { search, set, type, rarity }, sets),
		initialCards,
		initialTotalCount: totalCount,
		clientSort: isClientSort || isEnrichedSort,
		hiddenByClientSort
	};
};

// ─────────────────────────────────────────────────────────────────────────────
// Active-filter pill builders (Tier 3.13)
//
// One canonical place to compute the removable-chip list per mode.
// Each pill has a label (what the user sees) and a removeHref that drops
// the matching filter from the URL — works without JS because it's just
// an <a> link the page re-renders from.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterPill {
	label: string;
	removeHref: string;
}

function hrefWithout(
	url: URL,
	mutate: (params: URLSearchParams) => void
): string {
	const next = new URLSearchParams(url.searchParams);
	mutate(next);
	// Reset pagination when filters change.
	next.delete('page');
	const qs = next.toString();
	return qs ? `${url.pathname}?${qs}` : url.pathname;
}

function dropParam(url: URL, key: string): string {
	return hrefWithout(url, (p) => p.delete(key));
}

function dropValueFromList(url: URL, key: string, value: string): string {
	return hrefWithout(url, (p) => {
		const list = (p.get(key) ?? '').split(',').filter((v) => v && v !== value);
		if (list.length) p.set(key, list.join(','));
		else p.delete(key);
	});
}

function buildDefaultPills(
	url: URL,
	f: { search: string; set: string; type: string; rarity: string },
	sets: Array<{ id: string; name: string }>
): FilterPill[] {
	const pills: FilterPill[] = [];
	if (f.search) pills.push({ label: `Search: ${f.search}`, removeHref: dropParam(url, 'q') });
	if (f.set) {
		const name = sets.find((s) => s.id === f.set)?.name ?? f.set;
		pills.push({ label: `Set: ${name}`, removeHref: dropParam(url, 'set') });
	}
	if (f.type) pills.push({ label: `Type: ${f.type}`, removeHref: dropParam(url, 'type') });
	if (f.rarity) pills.push({ label: `Rarity: ${f.rarity}`, removeHref: dropParam(url, 'rarity') });
	return pills;
}

const VARIANT_LABELS: Record<string, string> = {
	holo: 'Holo',
	reverse: 'Reverse Holo'
};

function buildHuntPills(
	url: URL,
	sets: Array<{ id: string; name: string }>
): FilterPill[] {
	const p = url.searchParams;
	const pills: FilterPill[] = [];
	const q = p.get('q');
	if (q) pills.push({ label: `Search: ${q}`, removeHref: dropParam(url, 'q') });
	const set = p.get('set');
	if (set) {
		const name = sets.find((s) => s.id === set)?.name ?? set;
		pills.push({ label: `Set: ${name}`, removeHref: dropParam(url, 'set') });
	}
	const popLt = p.get('pop_lt');
	if (popLt) pills.push({ label: `Max pop ${popLt}`, removeHref: dropParam(url, 'pop_lt') });
	const before = p.get('before');
	if (before) pills.push({ label: `Before ${before}`, removeHref: dropParam(url, 'before') });
	const after = p.get('after');
	if (after) pills.push({ label: `After ${after}`, removeHref: dropParam(url, 'after') });
	const rawGt = p.get('raw_gt');
	if (rawGt) pills.push({ label: `Raw ≥ $${rawGt}`, removeHref: dropParam(url, 'raw_gt') });
	const rawLt = p.get('raw_lt');
	if (rawLt) pills.push({ label: `Raw ≤ $${rawLt}`, removeHref: dropParam(url, 'raw_lt') });
	const rarityLike = p.get('rarity_like');
	if (rarityLike) {
		pills.push({ label: `Rarity ~ "${rarityLike}"`, removeHref: dropParam(url, 'rarity_like') });
	}
	const variants = (p.get('variants') ?? '').split(',').filter(Boolean);
	for (const v of variants) {
		pills.push({
			label: VARIANT_LABELS[v] ?? v,
			removeHref: dropValueFromList(url, 'variants', v)
		});
	}
	if (p.get('require_psa10') === '1') {
		pills.push({ label: 'Has PSA 10', removeHref: dropParam(url, 'require_psa10') });
	}
	return pills;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hunt Mode loader — queries card_index in Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function loadHuntMode(url: URL, _setHeaders: (headers: Record<string, string>) => void) {
	// Cache headers already set by the parent load function.

	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const sort = url.searchParams.get('sort') ?? '';
	const popLt = url.searchParams.get('pop_lt');
	const before = url.searchParams.get('before');
	const after = url.searchParams.get('after');
	const variants = url.searchParams.get('variants') ?? '';
	const rawLt = url.searchParams.get('raw_lt');
	const rawGt = url.searchParams.get('raw_gt');
	const rarityLike = url.searchParams.get('rarity_like') ?? '';
	const requirePsa10 = url.searchParams.get('require_psa10') === '1';
	const page = parseInt(url.searchParams.get('page') ?? '1');

	const sortOption = resolveSortOption(sort, 'hunt');

	// Build the Supabase query
	let query = supabase
		.from('card_index')
		.select('*', { count: 'exact' });

	if (search) {
		query = query.ilike('name', `%${search}%`);
	}
	if (set) {
		query = query.eq('set_id', set);
	}
	if (popLt) {
		query = query.lt('combined_pop_total', parseInt(popLt));
	}
	if (before) {
		query = query.lt('set_release_date', `${before}-01-01`);
	}
	if (after) {
		query = query.gte('set_release_date', `${after}-01-01`);
	}
	if (variants) {
		const variantList = variants.split(',');
		if (variantList.includes('holo') && variantList.includes('reverse')) {
			query = query.or('has_holofoil.eq.true,has_reverse_holofoil.eq.true');
		} else if (variantList.includes('holo')) {
			query = query.eq('has_holofoil', true);
		} else if (variantList.includes('reverse')) {
			query = query.eq('has_reverse_holofoil', true);
		}
	}
	if (rawLt) {
		query = query.lt('raw_nm_price', parseFloat(rawLt));
	}
	if (rawGt) {
		query = query.gt('raw_nm_price', parseFloat(rawGt));
	}
	if (requirePsa10) {
		query = query.not('psa10_price', 'is', null);
	}
	if (rarityLike) {
		query = query.ilike('rarity', `%${rarityLike}%`);
	}

	// Apply sort
	if (sortOption.kind === 'index' && sortOption.indexColumn) {
		query = query.order(sortOption.indexColumn, {
			ascending: sortOption.indexDirection === 'asc',
			nullsFirst: sortOption.indexNulls === 'first'
		});
	} else {
		query = query.order('psa10_delta', { ascending: false, nullsFirst: false });
	}

	// Paginate
	const from = (page - 1) * HUNT_PAGE_SIZE;
	query = query.range(from, from + HUNT_PAGE_SIZE - 1);

	let rows: Record<string, unknown>[] | null = null;
	let count: number | null = 0;
	let queryError: { message: string } | null = null;

	try {
		const result = await query;
		rows = result.data;
		count = result.count;
		queryError = result.error;
	} catch (e) {
		// Table doesn't exist yet (migration not applied) — degrade gracefully
		queryError = { message: e instanceof Error ? e.message : 'card_index table not found' };
	}

	if (queryError) {
		console.error('Hunt mode query error:', queryError.message);
	}

	// Map card_index rows to a shape the card grid can render
	const initialCards = (rows ?? []).map((row: Record<string, unknown>) => ({
		id: row.card_id as string,
		name: row.name as string,
		supertype: (row.supertype as string) ?? 'Pokémon',
		subtypes: (row.subtypes as string[]) ?? [],
		types: (row.types as string[]) ?? [],
		set: {
			id: row.set_id as string,
			name: row.set_name as string,
			series: (row.set_series as string) ?? '',
			printedTotal: 0,
			total: 0,
			releaseDate: (row.set_release_date as string) ?? '',
			images: { symbol: '', logo: '' }
		},
		number: (row.card_number as string) ?? '',
		artist: (row.artist as string) ?? undefined,
		rarity: (row.rarity as string) ?? undefined,
		images: {
			small: (row.image_small_url as string) ?? '',
			large: (row.image_large_url as string) ?? ''
		},
		_enrichment: {
			raw_nm_price: row.raw_nm_price as number | null,
			raw_source: row.raw_source as string | null,
			psa10_price: row.psa10_price as number | null,
			psa10_delta: row.psa10_delta as number | null,
			psa10_multiple: row.psa10_multiple as number | null,
			psa_pop_total: row.psa_pop_total as number | null,
			cgc_pop_total: row.cgc_pop_total as number | null,
			combined_pop_total: row.combined_pop_total as number,
			pcUrl: null
		}
	}));

	// Get tracked sets for the filter dropdown
	let trackedSets: Record<string, unknown>[] | null = null;
	try {
		const result = await supabase
			.from('tracked_sets')
			.select('set_id, set_name, release_date')
			.eq('enabled', true)
			.order('release_date', { ascending: false });
		trackedSets = result.data;
	} catch {
		// Table doesn't exist yet
	}

	const mappedSets = (trackedSets ?? []).map((s: Record<string, unknown>) => ({
		id: s.set_id as string,
		name: s.set_name as string,
		series: '',
		printedTotal: 0,
		total: 0,
		releaseDate: (s.release_date as string) ?? '',
		images: { symbol: '', logo: '' }
	}));

	return {
		mode: 'hunt' as const,
		sets: mappedSets,
		filters: {
			search,
			set,
			type: '',
			rarity: '',
			sort,
			popLt: popLt ?? '',
			before: before ?? '',
			after: after ?? '',
			variants,
			rawLt: rawLt ?? '',
			rawGt: rawGt ?? '',
			requirePsa10: requirePsa10 ? '1' : ''
		},
		activeFilters: buildHuntPills(url, mappedSets),
		initialCards,
		initialTotalCount: count ?? 0,
		clientSort: false,
		hiddenByClientSort: 0
	};
}
