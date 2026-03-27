import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices } from '$services/price-tracker';
import { searchEbaySold } from '$services/ebay-scraper';
import { searchPSAPop } from '$services/psa-scraper';
import { cacheTcgPlayerPrices, getPriceHistoryFromCache } from '$services/price-cache';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Cache TCGPlayer prices to Supabase (fire-and-forget, once per day)
	if (card.tcgplayer?.prices) {
		cacheTcgPlayerPrices(card.id, card.tcgplayer).catch(() => {});
	}

	const dexNumber = card.nationalPokedexNumbers?.[0];

	// Core data: Pokedex enrichment + price history from our cache
	// External APIs: only attempt if env vars are configured
	const hasPokeTrace = !!process.env.POKETRACE_API_KEY;
	const hasPriceTracker = !!process.env.PRICE_TRACKER_API_KEY;

	const [pokedexData, evolutionChain, priceHistory, poketracePrice, gradedPrices, ebaySold, psaPop] =
		await Promise.all([
			dexNumber ? getPokemon(dexNumber) : Promise.resolve(null),
			dexNumber ? getEvolutionChain(dexNumber) : Promise.resolve(null),
			getPriceHistoryFromCache(params.id),
			hasPokeTrace ? getCardPrices(params.id) : Promise.resolve(null),
			hasPriceTracker ? getGradedPrices(params.id) : Promise.resolve([]),
			searchEbaySold(card.name, card.set?.name, 10),
			searchPSAPop(card.name, card.set?.name)
		]);

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory,
		ebaySold,
		psaPop
	};
};
