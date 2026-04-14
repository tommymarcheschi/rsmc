import type { PokedexData, EvolutionNode } from '$types';
import * as apiMonitor from './api-monitor';

const BASE_URL = 'https://pokeapi.co/api/v2';
const TIMEOUT_MS = 5000;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour — Pokedex data never changes
const SERVICE = 'pokeapi';

// In-memory caches
const pokemonCache = new Map<number, { data: PokedexData; expires: number }>();
const evoCache = new Map<number, { data: EvolutionNode[]; expires: number }>();

async function fetchWithTimeout(url: string): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: controller.signal });
		apiMonitor.record(SERVICE, res);
		return res;
	} catch (err) {
		apiMonitor.recordError(SERVICE, err);
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

export async function getPokemon(nameOrId: string | number): Promise<PokedexData | null> {
	const id = typeof nameOrId === 'string' ? parseInt(nameOrId) : nameOrId;
	const cached = pokemonCache.get(id);
	if (cached && cached.expires > Date.now()) return cached.data;

	try {
		const [speciesRes, pokemonRes] = await Promise.all([
			fetchWithTimeout(`${BASE_URL}/pokemon-species/${nameOrId}`),
			fetchWithTimeout(`${BASE_URL}/pokemon/${nameOrId}`)
		]);

		if (!speciesRes.ok || !pokemonRes.ok) return null;

		const [species, pokemon] = await Promise.all([speciesRes.json(), pokemonRes.json()]);

		const flavorEntry = species.flavor_text_entries.find(
			(e: { language: { name: string } }) => e.language.name === 'en'
		);

		const genusEntry = species.genera.find(
			(g: { language: { name: string } }) => g.language.name === 'en'
		);

		const data: PokedexData = {
			id: pokemon.id,
			name: pokemon.name,
			types: pokemon.types.map((t: { type: { name: string } }) => t.type.name),
			flavor_text: flavorEntry?.flavor_text?.replace(/\f/g, ' ') ?? '',
			genus: genusEntry?.genus ?? '',
			height: pokemon.height,
			weight: pokemon.weight
		};

		pokemonCache.set(id, { data, expires: Date.now() + CACHE_TTL });

		// Also cache the evolution chain from this species data (avoids double fetch)
		if (species.evolution_chain?.url) {
			cacheEvolutionFromSpecies(id, species.evolution_chain.url);
		}

		return data;
	} catch {
		return null;
	}
}

export async function getEvolutionChain(pokemonId: number): Promise<EvolutionNode[] | null> {
	const cached = evoCache.get(pokemonId);
	if (cached && cached.expires > Date.now()) return cached.data;

	try {
		const speciesRes = await fetchWithTimeout(`${BASE_URL}/pokemon-species/${pokemonId}`);
		if (!speciesRes.ok) return null;
		const species = await speciesRes.json();

		const evoRes = await fetchWithTimeout(species.evolution_chain.url);
		if (!evoRes.ok) return null;
		const evoData = await evoRes.json();

		const data = [parseChain(evoData.chain)];
		evoCache.set(pokemonId, { data, expires: Date.now() + CACHE_TTL });
		return data;
	} catch {
		return null;
	}
}

/** Pre-cache evolution chain when we already have the species URL from getPokemon */
async function cacheEvolutionFromSpecies(pokemonId: number, evoUrl: string): Promise<void> {
	if (evoCache.has(pokemonId)) return;
	try {
		const evoRes = await fetchWithTimeout(evoUrl);
		if (!evoRes.ok) return;
		const evoData = await evoRes.json();
		const data = [parseChain(evoData.chain)];
		evoCache.set(pokemonId, { data, expires: Date.now() + CACHE_TTL });
	} catch {
		// Ignore
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
