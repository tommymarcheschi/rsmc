import { json } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

/**
 * Lightweight card lookup for the ⌘K command palette. Reads straight
 * from card_index so responses stay fast even on cold cache — full text
 * search against name + set_name with case-insensitive LIKE (not fuzzy,
 * no Postgres full-text index yet). Good enough for 25k rows; if
 * perceived latency degrades we can bolt on a trigram index later.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ results: [] });

	const safe = q.replace(/[%_]/g, (c) => `\\${c}`);
	const { data, error } = await supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, card_number, rarity, image_small_url, raw_nm_price, psa10_price'
		)
		// Rank cards whose NAME matches higher than cards whose set matches.
		// Postgres OR isn't sortable by branch directly — two queries would
		// be cleaner but this is cheap enough to do in one pass and sort
		// client-side.
		.or(`name.ilike.%${safe}%,set_name.ilike.%${safe}%`)
		.limit(25);

	if (error) return json({ results: [], error: error.message });

	type Row = {
		card_id: string;
		name: string;
		set_name: string;
		card_number: string | null;
		rarity: string | null;
		image_small_url: string | null;
		raw_nm_price: number | null;
		psa10_price: number | null;
	};
	const lower = q.toLowerCase();
	const scored = ((data ?? []) as Row[])
		.map((r) => {
			const nameMatch = r.name.toLowerCase().includes(lower);
			const nameStarts = r.name.toLowerCase().startsWith(lower);
			let score = 0;
			if (nameStarts) score += 100;
			else if (nameMatch) score += 50;
			if (r.set_name.toLowerCase().includes(lower)) score += 10;
			// Break ties by price desc — people usually want the chase.
			score += Math.min(20, (r.raw_nm_price ?? 0) / 50);
			return { ...r, score };
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 10);

	return json({
		results: scored.map(({ score: _score, ...rest }) => rest)
	});
};
