import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices, getGradingFees } from '$services/price-tracker';
import { cacheTcgPlayerPrices, getPriceHistoryFromCache } from '$services/price-cache';
import { supabase } from '$services/supabase';
import { getCardSignal } from '$services/insights';
import { computeGradingROI, DEFAULT_TIER_BY_SERVICE } from '$services/grading-roi';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { GradingService } from '$types';

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
	const [collectionRows, watchlistRows, conditionPriceRows, cardIndexRow, gradingFees] = await Promise.all([
		supabase.from('collection').select('id').eq('card_id', params.id).limit(1),
		supabase.from('watchlist').select('id').eq('card_id', params.id).limit(1),
		// Latest snapshot per condition. Small (≤5 rows per card) so we can
		// fetch and collapse in JS without a window function.
		supabase
			.from('condition_price_snapshots')
			.select('condition, median_cents, p25_cents, p75_cents, sample_count, snapshot_date')
			.eq('card_id', params.id)
			.order('snapshot_date', { ascending: false })
			.limit(50),
		// card_index row for market signals section
		supabase
			.from('card_index')
			.select(
				'rarity, set_release_date, raw_nm_price, raw_source, psa10_price, cgc10_price, tag10_price, ' +
					'psa10_delta, psa10_multiple, psa_pop_total, psa_pop_10, psa_gem_rate, ' +
					'cgc_pop_total, cgc_pop_10, cgc_gem_rate, ' +
					'graded_prices_fetched_at, last_enriched_at'
			)
			.eq('card_id', params.id)
			.maybeSingle(),
		getGradingFees()
	]);
	const inCollection = !!collectionRows.data?.length;
	const onWatchlist = !!watchlistRows.data?.length;

	// Market signals: undervalued-finder context + precomputed grading ROI.
	// Best-effort — any failure shows "no data" in the UI rather than 500ing.
	const indexRow = cardIndexRow.data;
	const cardSignal = indexRow
		? await getCardSignal(
				params.id,
				indexRow.rarity,
				indexRow.set_release_date,
				indexRow.raw_nm_price,
				indexRow.psa10_price
		  ).catch(() => null)
		: null;

	const gradingROI = indexRow
		? computeGradingROI(
				{
					raw_nm_price: indexRow.raw_nm_price,
					psa10_price: indexRow.psa10_price,
					psa_gem_rate: indexRow.psa_gem_rate,
					psa_pop_total: indexRow.psa_pop_total
				},
				'PSA' as GradingService,
				DEFAULT_TIER_BY_SERVICE.PSA,
				gradingFees
		  )
		: null;

	// Collapse to one row per condition, keeping the most recent. Missing
	// table (404 after a fresh deploy before migration 005 applies) returns
	// null data — we just show nothing, per honesty doctrine.
	const conditionPrices = collapseLatestPerCondition(conditionPriceRows.data ?? []);

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory,
		ebaySold: { query: '', listings: [], averagePrice: 0, medianPrice: 0, lowPrice: 0, highPrice: 0, totalSold: 0 },
		psaPop: null,
		conditionPrices,
		indexRow,
		cardSignal,
		gradingROI,
		inCollection,
		onWatchlist
	};
};

interface ConditionSnapshotRow {
	condition: string;
	median_cents: number;
	p25_cents: number;
	p75_cents: number;
	sample_count: number;
	snapshot_date: string;
}

function collapseLatestPerCondition(rows: ConditionSnapshotRow[]): ConditionSnapshotRow[] {
	const latest = new Map<string, ConditionSnapshotRow>();
	for (const r of rows) {
		const existing = latest.get(r.condition);
		if (!existing || r.snapshot_date > existing.snapshot_date) latest.set(r.condition, r);
	}
	const order = ['NM', 'LP', 'MP', 'HP', 'DMG'];
	return order
		.map((c) => latest.get(c))
		.filter((r): r is ConditionSnapshotRow => r != null);
}

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
