/**
 * CGC Cards — population report client
 *
 * CGC publishes its own authoritative pop report (cgccards.com/population-
 * report). Reverse-engineered 2026-05-18 from the AngularJS bundle: the SPA
 * calls a plain JSON API at https://production.api.aws.ccg-ops.com/api with
 * the trading-cards research path. NO auth, NO Cloudflare, works from a bare
 * datacenter IP. Recipe (see project_grading_data_sources):
 *
 *   base = https://production.api.aws.ccg-ops.com/api/cards/research/trading-cards
 *   GET {base}/categories/                          -> Pokémon = researchCategoryID 2
 *   GET {base}/subcategories/?researchCategoryID=2   -> eras (researchSubcategoryID)
 *   GET {base}/groups?researchSubcategoryID=<sub>    -> sets   (researchGroupID, name)
 *   GET {base}/population?researchGroupID=<group>    -> per-card full grade ladder
 *   GET {base}/population/update-time/               -> nightly skip-unchanged
 *
 * CGC's scale: integer + half grades 1–10, plus three distinct top tiers —
 * GemMint 10, Pristine 10, Perfect 10 — kept as separate keys. Distribution
 * map keys: "1".."9","1.5".."9.5","10","10P" (Pristine), "10PF" (Perfect).
 * "10" is GemMint 10 (the standard CGC 10). Honest-or-null: a missing field
 * is absent from the map, never fabricated.
 */

const CGC_API = 'https://production.api.aws.ccg-ops.com/api/cards/research/trading-cards';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class CgcGradingError extends Error {}

async function cgcRequest<T>(path: string, timeoutMs = 40000): Promise<T> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(`${CGC_API}${path}`, {
			headers: {
				'User-Agent': UA,
				Accept: 'application/json',
				'Accept-Language': 'en-US',
				Referer: 'https://www.cgccards.com/'
			},
			signal: ctrl.signal
		});
	} catch (e) {
		throw new CgcGradingError(`network: ${(e as Error).message}`);
	} finally {
		clearTimeout(t);
	}
	if (!res.ok) throw new CgcGradingError(`HTTP ${res.status}`);
	const text = await res.text();
	if (!text) throw new CgcGradingError('empty body');
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new CgcGradingError('non-JSON body');
	}
}

// --------------------------------------------------------------------------
// Typed endpoints
// --------------------------------------------------------------------------

export interface CgcCategory {
	researchCategoryID: number;
	name: string;
	importCode?: string;
}
export interface CgcSubcategory {
	researchSubcategoryID: number;
	researchCategoryID: number;
	name: string;
}
export interface CgcGroup {
	researchGroupID: number;
	researchSubcategoryID: number;
	name: string;
	seoName?: string;
	populationCount?: number;
	isEnabled?: boolean;
}
/** Raw population row as the API returns it (population_* fields). */
interface CgcPopRow {
	populationID: number;
	cardNumber: string;
	cardYear?: string;
	[k: string]: unknown;
}
/** grade label -> count, e.g. {"9":27,"9.5":8,"10":12,"10P":2,"10PF":0} */
export type CgcGradeMap = Record<string, number>;
export interface CgcCardRow {
	cardNumber: string;
	cardYear?: string;
	grades: CgcGradeMap;
}

export async function getCgcUpdateTime(): Promise<string | null> {
	try {
		const d = await cgcRequest<{ updateTime?: string }>('/population/update-time/');
		return d?.updateTime ?? null;
	} catch {
		return null;
	}
}

export async function getCgcCategories(): Promise<CgcCategory[]> {
	const d = await cgcRequest<CgcCategory[]>('/categories/');
	return Array.isArray(d) ? d : [];
}

/** Resolve the Pokémon research category id (defensive vs. rename/reorder). */
export async function resolveCgcPokemonCategoryId(): Promise<number> {
	try {
		const cats = await getCgcCategories();
		const hit = cats.find((c) => /pok[eé]?mon/i.test(c.name));
		if (hit) return hit.researchCategoryID;
	} catch {
		/* fall through */
	}
	return 2; // verified 2026-05-18
}

export async function getCgcSubcategories(categoryId: number): Promise<CgcSubcategory[]> {
	const d = await cgcRequest<CgcSubcategory[]>(
		`/subcategories/?researchCategoryID=${categoryId}`
	);
	return Array.isArray(d) ? d : [];
}

export async function getCgcGroups(subcategoryId: number): Promise<CgcGroup[]> {
	const d = await cgcRequest<{ Items?: CgcGroup[] } | CgcGroup[]>(
		`/groups?researchSubcategoryID=${subcategoryId}`
	);
	if (Array.isArray(d)) return d;
	return d?.Items ?? [];
}

