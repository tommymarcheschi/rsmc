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
import { valueEntry, loadConditionComps, compKey, type Valuation } from '$services/valuation';
import { loadWatchlistData, type WatchlistLoadResult } from '$services/watchlist-load';

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
	// Card metadata for the cardCache fallback (see below). pokemontcg.io
	// 404s for Scrydex-only sets (e.g. `me3`), and when getCard() fails the
	// whole row collapses to its card_id with a "..." thumbnail and falls
	// out of the Insight strip. card_index is our source of truth for every
	// owned card, so we read name/image/set/number/rarity off the same row
	// and synthesize a minimal PokemonCard for any pokemontcg miss.
	interface IndexMeta {
		name: string;
		set_id: string | null;
		set_name: string | null;
		card_number: string | null;
		image_small_url: string | null;
		image_large_url: string | null;
		rarity: string | null;
	}
	const indexMeta: Record<string, IndexMeta> = {};
	if (uniqueCardIds.length > 0) {
		const { data: indexRows } = await supabase
			.from('card_index')
			.select(
				`card_id, raw_nm_price, name, set_id, set_name, card_number, image_small_url, image_large_url, rarity, ${DISCOVERY_SELECT_COLS}`
			)
			.in('card_id', uniqueCardIds);
		for (const r of (indexRows ?? []) as Array<
			RawDiscoveryRow & {
				card_id: string;
				raw_nm_price: number | null;
				name: string;
				set_id: string | null;
				set_name: string | null;
				card_number: string | null;
				image_small_url: string | null;
				image_large_url: string | null;
				rarity: string | null;
			}
		>) {
			indexPrices[r.card_id] = r.raw_nm_price;
			discoveryByCard[r.card_id] = gateDiscoverySignals(r);
			indexMeta[r.card_id] = {
				name: r.name,
				set_id: r.set_id,
				set_name: r.set_name,
				card_number: r.card_number,
				image_small_url: r.image_small_url,
				image_large_url: r.image_large_url,
				rarity: r.rarity
			};
		}
	}

	// Backfill cardCache for any card the pokemontcg.io lookup missed. The
	// UI reads card.name / card.images.small / card.set.name / card.number,
	// so we synthesize just those fields from card_index. Cast to
	// PokemonCard — fields the UI doesn't touch stay undefined.
	for (const id of uniqueCardIds) {
		if (cardCache[id]) continue;
		const m = indexMeta[id];
		if (!m) continue;
		cardCache[id] = {
			id,
			name: m.name,
			supertype: '',
			number: m.card_number ?? '',
			rarity: m.rarity ?? undefined,
			images: {
				small: m.image_small_url ?? '',
				large: m.image_large_url ?? m.image_small_url ?? ''
			},
			set: {
				id: m.set_id ?? '',
				name: m.set_name ?? '',
				series: '',
				printedTotal: 0,
				total: 0,
				releaseDate: '',
				images: { symbol: '', logo: '' }
			}
		} as PokemonCard;
	}

	// Add-modal state is driven by URL params so the whole flow works without
	// JS: `?add=1` opens the modal, `?addSearch=<q>` runs a server-side card
	// search, `?selectedCard=<id>` pre-fetches that card so the detail preview
	// renders on the same round-trip. Option (b) from the task spec — keeping
	// the modal in-page and using query params for each step is less
	// disruptive than a separate /collection/add route.
	// Tab strip — Sprint 1D-i fold. /watchlist redirects here with ?tab=watchlist.
	// Default tab is the collection view; the watchlist UI only appears when
	// the user (or a redirect) asks for it explicitly. The watchlist data is
	// only loaded when the tab is active so the default Collection view pays
	// no extra DB cost. Triggered-count is always loaded (cheap) so the tab
	// badge can show even when the user is on the Collection tab.
	const tabParam = url.searchParams.get('tab');
	const tab: 'collection' | 'watchlist' = tabParam === 'watchlist' ? 'watchlist' : 'collection';

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

	// Real per-condition TCGPlayer medians, batched. Same shared loader the
	// dashboard uses so both surfaces always agree on which entries qualify
	// for the real-comp path.
	const compsByKey = await loadConditionComps(supabase, uniqueCardIds);

	// Per-entry valuation. All math + the calibrated discount ladder live
	// in $services/valuation — see that file's header for the priority order
	// and the calibration provenance (real_comp > raw_nm > estimate > none).
	// We also expose nm_price so the existing tooltip ("Estimated: NM $X ×
	// Y% HP discount") keeps showing the NM anchor.
	interface ValuationRow extends Valuation {
		nm_price: number | null;
		value_source: Valuation['source'];
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

		const v = valueEntry({
			condition: entry.condition,
			quantity: entry.quantity,
			purchase_price: entry.purchase_price ?? null,
			raw_nm_price: nm,
			conditionComp: compsByKey[compKey(entry.card_id, entry.condition)] ?? null
		});
		valuationByEntry[entry.id] = {
			...v,
			nm_price: nm,
			value_source: v.source
		};
	}

	// Watchlist is full-loaded on its tab + a lightweight triggered-count is
	// available even on the Collection tab so the tab badge can render. A
	// single COUNT-only watchlist query would still be a round-trip + still
	// need the price join to know "triggered" — so for simplicity we just
	// load the full watchlist on both tabs. ~tens of rows; cost is trivial
	// and keeps the contract simple.
	let watchlist: WatchlistLoadResult = {
		entries: [],
		cardCache: {},
		valuationByEntry: {},
		triggeredCount: 0
	};
	try {
		watchlist = await loadWatchlistData();
	} catch {
		// Watchlist fetch failure shouldn't break /collection — the tab just
		// shows zero triggered, and clicking it shows an empty state.
	}

	return {
		tab,
		entries,
		cardCache,
		valuationByEntry,
		discoveryByCard,
		addMode,
		addSearch,
		addSearchResults,
		selectedCard,
		watchlist
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
