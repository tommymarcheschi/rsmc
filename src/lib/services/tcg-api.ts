import type { PokemonCard, CardSet, PaginatedResponse } from '$types';
import * as apiMonitor from './api-monitor';

const BASE_URL = 'https://api.pokemontcg.io/v2';
// Total budget for a single logical request, across all retry attempts.
const TOTAL_TIMEOUT_MS = 15000;
// Per-attempt cap so a single slow call can't consume the whole budget.
const ATTEMPT_TIMEOUT_MS = 6000;
// Retries are cheap for a read-only API and the upstream is observably flaky
// (intermittently returns 404/5xx for queries that are valid). 2 retries with
// exponential backoff absorb ~3 consecutive failures without doubling latency
// on the happy path.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;
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

/**
 * Retry on transient upstream failures: network errors, timeouts, 5xx, 429,
 * and 404 (the pokemontcg.io v2 API has been observed to return 404 for valid
 * queries under load, then succeed on immediate retry).
 *
 * Does NOT retry on 400/401/403 because those are deterministic client errors
 * — retrying just delays the inevitable failure.
 */
function isRetryableStatus(status: number): boolean {
	if (status === 404 || status === 429) return true;
	return status >= 500 && status < 600;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
	const deadline = Date.now() + TOTAL_TIMEOUT_MS;
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) break;
		const attemptTimeout = Math.min(ATTEMPT_TIMEOUT_MS, remaining);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), attemptTimeout);
		try {
			const res = await fetch(url, { ...opts, signal: controller.signal });
			apiMonitor.record(SERVICE, res);
			// Retry transient failures; return everything else (including 2xx and
			// deterministic 4xx) so the caller can decide what to do.
			if (attempt < MAX_ATTEMPTS && isRetryableStatus(res.status)) {
				lastError = new Error(`TCG API transient HTTP ${res.status}`);
				// Drain the body so the connection can be reused.
				await res.body?.cancel().catch(() => {});
			} else {
				return res;
			}
		} catch (err) {
			apiMonitor.recordError(SERVICE, err);
			lastError = err;
			// AbortError + network errors are retryable.
		} finally {
			clearTimeout(timer);
		}

		// Exponential backoff: 200ms, 600ms — capped by remaining deadline.
		if (attempt < MAX_ATTEMPTS) {
			const backoff = Math.min(BASE_BACKOFF_MS * 3 ** (attempt - 1), deadline - Date.now());
			if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
		}
	}

	throw lastError instanceof Error ? lastError : new Error('TCG API request failed');
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
	pageSize = 20,
	orderBy = '-set.releaseDate'
): Promise<PaginatedResponse<PokemonCard>> {
	const params = new URLSearchParams({
		q: query,
		page: String(page),
		pageSize: String(pageSize),
		orderBy
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