// Map raw population_* fields → our compact grade label.
// CGC keys seen: population_<G>_<H> (e.g. 9_0, 9_5, 1_0), plus the three
// distinct 10 tiers GemMint10 / Pristine10 / Perfect10.
// Map raw population_* fields → compact grade labels. Real CGC fields
// (verified live): population_1_0 … 9_5, population_AA (Authentic Altered),
// population_AU (Authentic), GemMint10 / Pristine10 / Perfect10, and
// population_Total. Total is the API's own sum — NEVER fold it into the
// distribution (it would double the count); skip it explicitly.
function rowToGrades(row: CgcPopRow): CgcGradeMap {
	const out: CgcGradeMap = {};
	for (const [k, v] of Object.entries(row)) {
		if (!k.startsWith('population_')) continue;
		const tag = k.slice('population_'.length);
		if (/^Total$/i.test(tag)) continue;
		const n = Number(v);
		if (!Number.isFinite(n) || n <= 0) continue;
		let label: string | null = null;
		if (/^GemMint10$/i.test(tag)) label = '10';
		else if (/^Pristine10$/i.test(tag)) label = '10P';
		else if (/^Perfect10$/i.test(tag)) label = '10PF';
		else if (/^AU$/i.test(tag)) label = 'AU';
		else if (/^AA$/i.test(tag)) label = 'AA';
		else {
			const m = tag.match(/^(\d{1,2})_(\d)$/);
			if (m) {
				const whole = parseInt(m[1], 10);
				label = m[2] === '5' ? `${whole}.5` : `${whole}`;
			}
		}
		if (label) out[label] = (out[label] ?? 0) + n;
	}
	return out;
}

/** Walk all pages for a group. Server page size is fixed (50); paginate by
 *  `page` until TotalCount is reached. Bounded to avoid runaway. */
export async function getCgcCardsForGroup(
	groupId: number,
	opts: { maxPages?: number; onPage?: () => Promise<void> } = {}
): Promise<CgcCardRow[]> {
	const maxPages = opts.maxPages ?? 200;
	const out: CgcCardRow[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const d = await cgcRequest<{ Items?: CgcPopRow[]; TotalCount?: number } | CgcPopRow[]>(
			`/population?researchGroupID=${groupId}&page=${page}`
		);
		const items: CgcPopRow[] = Array.isArray(d) ? d : (d?.Items ?? []);
		const totalCount = Array.isArray(d) ? items.length : (d?.TotalCount ?? 0);
		if (items.length === 0) break;
		for (const r of items)
			out.push({
				cardNumber: String(r.cardNumber ?? ''),
				cardYear: r.cardYear ? String(r.cardYear) : undefined,
				grades: rowToGrades(r)
			});
		if (out.length >= totalCount) break;
		if (opts.onPage) await opts.onPage();
	}
	return out;
}

// --------------------------------------------------------------------------
// Distribution scalars (honest, derived from the full map)
// --------------------------------------------------------------------------

export interface CgcPopScalars {
	total: number;
	/** All three CGC 10 tiers summed — the "at 10" scalar. */
	grade10: number;
	gemRate: number | null;
}

export function cgcPopScalars(grades: CgcGradeMap | null | undefined): CgcPopScalars {
	if (!grades) return { total: 0, grade10: 0, gemRate: null };
	let total = 0;
	for (const v of Object.values(grades)) total += Number(v) || 0;
	const grade10 =
		(Number(grades['10']) || 0) +
		(Number(grades['10P']) || 0) +
		(Number(grades['10PF']) || 0);
	const gemRate =
		total > 0 ? Math.min(999.99, Math.round((grade10 / total) * 10000) / 100) : null;
	return { total, grade10, gemRate };
}

function normNum(v: string | null | undefined): string {
	const s = String(v ?? '')
		.trim()
		.toLowerCase();
	return (s.split('/')[0]?.trim() ?? '').replace(/^0+(?=\d)/, '');
}

/** On-query single-card CGC pop given a known group. Largest print wins. */
export async function getCgcCardPop(args: {
	groupId: number;
	cardNumber: string;
}): Promise<CgcGradeMap | null> {
	const want = normNum(args.cardNumber);
	if (!want) return null;
	const cards = await getCgcCardsForGroup(args.groupId);
	const hits = cards.filter((c) => normNum(c.cardNumber) === want);
	if (hits.length === 0) return null;
	return hits.reduce((a, b) =>
		cgcPopScalars(b.grades).total > cgcPopScalars(a.grades).total ? b : a
	).grades;
}
