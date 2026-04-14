/**
 * api-monitor — lightweight in-memory health tracker for upstream APIs.
 *
 * Each API service module reports the result of every fetch via record() or
 * recordError(). The monitor parses standard rate-limit headers, classifies
 * the response, and exposes a snapshot consumed by /api/health and the
 * <ApiStatus /> badge in the header.
 *
 * In-memory only — resets on every Vercel cold start. Fine for visibility;
 * not for billing-grade quota tracking.
 */

export type ServiceHealth = 'ok' | 'error' | 'ratelimited' | 'unknown';

export interface ServiceStatus {
	service: string;
	label: string;
	health: ServiceHealth;
	totalCalls: number;
	errorCount: number;
	lastStatusCode: number | null;
	lastSuccessAt: number | null;
	lastErrorAt: number | null;
	lastError: string | null;
	rateLimitRemaining: number | null;
	rateLimitLimit: number | null;
	rateLimitResetAt: number | null;
}

export interface MonitorSnapshot {
	overall: ServiceHealth;
	services: ServiceStatus[];
	generatedAt: number;
}

const SERVICE_LABELS: Record<string, string> = {
	tcg: 'Pokémon TCG API',
	pokeapi: 'PokéAPI',
	poketrace: 'PokeTrace',
	'price-tracker': 'Pokémon Price Tracker'
};

const services = new Map<string, ServiceStatus>();

function getOrCreate(service: string): ServiceStatus {
	let s = services.get(service);
	if (!s) {
		s = {
			service,
			label: SERVICE_LABELS[service] ?? service,
			health: 'unknown',
			totalCalls: 0,
			errorCount: 0,
			lastStatusCode: null,
			lastSuccessAt: null,
			lastErrorAt: null,
			lastError: null,
			rateLimitRemaining: null,
			rateLimitLimit: null,
			rateLimitResetAt: null
		};
		services.set(service, s);
	}
	return s;
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Date.now() + seconds * 1000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? null : date;
}

function parseResetHeader(value: string | null): number | null {
	if (!value) return null;
	const num = Number(value);
	if (!Number.isFinite(num)) return null;
	// Heuristic: small numbers are seconds-from-now, large numbers are unix epoch.
	if (num < 1_000_000_000) return Date.now() + num * 1000;
	// Either seconds or milliseconds since epoch
	return num > 1e12 ? num : num * 1000;
}

function readRateLimitHeaders(headers: Headers): {
	remaining: number | null;
	limit: number | null;
	resetAt: number | null;
} {
	const remainingRaw =
		headers.get('x-ratelimit-remaining') ?? headers.get('ratelimit-remaining');
	const limitRaw = headers.get('x-ratelimit-limit') ?? headers.get('ratelimit-limit');
	const resetRaw =
		headers.get('x-ratelimit-reset') ??
		headers.get('ratelimit-reset') ??
		headers.get('retry-after');

	return {
		remaining: remainingRaw !== null && Number.isFinite(Number(remainingRaw))
			? Number(remainingRaw)
			: null,
		limit: limitRaw !== null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null,
		resetAt: parseResetHeader(resetRaw) ?? parseRetryAfter(headers.get('retry-after'))
	};
}

function logTransition(prev: ServiceHealth, next: ServiceHealth, status: ServiceStatus) {
	if (prev === next) return;
	if (next === 'ratelimited') {
		const reset = status.rateLimitResetAt
			? new Date(status.rateLimitResetAt).toLocaleTimeString()
			: 'unknown';
		console.warn(
			`[api-monitor] ${status.label} is RATE LIMITED (HTTP ${status.lastStatusCode ?? '?'}). Resets at ${reset}.`
		);
	} else if (next === 'error') {
		console.warn(
			`[api-monitor] ${status.label} reporting ERRORS (HTTP ${status.lastStatusCode ?? '?'}): ${status.lastError ?? 'unknown'}`
		);
	} else if (next === 'ok' && (prev === 'error' || prev === 'ratelimited')) {
		console.info(`[api-monitor] ${status.label} recovered.`);
	}
}

/** Record the outcome of a fetch call. Pass the Response (regardless of ok). */
export function record(service: string, res: Response): void {
	const status = getOrCreate(service);
	const prev = status.health;

	status.totalCalls += 1;
	status.lastStatusCode = res.status;

	const { remaining, limit, resetAt } = readRateLimitHeaders(res.headers);
	if (remaining !== null) status.rateLimitRemaining = remaining;
	if (limit !== null) status.rateLimitLimit = limit;
	if (resetAt !== null) status.rateLimitResetAt = resetAt;

	if (res.status === 429) {
		status.errorCount += 1;
		status.lastErrorAt = Date.now();
		status.lastError = 'Rate limit exceeded (HTTP 429)';
		status.health = 'ratelimited';
	} else if (!res.ok) {
		status.errorCount += 1;
		status.lastErrorAt = Date.now();
		status.lastError = `HTTP ${res.status} ${res.statusText || ''}`.trim();
		status.health = 'error';
	} else {
		status.lastSuccessAt = Date.now();
		// Clear a stale rate-limit state once a successful call comes in
		if (status.health === 'ratelimited' && status.rateLimitResetAt && status.rateLimitResetAt < Date.now()) {
			status.rateLimitResetAt = null;
		}
		status.health = 'ok';
		status.lastError = null;
	}

	logTransition(prev, status.health, status);
}

/** Record a thrown error (network failure, abort, JSON parse, etc.). */
export function recordError(service: string, error: unknown): void {
	const status = getOrCreate(service);
	const prev = status.health;
	status.totalCalls += 1;
	status.errorCount += 1;
	status.lastErrorAt = Date.now();
	status.lastError = error instanceof Error ? error.message : String(error);
	status.health = 'error';
	logTransition(prev, status.health, status);
}

/** Pre-register a service so it appears in snapshots before any traffic. */
export function registerService(service: string, label?: string): void {
	const s = getOrCreate(service);
	if (label) s.label = label;
}

function computeOverall(list: ServiceStatus[]): ServiceHealth {
	if (list.some((s) => s.health === 'ratelimited')) return 'ratelimited';
	if (list.some((s) => s.health === 'error')) return 'error';
	if (list.every((s) => s.health === 'unknown')) return 'unknown';
	return 'ok';
}

export function getSnapshot(): MonitorSnapshot {
	const list = Array.from(services.values());
	return {
		overall: computeOverall(list),
		services: list,
		generatedAt: Date.now()
	};
}

// Pre-register the four main services so the badge has rows to render before
// any traffic flows through.
registerService('tcg');
registerService('pokeapi');
registerService('poketrace');
registerService('price-tracker');
