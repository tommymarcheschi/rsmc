import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Try to enrich with PokéAPI data if this is a Pokémon card
	let pokedexData = null;
	let evolutionChain = null;

	if (card.nationalPokedexNumbers?.length) {
		const dexNumber = card.nationalPokedexNumbers[0];
		const [pokemon, evo] = await Promise.all([
			getPokemon(dexNumber),
			getEvolutionChain(dexNumber)
		]);
		pokedexData = pokemon;
		evolutionChain = evo;
	}

	return {
		card,
		pokedexData,
		evolutionChain
	};
};
