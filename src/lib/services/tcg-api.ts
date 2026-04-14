import type { PokemonCard, CardSet, PaginatedResponse } from '$types';
import * as apiMonitor from './api-monitor';

const BASE_URL = 'https://api.pokemontcg.io/v2';
const TIMEOUT_MS = 15000;
const SERVICE = 'tcg';

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

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, { ...opts, signal: controller.signal });
		apiMonitor.record(SERVICE, res);
		return res;
	} catch (err) {
		apiMonitor.recordError(SERVICE, err);
		throw err;
	} finally {
		clearTimeout(timeout);
	}
}

// ── In-memory cache for sets (rarely changes, saves ~1 API call per page load) ──
let setsCache: { data: CardSet[]; expires: number } | null = null;
const SETS_CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// ── In-memory cache for individual card lookups ──
const cardCache = new Map<string, { data: PokemonCard; expires: number }>();
const CARD_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

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

	const res = await fetchWithTimeout(`${BASE_URL}/cards?${params}`, {
		headers: getHeaders()
	});
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	return res.json();
}

export async function getCard(id: string): Promise<PokemonCard> {
	// Check cache first
	const cached = cardCache.get(id);
	if (cached && cached.expires > Date.now()) {
		return cached.data;
	}

	const res = await fetchWithTimeout(`${BASE_URL}/cards/${id}`, {
		headers: getHeaders()
	});
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	const json = await res.json();

	// Cache the result
	cardCache.set(id, { data: json.data, expires: Date.now() + CARD_CACHE_TTL });

	return json.data;
}

export async function getSets(): Promise<CardSet[]> {
	// Return cached sets if fresh
	if (setsCache && setsCache.expires > Date.now()) {
		return setsCache.data;
	}

	const res = await fetchWithTimeout(`${BASE_URL}/sets?orderBy=-releaseDate`, {
		headers: getHeaders()
	});
	if (!res.ok) throw new Error(`TCG API error: ${res.status}`);
	const json = await res.json();

	// Cache for 30 minutes
	setsCache = { data: json.data, expires: Date.now() + SETS_CACHE_TTL };

	return json.data;
}

export async function getSet(id: string): Promise<CardSet> {
	const res = await fetchWithTimeout(`${BASE_URL}/sets/${id}`, {
		headers: getHeaders()
	});
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
