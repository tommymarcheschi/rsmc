/**
 * TAG Grading — population report client
 *
 * TAG publishes its own authoritative pop report (my.taggrading.com), backed
 * by https://api.taggrading.com. The API is not Cloudflare-walled and needs
 * no login for pop data, but it protects responses with client-side crypto.
 * Reverse-engineered from the SPA bundle 2026-05-18:
 *
 *   - Request must carry header `x-tag-key` =
 *       sha256( "<HASH_SALT>:" + sortedParamValues.join(",") )  (hex)
 *     where sortedParamValues = the request params with undefined/null/""
 *     dropped, VALUES only (names don't matter), JS-default-sorted. A call
 *     with no params hashes the literal "<HASH_SALT>:".
 *   - Response body is `ivHex:ciphertextHex`, AES-256-CBC, key =
 *       sha256(DEC_PASSPHRASE) (raw 32-byte digest), PKCS7. Decrypted text
 *     is JSON; the real payload is its `.data`.
 *   - Plaintext JSON like {"status":403,...} is an unencrypted error.
 *
 * Keys ship in the client by necessity but are undocumented and can rotate —
 * callers must isolate failures (the nightly crawl fails per-set, never the
 * whole run) and treat a parse/crypto failure as "no data", never fabricate.
 *
 * TAG's scale is 1–10 WITH half grades (1.5 … 8.5) plus "VA"; grade "10" is
 * the gem tier. Distribution maps use those string keys.
 */

import { createHash, createDecipheriv } from 'node:crypto';

const TAG_API = 'https://api.taggrading.com';
const HASH_SALT = 'TZYOj76MKF1Aw0QK0gpAGySALCNgKG';
const DEC_PASSPHRASE = 'K6ucGQIf7viQW9IT0XLUk5MjSIxssgisqj';
const DEC_KEY = createHash('sha256').update(DEC_PASSPHRASE).digest(); // 32 bytes
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class TagGradingError extends Error {}

type ParamVal = string | number | undefined | null;
export type TagParams = Record<string, ParamVal>;

/** Replicates the SPA's x-tag-key input: lodash omitBy(undefined|null|"")
 *  -> Object.values -> Array.prototype.sort() (JS default, code-unit) -> join(","). */
function signParams(params?: TagParams): string {
	let joined = '';
	if (params) {
		const vals = Object.values(params)
			.filter((v) => v !== undefined && v !== null && v !== '')
			.map((v) => String(v));
		vals.sort(); // JS default lexicographic — matches the bundle exactly
		joined = vals.join(',');
	}
	return createHash('sha256').update(`${HASH_SALT}:${joined}`).digest('hex');
}

function decryptBody(raw: string): unknown {
	const idx = raw.indexOf(':');
	if (idx <= 0) throw new TagGradingError('unexpected response shape (no iv:ct)');
	const iv = Buffer.from(raw.slice(0, idx), 'hex');
	const ctHex = raw.slice(idx + 1);
	const d = createDecipheriv('aes-256-cbc', DEC_KEY, iv);
	let out = d.update(ctHex, 'hex', 'utf8');
	out += d.final('utf8');
	const parsed = JSON.parse(out) as { data?: unknown };
	return parsed?.data;
}

async function tagRequest<T>(path: string, params?: TagParams, timeoutMs = 40000): Promise<T> {
	const qs = params
		? '?' +
			Object.entries(params)
				.filter(([, v]) => v !== undefined && v !== null && v !== '')
				.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
				.join('&')
		: '';
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(`${TAG_API}${path}${qs}`, {
			headers: {
				'User-Agent': UA,
				'Content-Type': 'application/json',
				Pragma: 'no-cache',
				'x-tag-key': signParams(params),
				authorization: 'undefined',
				Origin: 'https://my.taggrading.com',
				Referer: 'https://my.taggrading.com/'
			},
			signal: ctrl.signal
		});
	} catch (e) {
		throw new TagGradingError(`network: ${(e as Error).message}`);
	} finally {
		clearTimeout(t);
	}
	const raw = await res.text();
	// Unencrypted JSON == an error envelope (403/400/500/etc).
	if (raw.startsWith('{') || raw.startsWith('[')) {
		let msg = `HTTP ${res.status}`;
		try {
			const j = JSON.parse(raw) as { message?: string; status?: number };
			if (j?.message) msg = `${j.status ?? res.status}: ${j.message}`;
		} catch {
			/* keep generic */
		}
		throw new TagGradingError(msg);
	}
	if (!res.ok) throw new TagGradingError(`HTTP ${res.status}`);
	return decryptBody(raw) as T;
}

// --------------------------------------------------------------------------
// Typed endpoints
// --------------------------------------------------------------------------

