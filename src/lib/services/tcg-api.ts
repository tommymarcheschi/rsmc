import type { PokemonCard, CardSet, PaginatedResponse } from '$types';

const BASE_URL = 'https://api.pokemontcg.io/v2';

function getHeaders(): HeadersInit {
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	try {
		if (typeof window === 'undefined') {
			const key = process.env.POKEMON_TCG_API_KEY ?? '';
			if (key) {
				(headers as Record<string, string>)['X-Api-Key'] = key;
			}
		}
	} catch {
		// ignore
	}
	return headers;
}

export async function searchCards(
	query: string,
	page = 1,
	pageSize = 20
): Promise<PaginatedResponse<PokemonCard>> {
	const params = new URLSearchParams({
		q: query,
		page: String(page),
		pageSize: String(pageSize),
		orderBy: '-set.releaseDate'
	});

	const res = await fetch(`${BASE_URL}/cards?${params}`, { headers: getHeaders() });
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	return res.json();
}

export async function getCard(id: string): Promise<PokemonCard> {
	const res = await fetch(`${BASE_URL}/cards/${id}`, { headers: getHeaders() });
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	const json = await res.json();
	return json.data;
}

export async function getSets(): Promise<CardSet[]> {
	const res = await fetch(`${BASE_URL}/sets?orderBy=-releaseDate`, { headers: getHeaders() });
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	const json = await res.json();
	return json.data;
}

export async function getSet(id: string): Promise<CardSet> {
	const res = await fetch(`${BASE_URL}/sets/${id}`, { headers: getHeaders() });
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	const json = await res.json();
	return json.data;
}

export async function getCardsBySet(
	setId: string,
	page = 1,
	pageSize = 50
): Promise<PaginatedResponse<PokemonCard>> {
	return searchCards(`set.id:${setId}`, page, pageSize);
}

export async function searchByName(
	name: string,
	page = 1,
	pageSize = 20
): Promise<PaginatedResponse<PokemonCard>> {
	return searchCards(`name:"${name}"`, page, pageSize);
}
