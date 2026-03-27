import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices } from '$services/price-tracker';
import { cacheTcgPlayerPrices, getPriceHistoryFromCache } from '$services/price-cache';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Cache at the edge for 5 min, serve stale for 1 hour while revalidating
	setHeaders({
		'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'
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

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory,
		ebaySold: { query: '', listings: [], averagePrice: 0, medianPrice: 0, lowPrice: 0, highPrice: 0, totalSold: 0 },
		psaPop: null
	};
};
