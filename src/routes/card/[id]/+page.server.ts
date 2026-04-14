import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices } from '$services/price-tracker';
import { cacheTcgPlayerPrices, getPriceHistoryFromCache } from '$services/price-cache';
import { supabase } from '$services/supabase';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Do NOT cache the HTML document. See src/routes/browse/+page.server.ts
	// for the full rationale — cached HTML referencing deleted immutable
	// JS hashes after a Vercel deploy silently breaks hydration.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	// Cache TCGPlayer prices to Supabase (fire-and-forget, once per day)
	if (card.tcgplayer?.prices) {
		cacheTcgPlayerPrices(card.id, card.tcgplayer).catch(() => {});
	}

	const dexNumber = card.nationalPokedexNumbers?.[0];
	const hasPokeTrace = !!process.env.POKETRACE_API_KEY;
	const hasPriceTracker = !!process.env.PRICE_TRACKER_API_KEY;

	// Only make fast, reliable calls — no scrapers (eBay/PSA always fail from Vercel)
	const [pokedexData, evolutionChain, priceHistory, poketracePrice, gradedPrices] =
		await Promise.all([
			dexNumber ? getPokemon(dexNumber) : Promise.resolve(null),
			dexNumber ? getEvolutionChain(dexNumber) : Promise.resolve(null),
			getPriceHistoryFromCache(params.id),
			hasPokeTrace ? getCardPrices(params.id) : Promise.resolve(null),
			hasPriceTracker ? getGradedPrices(params.id) : Promise.resolve([])
		]);

	// Pre-fetch whether this card is already in the user's collection /
	// watchlist so the page can show "In Collection" / "Watching" state
	// on initial render without needing JS. Errors are swallowed — if
	// Supabase is unreachable the buttons just show their default state.
	const [collectionRows, watchlistRows] = await Promise.all([
		supabase.from('collection').select('id').eq('card_id', params.id).limit(1),
		supabase.from('watchlist').select('id').eq('card_id', params.id).limit(1)
	]);
	const inCollection = !!collectionRows.data?.length;
	const onWatchlist = !!watchlistRows.data?.length;

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory,
		ebaySold: { query: '', listings: [], averagePrice: 0, medianPrice: 0, lowPrice: 0, highPrice: 0, totalSold: 0 },
		psaPop: null,
		inCollection,
		onWatchlist
	};
};

/**
 * Form actions for "Add to Collection" and "Add to Watchlist".
 *
 * Declared as SvelteKit actions instead of client-side `fetch` calls so the
 * buttons work without any JavaScript — native `<form method="POST" action="?/…">`
 * submission falls through to these handlers, the Supabase insert runs on the
 * server, and the page re-renders with the new state. With JS, `use:enhance`
 * on the form upgrades this to an inline update (no full reload) while still
 * hitting the same action.
 */
export const actions: Actions = {
	addToCollection: async ({ params }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'collection', message: 'Missing card id' });

		// If the user already has this card at NM condition, bump the quantity
		// instead of creating a duplicate row. Matches the /api/collection POST
		// handler so the two paths behave identically.
		const { data: existing } = await supabase
			.from('collection')
			.select('id, quantity')
			.eq('card_id', cardId)
			.eq('condition', 'NM')
			.maybeSingle();

		if (existing) {
			const { error: err } = await supabase
				.from('collection')
				.update({ quantity: existing.quantity + 1 })
				.eq('id', existing.id);
			if (err) return fail(500, { action: 'collection', message: err.message });
			return { action: 'collection', success: true, bumped: true };
		}

		const { error: err } = await supabase
			.from('collection')
			.insert({ card_id: cardId, quantity: 1, condition: 'NM' });
		if (err) return fail(500, { action: 'collection', message: err.message });
		return { action: 'collection', success: true };
	},

	addToWatchlist: async ({ params }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'watchlist', message: 'Missing card id' });

		// watchlist has a unique (card_id) constraint; detect the duplicate and
		// return a success regardless so the user sees "Watching" either way.
		const { data: existing } = await supabase
			.from('watchlist')
			.select('id')
			.eq('card_id', cardId)
			.maybeSingle();

		if (existing) {
			return { action: 'watchlist', success: true, alreadyWatching: true };
		}

		const { error: err } = await supabase
			.from('watchlist')
			.insert({ card_id: cardId });
		if (err) return fail(500, { action: 'watchlist', message: err.message });
		return { action: 'watchlist', success: true };
	}
};
