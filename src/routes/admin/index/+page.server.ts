import { getSets } from '$services/tcg-api';
import { supabase } from '$services/supabase';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	// Fetch all sets from TCG API + tracked status from Supabase
	const [allSets, trackedResult, indexStatsResult] = await Promise.all([
		getSets().catch(() => []),
		supabase.from('tracked_sets').select('*'),
		supabase.from('card_index').select('set_id', { count: 'exact', head: false })
	]);

	const trackedMap = new Map<string, Record<string, unknown>>();
	for (const row of trackedResult.data ?? []) {
		trackedMap.set(row.set_id, row);
	}

	// Count indexed cards per set
	const { data: indexedPerSet } = await supabase
		.rpc('count_by_group', undefined)
		.select('*');

	// Fallback: count total indexed
	const totalIndexed = indexStatsResult.count ?? 0;

	const sets = allSets.map((s) => {
		const tracked = trackedMap.get(s.id);
		return {
			id: s.id,
			name: s.name,
			series: s.series,
			releaseDate: s.releaseDate,
			totalCards: s.total,
			tracked: !!tracked,
			enabled: tracked ? (tracked.enabled as boolean) : false,
			lastIndexedAt: tracked?.last_indexed_at as string | null ?? null,
			lastIndexDuration: tracked?.last_index_duration_ms as number | null ?? null,
			lastIndexError: tracked?.last_index_error as string | null ?? null
		};
	});

	return {
		sets,
		totalIndexed,
		totalTracked: trackedMap.size
	};
};

export const actions: Actions = {
	toggle: async ({ request }) => {
		const form = await request.formData();
		const setId = form.get('set_id') as string;
		const setName = form.get('set_name') as string;
		const series = form.get('series') as string;
		const releaseDate = form.get('release_date') as string;
		const totalCards = parseInt(form.get('total_cards') as string) || 0;
		const enable = form.get('enable') === '1';

		if (enable) {
			await supabase.from('tracked_sets').upsert(
				{
					set_id: setId,
					set_name: setName,
					series: series || null,
					release_date: releaseDate,
					total_cards: totalCards,
					enabled: true
				},
				{ onConflict: 'set_id' }
			);
		} else {
			await supabase
				.from('tracked_sets')
				.update({ enabled: false })
				.eq('set_id', setId);
		}

		return { success: true };
	},

	bulkAdd: async ({ request }) => {
		const form = await request.formData();
		const beforeYear = parseInt(form.get('before_year') as string);
		if (isNaN(beforeYear)) return { success: false };

		const allSets = await getSets().catch(() => []);
		const matching = allSets.filter((s) => {
			const year = parseInt(s.releaseDate?.split('/')[0] ?? s.releaseDate?.split('-')[0] ?? '9999');
			return year < beforeYear;
		});

		for (const s of matching) {
			await supabase.from('tracked_sets').upsert(
				{
					set_id: s.id,
					set_name: s.name,
					series: s.series ?? null,
					release_date: s.releaseDate,
					total_cards: s.total,
					enabled: true
				},
				{ onConflict: 'set_id' }
			);
		}

		return { success: true, count: matching.length };
	}
};
