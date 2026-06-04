import { supabase } from '$services/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

// Same columns the ⌘K palette + /api/search return, so the JS autosuggest
// path and this no-JS server fallback render identical card rows.
const SELECT = 'card_id, name, set_name, card_number, rarity, image_small_url, raw_nm_price';

export interface CardLite {
	card_id: string;
	name: string;
	set_name: string | null;
	card_number: string | null;
	rarity: string | null;
	image_small_url: string | null;
	raw_nm_price: number | null;
}

/**
 * Dedicated "add a card" search page — replaces the old in-page modal that
 * searched the flaky pokemontcg.io API (it 404'd/timed out and surfaced an
 * error). Search now reads straight from card_index (fast, always-on), the
 * same source the ⌘K palette uses.
 *
 * The page is JS-enhanced with live typeahead (see +page.svelte) but also
 * works without JS: `?q=<term>` runs the search server-side here and
 * `?card=<id>` pre-selects a card so the add form renders on the same load.
 */
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Never cache the document — same rationale as /collection (cached HTML
	// referencing deleted immutable JS hashes breaks hydration post-deploy).
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	const q = (url.searchParams.get('q') ?? '').trim();
	const cardId = (url.searchParams.get('card') ?? '').trim();

	let results: CardLite[] = [];
	if (q.length >= 2) {
		const safe = q.replace(/[%_]/g, (c) => `\\${c}`);
		const { data } = await supabase
			.from('card_index')
			.select(SELECT)
			.or(`name.ilike.%${safe}%,set_name.ilike.%${safe}%`)
			.limit(10);
		results = (data ?? []) as CardLite[];
	}

	let selected: CardLite | null = null;
	if (cardId) {
		const { data } = await supabase
			.from('card_index')
			.select(SELECT)
			.eq('card_id', cardId)
			.maybeSingle();
		selected = (data ?? null) as CardLite | null;
	}

	return { q, results, selected };
};

/**
 * addEntry mirrors /collection's old addEntry (same dedupe-on-(card_id,
 * condition) rule as the /api/collection POST handler) but lives here so the
 * add form submits in-place. On success it redirects back to /collection —
 * "take me back to my collection once the card is added".
 */
export const actions: Actions = {
	addEntry: async ({ request }) => {
		const form = await request.formData();
		const cardId = (form.get('card_id') ?? '').toString().trim();
		if (!cardId) return fail(400, { message: 'Card is required' });

		const conditionRaw = (form.get('condition') ?? 'NM').toString();
		const condition = ['NM', 'LP', 'MP', 'HP', 'DMG'].includes(conditionRaw) ? conditionRaw : 'NM';

		const quantityRaw = parseInt((form.get('quantity') ?? '1').toString(), 10);
		const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

		const priceRaw = (form.get('purchase_price') ?? '').toString().trim();
		const purchasePrice = priceRaw ? parseFloat(priceRaw) : null;

		const dateRaw = (form.get('purchase_date') ?? '').toString().trim();
		const purchaseDate = dateRaw || null;

		const notesRaw = (form.get('notes') ?? '').toString().trim();
		const notes = notesRaw || null;

		const { data: existing } = await supabase
			.from('collection')
			.select('id, quantity')
			.eq('card_id', cardId)
			.eq('condition', condition)
			.maybeSingle();

		if (existing) {
			const { error: err } = await supabase
				.from('collection')
				.update({ quantity: existing.quantity + quantity })
				.eq('id', existing.id);
			if (err) return fail(500, { message: err.message });
		} else {
			const { error: err } = await supabase.from('collection').insert({
				card_id: cardId,
				quantity,
				condition,
				purchase_price: purchasePrice,
				purchase_date: purchaseDate,
				notes
			});
			if (err) return fail(500, { message: err.message });
		}

		throw redirect(303, '/collection');
	}
};
