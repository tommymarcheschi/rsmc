import { supabase } from '$services/supabase';
import { AXES, LENSES, LENS_KEYS, type LensKey } from '$services/lenses';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 60;

// Self-contained sort whitelist — deliberately NOT wired through
// sort.ts (that module is tightly coupled to browse modes + /api/cards;
// rankings owns its own column set). Every entry is an indexed score
// column from migration 017.
const SORT_COLUMNS = new Set<string>([
	...AXES.map((a) => a.column),
	...LENS_KEYS.map((k) => LENSES[k].column)
]);

const SELECT_COLS = [
	'card_id', 'name', 'set_id', 'set_name', 'card_number', 'rarity',
	'image_small_url', 'raw_nm_price', 'psa10_price',
	...AXES.map((a) => a.column),
	...LENS_KEYS.map((k) => LENSES[k].column),
	'ranking_confidence', 'ranked_at'
].join(', ');

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, max-age=120' });

	const q = url.searchParams.get('q')?.trim() ?? '';
	const setId = url.searchParams.get('set')?.trim() ?? '';
	const lensParam = (url.searchParams.get('lens') ?? 'investor') as LensKey;
	const lens: LensKey = LENS_KEYS.includes(lensParam) ? lensParam : 'investor';
	const confidence = url.searchParams.get('confidence') ?? 'all'; // all | high | nolow
	const requested = url.searchParams.get('sort') ?? '';
	// Default sort follows the active lens composite.
	const sortCol = SORT_COLUMNS.has(requested) ? requested : LENSES[lens].column;
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1);

	let query = supabase
		.from('card_index')
		.select(SELECT_COLS, { count: 'exact' });

	if (q) query = query.ilike('name', `%${q}%`);
	if (setId) query = query.eq('set_id', setId);
	if (confidence === 'high') query = query.eq('ranking_confidence', 'high');
	else if (confidence === 'nolow') query = query.in('ranking_confidence', ['high', 'medium']);

	// Thin-data cards (no score for the sorted column) sink to the end —
	// shown, never hidden (north star pillar #9).
	query = query.order(sortCol, { ascending: false, nullsFirst: false });
	query = query.order('card_id', { ascending: true }); // stable tiebreak

	const from = (page - 1) * PAGE_SIZE;
	query = query.range(from, from + PAGE_SIZE - 1);

	let rows: Record<string, unknown>[] = [];
	let count = 0;
	let rankingsReady = true;
	let degradeMsg = '';

	try {
		const res = await query;
		if (res.error) {
			rankingsReady = false;
			degradeMsg = res.error.message;
		} else {
			rows = (res.data ?? []) as unknown as Record<string, unknown>[];
			count = res.count ?? 0;
			// Migration 017 applied but rank-cards never run yet.
			if (count > 0 && rows.every((r) => r.ranked_at == null)) {
				rankingsReady = false;
				degradeMsg = 'Ranking columns exist but scores have not been computed yet — run scripts/rank-cards.ts.';
			}
		}
	} catch (e) {
		rankingsReady = false;
		degradeMsg = e instanceof Error ? e.message : 'card_index unavailable';
	}

	const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

	return {
		rows,
		count,
		page,
		totalPages,
		pageSize: PAGE_SIZE,
		q,
		setId,
		lens,
		sortCol,
		confidence,
		rankingsReady,
		degradeMsg,
		lenses: LENS_KEYS.map((k) => ({
			key: k,
			label: LENSES[k].label,
			column: LENSES[k].column,
			blurb: LENSES[k].blurb
		})),
		axes: AXES.map((a) => ({ key: a.key, label: a.label, column: a.column, hint: a.hint }))
	};
};