export interface TagCategory {
	id: number;
	name: string;
	type: string;
	disable: boolean;
	group: string;
}
export interface TagYearRow {
	cardYear: string;
	numberOfSets: number;
	totalItems: number;
	totalGraded: number;
}
/** grade label ("1".."10","1.5".."8.5","VA") -> count */
export type TagGradeMap = Record<string, number>;
export interface TagSetRow {
	cardSetName: string;
	brandName: string;
	grades: TagGradeMap;
}
export interface TagCardRow {
	cardName: string;
	cardNumber: string;
	variation?: string;
	grades: TagGradeMap;
}
interface TagPaged<T> {
	items: T[];
	total?: number;
	limit?: number;
}

export async function getTagCategories(): Promise<TagCategory[]> {
	// no params -> hashes "<salt>:" ; response .data is the array
	const data = await tagRequest<TagCategory[]>('/references/category');
	return Array.isArray(data) ? data : [];
}

/** Resolve the Pokémon category name as TAG spells it (defensive vs. rename). */
export async function resolvePokemonCategory(): Promise<string> {
	try {
		const cats = await getTagCategories();
		const hit = cats.find((c) => /pok[eé]?mon/i.test(c.name) && !c.disable);
		if (hit) return hit.name;
	} catch {
		/* fall through to the known value */
	}
	return 'Pokémon';
}

export async function getTagYears(categoryName: string): Promise<TagYearRow[]> {
	const d = await tagRequest<TagPaged<TagYearRow>>('/pops/year', { categoryName });
	return d?.items ?? [];
}

export async function getTagSets(args: {
	categoryName: string;
	year: string | number;
	page?: number;
	limit?: number;
}): Promise<TagSetRow[]> {
	const d = await tagRequest<TagPaged<TagSetRow>>('/pops/set', {
		page: args.page ?? 1,
		limit: args.limit ?? 200,
		categoryName: args.categoryName,
		year: args.year
	});
	return d?.items ?? [];
}

export async function getTagCardsPage(args: {
	category: string;
	year: string | number;
	brandName: string;
	setName: string;
	page?: number;
	limit?: number;
}): Promise<TagPaged<TagCardRow>> {
	return tagRequest<TagPaged<TagCardRow>>('/pops/card', {
		page: args.page ?? 1,
		limit: args.limit ?? 100,
		category: args.category,
		year: args.year,
		brandName: args.brandName,
		setName: args.setName
	});
}

/** Walk all pages for one TAG (brand, set, year). Bounded to avoid runaway. */
export async function getAllTagCards(args: {
	category: string;
	year: string | number;
	brandName: string;
	setName: string;
	limit?: number;
	maxPages?: number;
}): Promise<TagCardRow[]> {
	const limit = args.limit ?? 100;
	const maxPages = args.maxPages ?? 60;
	const out: TagCardRow[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const pg = await getTagCardsPage({ ...args, page, limit });
		const items = pg?.items ?? [];
		out.push(...items);
		const total = pg?.total ?? out.length;
		if (out.length >= total || items.length === 0) break;
	}
	return out;
}

/** Normalise a card number for matching: "42/102" -> "42", strip leading
 *  zeros. Mirrors scripts/tag-aliases.normCardNumber so on-query re-verify
 *  and the nightly crawl agree. */
function normNum(v: string | null | undefined): string {
	const s = String(v ?? '')
		.trim()
		.toLowerCase();
	return (s.split('/')[0]?.trim() ?? '').replace(/^0+(?=\d)/, '');
}

/**
 * On-query single-card TAG pop. Given a card's already-known TAG provenance
 * (set/brand/year from a prior crawl) plus its number, return that card's
 * current grade map — or null if not found. Pages the set once; the largest
 * print wins when a number has parallels (matches the crawler's canonical
 * pick). Never throws into the caller's hot path beyond TagGradingError.
 */
export async function getTagCardPop(args: {
	category: string;
	year: string | number;
	brandName: string;
	setName: string;
	cardNumber: string;
}): Promise<TagGradeMap | null> {
	const want = normNum(args.cardNumber);
	if (!want) return null;
	const cards = await getAllTagCards(args);
	const hits = cards.filter((c) => normNum(c.cardNumber) === want);
	if (hits.length === 0) return null;
	return hits.reduce((a, b) =>
		tagPopScalars(b.grades).total > tagPopScalars(a.grades).total ? b : a
	).grades;
}

// --------------------------------------------------------------------------
// Distribution helpers (honest scalars derived from the full map)
// --------------------------------------------------------------------------

export interface TagPopScalars {
	total: number;
	grade10: number;
	/** percent, 2dp, clamped to numeric(5,2) */
	gemRate: number | null;
}

export function tagPopScalars(grades: TagGradeMap | null | undefined): TagPopScalars {
	if (!grades) return { total: 0, grade10: 0, gemRate: null };
	let total = 0;
	for (const v of Object.values(grades)) total += Number(v) || 0;
	const grade10 = Number(grades['10']) || 0;
	const gemRate =
		total > 0 ? Math.min(999.99, Math.round((grade10 / total) * 10000) / 100) : null;
	return { total, grade10, gemRate };
}
