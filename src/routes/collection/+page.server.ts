import { supabase } from '$services/supabase';
import { getCard, searchCards } from '$services/tcg-api';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { PokemonCard, CollectionEntry } from '$types';

const ADD_SEARCH_PAGE_SIZE = 12;

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Do NOT cache the HTML document. See src/routes/browse/+page.server.ts
	// for the full rationale — cached HTML referencing deleted immutable JS
	// hashes after a Vercel deploy silently breaks hydration.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	const { data: rawEntries } = await supabase
		.from('collection')
		.select('*')
		.order('created_at', { ascending: false });

	const entries = (rawEntries ?? []) as CollectionEntry[];

	// Fetch card metadata for each entry server-side so the list renders
	// without JS. getCard() has an in-memory TTL cache so repeat loads are
	// cheap; a failed lookup degrades to just the card_id being shown.
	const uniqueCardIds = Array.from(new Set(entries.map((e) => e.card_id)));
	const cardLookups = await Promise.all(
		uniqueCardIds.map((id) => getCard(id).catch(() => null))
	);
	const cardCache: Record<string, PokemonCard> = {};
	for (let i = 0; i < uniqueCardIds.length; i++) {
		const card = cardLookups[i];
		if (card) cardCache[uniqueCardIds[i]] = card;
	}

	// Add-modal state is driven by URL params so the whole flow works without
	// JS: `?add=1` opens the modal, `?addSearch=<q>` runs a server-side card
	// search, `?selectedCard=<id>` pre-fetches that card so the detail preview
	// renders on the same round-trip. Option (b) from the task spec — keeping
	// the modal in-page and using query params for each step is less
	// disruptive than a separate /collection/add route.
	const addMode = url.searchParams.get('add') === '1';
	const addSearch = url.searchParams.get('addSearch') ?? '';
	const selectedCardId = url.searchParams.get('selectedCard') ?? '';

	let addSearchResults: PokemonCard[] = [];
	if (addMode && addSearch.trim()) {
		try {
			const result = await searchCards(`name:"${addSearch}*"`, 1, ADD_SEARCH_PAGE_SIZE);
			addSearchResults = result.data;
		} catch {
			// swallow — show empty results rather than crashing the page
		}
	}

	let selectedCard: PokemonCard | null = null;
	if (addMode && selectedCardId) {
		selectedCard = await getCard(selectedCardId).catch(() => null);
	}

	return {
		entries,
		cardCache,
		addMode,
		addSearch,
		addSearchResults,
		selectedCard
	};
};

/**
 * Form actions for the collection page.
 *
 * Declared as SvelteKit actions instead of client-side fetch() calls so the
 * page works without any JavaScript — native <form method="POST" action="?/…">
 * submission falls through to these handlers, the Supabase mutation runs on
 * the server, and the page re-renders with the new state. With JS,
 * `use:enhance` upgrades each form to an inline update hitting the same
 * action.
 *
 * The dedupe rules (bump quantity on matching (card_id, condition)) mirror
 * the /api/collection POST handler so both paths behave identically.
 */
export const actions: Actions = {
	addEntry: async ({ request }) => {
		const form = await request.formData();
		const cardId = (form.get('card_id') ?? '').toString().trim();
		if (!cardId) return fail(400, { action: 'add', message: 'Card is required' });

		const conditionRaw = (form.get('condition') ?? 'NM').toString();
		const condition = ['NM', 'LP', 'MP', 'HP', 'DMG'].includes(conditionRaw)
			? conditionRaw
			: 'NM';

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
			if (err) return fail(500, { action: 'add', message: err.message });
		} else {
			const { error: err } = await supabase.from('collection').insert({
				card_id: cardId,
				quantity,
				condition,
				purchase_price: purchasePrice,
				purchase_date: purchaseDate,
				notes
			});
			if (err) return fail(500, { action: 'add', message: err.message });
		}

		throw redirect(303, '/collection');
	},

	increment: async ({ request }) => {
		const form = await request.formData();
		const id = (form.get('id') ?? '').toString();
		if (!id) return fail(400, { action: 'increment', message: 'Missing id' });

		const { data: existing } = await supabase
			.from('collection')
			.select('quantity')
			.eq('id', id)
			.maybeSingle();
		if (!existing) return fail(404, { action: 'increment', message: 'Entry not found' });

		const { error: err } = await supabase
			.from('collection')
			.update({ quantity: existing.quantity + 1 })
			.eq('id', id);
		if (err) return fail(500, { action: 'increment', message: err.message });

		return { action: 'increment', success: true };
	},

	decrement: async ({ request }) => {
		const form = await request.formData();
		const id = (form.get('id') ?? '').toString();
		if (!id) return fail(400, { action: 'decrement', message: 'Missing id' });

		const { data: existing } = await supabase
			.from('collection')
			.select('quantity')
			.eq('id', id)
			.maybeSingle();
		if (!existing) return fail(404, { action: 'decrement', message: 'Entry not found' });

		if (existing.quantity <= 1) {
			const { error: err } = await supabase.from('collection').delete().eq('id', id);
			if (err) return fail(500, { action: 'decrement', message: err.message });
			return { action: 'decrement', success: true, removed: true };
		}

		const { error: err } = await supabase
			.from('collection')
			.update({ quantity: existing.quantity - 1 })
			.eq('id', id);
		if (err) return fail(500, { action: 'decrement', message: err.message });

		return { action: 'decrement', success: true };
	},

	remove: async ({ request }) => {
		const form = await request.formData();
		const id = (form.get('id') ?? '').toString();
		if (!id) return fail(400, { action: 'remove', message: 'Missing id' });

		const { error: err } = await supabase.from('collection').delete().eq('id', id);
		if (err) return fail(500, { action: 'remove', message: err.message });

		return { action: 'remove', success: true };
	}
};
