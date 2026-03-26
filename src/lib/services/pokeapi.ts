import type { PokedexData, EvolutionNode } from '$types';

const BASE_URL = 'https://pokeapi.co/api/v2';

export async function getPokemon(nameOrId: string | number): Promise<PokedexData | null> {
	try {
		const [speciesRes, pokemonRes] = await Promise.all([
			fetch(`${BASE_URL}/pokemon-species/${nameOrId}`),
			fetch(`${BASE_URL}/pokemon/${nameOrId}`)
		]);

		if (!speciesRes.ok || !pokemonRes.ok) return null;

		const [species, pokemon] = await Promise.all([speciesRes.json(), pokemonRes.json()]);

		const flavorEntry = species.flavor_text_entries.find(
			(e: { language: { name: string } }) => e.language.name === 'en'
		);

		const genusEntry = species.genera.find(
			(g: { language: { name: string } }) => g.language.name === 'en'
		);

		return {
			id: pokemon.id,
			name: pokemon.name,
			types: pokemon.types.map((t: { type: { name: string } }) => t.type.name),
			flavor_text: flavorEntry?.flavor_text?.replace(/\f/g, ' ') ?? '',
			genus: genusEntry?.genus ?? '',
			height: pokemon.height,
			weight: pokemon.weight
		};
	} catch {
		return null;
	}
}

export async function getEvolutionChain(pokemonId: number): Promise<EvolutionNode[] | null> {
	try {
		const speciesRes = await fetch(`${BASE_URL}/pokemon-species/${pokemonId}`);
		if (!speciesRes.ok) return null;
		const species = await speciesRes.json();

		const evoRes = await fetch(species.evolution_chain.url);
		if (!evoRes.ok) return null;
		const evoData = await evoRes.json();

		return [parseChain(evoData.chain)];
	} catch {
		return null;
	}
}

function parseChain(chain: {
	species: { name: string; url: string };
	evolves_to: typeof chain[];
}): EvolutionNode {
	const idMatch = chain.species.url.match(/\/(\d+)\/?$/);
	return {
		name: chain.species.name,
		id: idMatch ? parseInt(idMatch[1]) : 0,
		evolves_to: chain.evolves_to.map(parseChain)
	};
}
