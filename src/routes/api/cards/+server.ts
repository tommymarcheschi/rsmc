import { json } from '@sveltejs/kit';
import { searchCards, getSets } from '$services/tcg-api';
import { applyClientSort, applyEnrichedSort, resolveSortOption, resolveSortOrderBy } from '$services/sort';
import { enrichCardsWithPriceCharting } from '$services/enrich';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

const HUNT_PAGE_SIZE = 24;

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('mode');

	// ─── Hunt Mode: query card_index in Supabase ─────────────────────
	if (mode === 'hunt') {
		return handleHuntMode(url);
	}

	// ─── Default Mode: live TCG API ──────────────────────────────────
	let query = url.searchParams.get('q');
	const sortParam = url.searchParams.get('sort');
	const sortOption = resolveSortOption(sortParam);
	const isClientSort = sortOption.kind === 'client';
	const isEnrichedSort = sortOption.kind === 'enriched';

	const page = parseInt(url.searchParams.get('page') ?? '1');
	// Client-side sort modes always return the full filtered set in one
	// shot (up to the TCG API's 250 cap) so infinite scroll has nothing to
	// request. For api-kind sorts the caller picks the page size.
	const pageSize = isEnrichedSort
		? 100
		: isClientSort
			? 250
			: parseInt(url.searchParams.get('pageSize') ?? '24');
	const orderBy = resolveSortOrderBy(sortParam);

	// When no query is supplied, default to the latest set (sorted by release date).
	if (!query) {
		try {
			const sets = await getSets();
			const latest = sets[0];
			query = latest ? `set.id:${latest.id}` : '';
		} catch {
			query = '';
		}
	}

	if (!query) {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}

	try {
		const result = await searchCards(query, page, pageSize, orderBy);

		if (isEnrichedSort) {
			const enriched = await enrichCardsWithPriceCharting(result.data);
			const filtered = applyEnrichedSort(enriched, sortParam);
			return json(
				{
					data: filtered,
					totalCount: filtered.length,
					page: 1,
					pageSize: filtered.length,
					count: filtered.length
				},
				{ headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' } }
			);
		}

		if (isClientSort) {
			const filtered = applyClientSort(result.data, sortParam);
			return json(
				{
					data: filtered,
					totalCount: filtered.length,
					page: 1,
					pageSize: filtered.length,
					count: filtered.length
				},
				{ headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' } }
			);
		}
		return json(result, {
			headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' }
		});
	} catch {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}
};

// ─── Hunt Mode handler ───────────────────────────────────────────────────────

async function handleHuntMode(url: URL) {
	const search = url.searchParams.get('q') ?? '';
	const set = url.searchParams.get('set') ?? '';
	const sort = url.searchParams.get('sort') ?? '';
	const popLt = url.searchParams.get('pop_lt');
	const before = url.searchParams.get('before');
	const after = url.searchParams.get('after');
	const variants = url.searchParams.get('variants') ?? '';
	const rawLt = url.searchParams.get('raw_lt');
	const rawGt = url.searchParams.get('raw_gt');
	const requirePsa10 = url.searchParams.get('require_psa10') === '1';
	const page = parseInt(url.searchParams.get('page') ?? '1');

	const sortOption = resolveSortOption(sort, 'hunt');

	let query = supabase
		.from('card_index')
		.select('*', { count: 'exact' });

	if (search) query = query.ilike('name', `%${search}%`);
	if (set) query = query.eq('set_id', set);
	if (popLt) query = query.lt('combined_pop_total', parseInt(popLt));
	if (before) query = query.lt('set_release_date', `${before}-01-01`);
	if (after) query = query.gte('set_release_date', `${after}-01-01`);
	if (variants) {
		const vl = variants.split(',');
		if (vl.includes('holo') && vl.includes('reverse')) {
			query = query.or('has_holofoil.eq.true,has_reverse_holofoil.eq.true');
		} else if (vl.includes('holo')) {
			query = query.eq('has_holofoil', true);
		} else if (vl.includes('reverse')) {
			query = query.eq('has_reverse_holofoil', true);
		}
	}
	if (rawLt) query = query.lt('raw_nm_price', parseFloat(rawLt));
	if (rawGt) query = query.gt('raw_nm_price', parseFloat(rawGt));
	if (requirePsa10) query = query.not('psa10_price', 'is', null);

	if (sortOption.kind === 'index' && sortOption.indexColumn) {
		query = query.order(sortOption.indexColumn, {
			ascending: sortOption.indexDirection === 'asc',
			nullsFirst: sortOption.indexNulls === 'first'
		});
	} else {
		query = query.order('psa10_delta', { ascending: false, nullsFirst: false });
	}

	const from = (page - 1) * HUNT_PAGE_SIZE;
	query = query.range(from, from + HUNT_PAGE_SIZE - 1);

	const { data: rows, count } = await query;

	const data = (rows ?? []).map((row: Record<string, unknown>) => ({
		id: row.card_id,
		name: row.name,
		supertype: row.supertype ?? 'Pokémon',
		subtypes: row.subtypes ?? [],
		types: row.types ?? [],
		set: {
			id: row.set_id,
			name: row.set_name,
			series: row.set_series ?? '',
			printedTotal: 0,
			total: 0,
			releaseDate: row.set_release_date ?? '',
			images: { symbol: '', logo: '' }
		},
		number: row.card_number ?? '',
		artist: row.artist ?? undefined,
		rarity: row.rarity ?? undefined,
		images: {
			small: row.image_small_url ?? '',
			large: row.image_large_url ?? ''
		},
		_enrichment: {
			raw_nm_price: row.raw_nm_price,
			raw_source: row.raw_source,
			psa10_price: row.psa10_price,
			psa10_delta: row.psa10_delta,
			psa10_multiple: row.psa10_multiple,
			psa_pop_total: row.psa_pop_total,
			tag_pop_total: row.tag_pop_total,
			combined_pop_total: row.combined_pop_total,
			pcUrl: null
		}
	}));

	return json(
		{ data, totalCount: count ?? 0, page, pageSize: HUNT_PAGE_SIZE, count: data.length },
		{ headers: { 'cache-control': 'private, max-age=60' } }
	);
}
