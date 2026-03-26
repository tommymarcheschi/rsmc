import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices, getPriceHistory } from '$services/price-tracker';
import { supabase } from '$services/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Fetch all enrichment data in parallel
	const dexNumber = card.nationalPokedexNumbers?.[0];

	const [pokedexData, evolutionChain, poketracePrice, gradedPrices, priceHistory] =
		await Promise.all([
			dexNumber ? getPokemon(dexNumber) : Promise.resolve(null),
			dexNumber ? getEvolutionChain(dexNumber) : Promise.resolve(null),
			getCardPrices(params.id),
			getGradedPrices(params.id),
			getPriceHistory(params.id, '1y')
		]);

	// Cache the price data in Supabase if we got PokeTrace data
	if (poketracePrice) {
		const marketPrice = poketracePrice.tcgplayer?.raw?.market;
		await supabase
			.from('price_cache')
			.upsert(
				{
					card_id: params.id,
					source: 'poketrace',
					raw_price: marketPrice ?? null,
					graded_prices: poketracePrice.tcgplayer?.graded ?? {},
					cached_at: new Date().toISOString()
				},
				{ onConflict: 'card_id,source' }
			)
			.catch(() => {});
	}

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory
	};
};
