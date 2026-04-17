import { getSets } from '$services/tcg-api';
import { supabase } from '$services/supabase';
import { healSet, type TrackedSetRow } from '$services/auto-heal';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	const STALE_DAYS = 7;
	const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

	// Pull everything in parallel. tracked_sets SELECT * tolerates missing
	// migration 013 columns — `.tcgplayer_set_name` just reads as undefined.
	const [allSetsRes, trackedRes, indexCountsRes, pricedCountsRes, staleCountsRes] =
		await Promise.all([
			getSets().catch(() => []),
			supabase.from('tracked_sets').select('*'),
			// card_index row count per set (for coverage ratio)
			supabase.from('card_index').select('set_id', { count: 'exact' }),
			// priced row count per set — ask for rows with either raw or tcg price
			supabase
				.from('card_index')
				.select('set_id')
				.not('raw_nm_price', 'is', null),
			// stale row count per set
			supabase
				.from('card_index')
				.select('set_id')
				.lt('last_enriched_at', staleThreshold)
		]);

	const allSets = allSetsRes;
	const trackedMap = new Map<string, Record<string, unknown>>();
	for (const row of trackedRes.data ?? []) {
		trackedMap.set(row.set_id, row);
	}

	// Aggregate per-set counts from the flat selects.
	const indexedCounts = new Map<string, number>();
	for (const row of ((indexCountsRes.data ?? []) as Array<{ set_id: string }>)) {
		indexedCounts.set(row.set_id, (indexedCounts.get(row.set_id) ?? 0) + 1);
	}
	const pricedCounts = new Map<string, number>();
	for (const row of ((pricedCountsRes.data ?? []) as Array<{ set_id: string }>)) {
		pricedCounts.set(row.set_id, (pricedCounts.get(row.set_id) ?? 0) + 1);
	}
	const staleCounts = new Map<string, number>();
	for (const row of ((staleCountsRes.data ?? []) as Array<{ set_id: string }>)) {
		staleCounts.set(row.set_id, (staleCounts.get(row.set_id) ?? 0) + 1);
	}

	const sets = allSets.map((s) => {
		const tracked = trackedMap.get(s.id) as Record<string, unknown> | undefined;
		const indexed = indexedCounts.get(s.id) ?? 0;
		const priced = pricedCounts.get(s.id) ?? 0;
		const stale = staleCounts.get(s.id) ?? 0;
		return {
			id: s.id,
			name: s.name,
			series: s.series,
			releaseDate: s.releaseDate,
			totalCards: s.total,
			tracked: !!tracked,
			enabled: tracked ? (tracked.enabled as boolean) : false,
			lastIndexedAt: (tracked?.last_indexed_at as string | null) ?? null,
			lastIndexDuration: (tracked?.last_index_duration_ms as number | null) ?? null,
			lastIndexError: (tracked?.last_index_error as string | null) ?? null,
			tcgplayerSlug: (tracked?.tcgplayer_set_name as string | null) ?? null,
			tcgplayerLastBackfilledAt:
				(tracked?.tcgplayer_last_backfilled_at as string | null) ?? null,
			indexed,
			priced,
			stale,
			coveragePct: s.total > 0 ? Math.round((indexed / s.total) * 100) : 0,
			pricedPct: indexed > 0 ? Math.round((priced / indexed) * 100) : 0
		};
	});

	// Sort tracked first, then by coverage gap (biggest first), then by release desc.
	sets.sort((a, b) => {
		if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
		const gapA = a.enabled ? Math.max(0, a.totalCards - a.indexed) : 0;
		const gapB = b.enabled ? Math.max(0, b.totalCards - b.indexed) : 0;
		if (gapA !== gapB) return gapB - gapA;
		return b.releaseDate.localeCompare(a.releaseDate);
	});

	const totalIndexed = Array.from(indexedCounts.values()).reduce((s, n) => s + n, 0);
	const totalPriced = Array.from(pricedCounts.values()).reduce((s, n) => s + n, 0);
	const totalStale = Array.from(staleCounts.values()).reduce((s, n) => s + n, 0);

	const trackedSets = sets.filter((s) => s.enabled);
	const trackedWithGap = trackedSets.filter((s) => s.indexed < s.totalCards).length;
	const trackedWithSlug = trackedSets.filter((s) => s.tcgplayerSlug).length;

	return {
		sets,
		stats: {
			totalTracked: trackedSets.length,
			totalIndexed,
			totalPriced,
			totalStale,
			pricedPct: totalIndexed > 0 ? Math.round((totalPriced / totalIndexed) * 100) : 0,
			stalePct: totalIndexed > 0 ? Math.round((totalStale / totalIndexed) * 100) : 0,
			trackedWithGap,
			trackedWithSlug
		}
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
			await supabase.from('tracked_sets').update({ enabled: false }).eq('set_id', setId);
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
	},

	heal: async ({ request }) => {
		const form = await request.formData();
		const setId = (form.get('set_id') ?? '').toString();
		const force = form.get('force') === '1';
		if (!setId) return fail(400, { action: 'heal', message: 'Missing set_id' });

		const { data: tracked, error: readErr } = await supabase
			.from('tracked_sets')
			.select('set_id, set_name, release_date, tcgplayer_set_name, tcgplayer_last_backfilled_at')
			.eq('set_id', setId)
			.maybeSingle();
		if (readErr || !tracked) {
			return fail(404, { action: 'heal', message: readErr?.message ?? 'Set not tracked' });
		}

		const report = await healSet(supabase, tracked as TrackedSetRow, { force });
		return { action: 'heal', success: !report.error, setId, report };
	}
};
