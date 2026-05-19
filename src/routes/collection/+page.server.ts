import { supabase } from '$services/supabase';
import { getCard, searchCards } from '$services/tcg-api';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { PokemonCard, CollectionEntry } from '$types';
import {
	gateDiscoverySignals,
	DISCOVERY_SELECT_COLS,
	type DiscoverySignals,
	type RawDiscoveryRow
} from '$services/discovery-signals';

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

	// Pull canonical Raw NM prices from card_index so the collection's
	// valuation matches /grading, /insights, and /browse hunt mode. Single
	// batched query — card_index is keyed on card_id. Cards missing from
	// card_index get fallback valuation from the TCG API's tcgplayer.prices.
	const indexPrices: Record<string, number | null> = {};
	// Discovery signals every owned card already has but /collection never
	// surfaced. Gating MIRRORS CardThumbnail (the proven grid pattern):
	// modeled scores (value/scarcity) only at high|medium confidence —
	// never headline a low/null-confidence rank; real gem rate only when a
	// real PSA pop backs it; raw→PSA10 delta only when it's a real positive
	// number. null ⇒ nothing (honesty doctrine — never fabricate, never
	// show an empty axis). score_momentum/score_liquidity are ~null in prod
	// so they are deliberately NOT pulled.
	const discoveryByCard: Record<string, DiscoverySignals> = {};
	if (uniqueCardIds.length > 0) {
		const { data: indexRows } = await supabase
			.from('card_index')
			.select(`card_id, raw_nm_price, ${DISCOVERY_SELECT_COLS}`)
			.in('card_id', uniqueCardIds);
		for (const r of (indexRows ?? []) as Array<
			RawDiscoveryRow & { card_id: string; raw_nm_price: number | null }
		>) {
			indexPrices[r.card_id] = r.raw_nm_price;
			discoveryByCard[r.card_id] = gateDiscoverySignals(r);
		}
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

	// Real per-condition medians (TCGPlayer active-listing comps, Phase 1).
	// This is the honest-valuation differentiator: when we have a true
	// per-condition median for a card we value the entry off THAT, not a
	// fabricated discount of NM. Only fall back to the multiplier when no
	// real comp exists. Batched, collapsed to latest snapshot per
	// (card_id, condition).
	const realByCardCond: Record<string, { median: number; sample: number; as_of: string }> = {};
	if (uniqueCardIds.length > 0) {
		const { data: snapRows } = await supabase
			.from('condition_price_snapshots')
			.select('card_id, condition, median_cents, sample_count, snapshot_date')
			.in('card_id', uniqueCardIds)
			.order('snapshot_date', { ascending: false });
		for (const r of (snapRows ?? []) as Array<{
			card_id: string;
			condition: string;
			median_cents: number;
			sample_count: number;
			snapshot_date: string;
		}>) {
			const key = `${r.card_id}|${r.condition}`;
			// rows are newest-first, so the first one we see per key wins
			if (!realByCardCond[key] && r.median_cents != null) {
				realByCardCond[key] = {
					median: Math.round(r.median_cents) / 100,
					sample: r.sample_count,
					as_of: r.snapshot_date
				};
			}
		}
	}

	// Per-entry current valuation. Priority: (1) real per-condition median
	// comp, (2) raw NM (canonical, condition NM only), (3) NM × standard
	// TCGPlayer discount multiplier — flagged `est.` so the number is never
	// mistaken for a true comp. Honesty doctrine: prefer a real number over
	// a fabricated one; never silently dress an estimate up as a comp.
	const CONDITION_DISCOUNT: Record<string, number> = {
		NM: 1.0,
		LP: 0.85,
		MP: 0.7,
		HP: 0.5,
		DMG: 0.3
	};

	interface ValuationRow {
		nm_price: number | null;
		unit_value: number | null;
		line_value: number | null;
		is_estimate: boolean;
		discount: number;
		value_source: 'real_comp' | 'raw_nm' | 'estimate' | 'none';
		sample_count: number | null;
		as_of: string | null;
	}
	const valuationByEntry: Record<string, ValuationRow> = {};
	for (const entry of entries) {
		let nm = indexPrices[entry.card_id] ?? null;
		if (nm == null) {
			// Fallback: TCG API market price off whichever printing has one.
			const card = cardCache[entry.card_id];
			if (card?.tcgplayer?.prices) {
				for (const variant of Object.values(card.tcgplayer.prices)) {
					if (typeof variant.market === 'number' && variant.market > 0) {
						nm = variant.market;
						break;
					}
				}
			}
		}

		const discount = CONDITION_DISCOUNT[entry.condition] ?? 1.0;
		const real = realByCardCond[`${entry.card_id}|${entry.condition}`];

		let unitValue: number | null;
		let isEstimate: boolean;
		let source: ValuationRow['value_source'];
		if (real) {
			unitValue = real.median;
			isEstimate = false;
			source = 'real_comp';
		} else if (entry.condition === 'NM' && nm != null) {
			unitValue = Math.round(nm * 100) / 100;
			isEstimate = false;
			source = 'raw_nm';
		} else if (nm != null) {
			unitValue = Math.round(nm * discount * 100) / 100;
			isEstimate = discount < 1.0;
			source = discount < 1.0 ? 'estimate' : 'raw_nm';
		} else {
			unitValue = null;
			isEstimate = false;
			source = 'none';
		}

		const lineValue = unitValue != null ? Math.round(unitValue * entry.quantity * 100) / 100 : null;
		valuationByEntry[entry.id] = {
			nm_price: nm,
			unit_value: unitValue,
			line_value: lineValue,
			is_estimate: isEstimate,
			discount,
			value_source: source,
			sample_count: real ? real.sample : null,
			as_of: real ? real.as_of : null
		};
	}

	return {
		entries,
		cardCache,
		valuationByEntry,
		discoveryByCard,
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
