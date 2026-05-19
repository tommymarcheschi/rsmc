/**
 * Beckett (BGS) — population report client
 *
 * Beckett publishes its own pop report (beckett.com/grading/pop-report, a
 * Next.js app proxied at /gradingpopreport). Reverse-engineered 2026-05-18
 * from the Next bundle: the SPA calls a plain JSON API. NO auth, NO
 * Cloudflare, works from a bare datacenter IP. Recipe (see
 * project_grading_data_sources):
 *
 *   GET https://www.beckett.com/api/grading/pop-report
 *       ?sport_id=477173            (Pokémon, Beckett's sport id)
 *       &set_name=<keyword>         (substring match across Beckett set names)
 *       &set_id=<id>                (drill into one set → per-card rows)
 *       &page=N&limit=M&show_totals=1
 *
 * Response: { total_records, page, size,
 *   sets:{<setId>:<name>}, sets_summary_data:{<setId>:<count>},
 *   grade_summary_data:[{ set_id,set_name,card_num,player_name,title,
 *     fg10..fg100,fgB100,non_bccg_card_total, ... }] }
 *
 * BGS scale: half-point 1–10. fgNN = grade NN/10 (fg10=1.0 … fg95=9.5,
 * fg100=10 / Pristine), fgB100 = Black Label 10. Distribution map keys:
 * "1","1.5",…,"9.5","10","10BL". Honest-or-null: a zero/absent grade is
 * absent from the map, never fabricated.
 */

const BGS_API = 'https://www.beckett.com/api/grading/pop-report';
/** Beckett's Pokémon sport id (verified live from the legacy selector). */
export const BGS_POKEMON_SPORT_ID = '477173';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class BgsGradingError extends Error {}

async function bgsRequest<T>(params: Record<string, string>, timeoutMs = 40000): Promise<T> {
	const qs = Object.entries(params)
		.filter(([, v]) => v !== '' && v != null)
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
		.join('&');
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(`${BGS_API}?${qs}`, {
			headers: {
				'User-Agent': UA,
				Accept: 'application/json',
				Referer: 'https://www.beckett.com/gradingpopreport'
			},
			signal: ctrl.signal
		});
	} catch (e) {
		throw new BgsGradingError(`network: ${(e as Error).message}`);
	} finally {
		clearTimeout(t);
	}
	const text = await res.text();
	// The Next app HTML shell (proxy catch-all) starts with "<" — treat as
	// "endpoint moved", never as data.
	if (text.startsWith('<')) throw new BgsGradingError('non-JSON (HTML shell)');
	let j: unknown;
	try {
		j = JSON.parse(text);
	} catch {
		throw new BgsGradingError('non-JSON body');
	}
	if (j && typeof j === 'object' && 'status' in j && (j as { status: number }).status >= 400) {
		const e = j as { status: number; message?: string };
		throw new BgsGradingError(`${e.status}: ${e.message ?? 'error'}`);
	}
	if (!res.ok) throw new BgsGradingError(`HTTP ${res.status}`);
	return j as T;
}

// fgNN → grade label. fg10=1.0 … fg95=9.5, fg100=10, fgB100=Black Label 10.
function fgKeyToLabel(key: string): string | null {
	if (/^fgB100$/i.test(key)) return '10BL';
	const m = key.match(/^fg(\d{2,3})$/i);
	if (!m) return null;
	const n = parseInt(m[1], 10); // 10..100 → grade×10
	if (n < 10 || n > 100) return null;
	return `${n / 10}`; // 1, 1.5, … 9.5, 10

}

export type BgsGradeMap = Record<string, number>;

interface BgsRawRow {
	set_id?: string;
	set_name?: string;
	card_num?: string;
	player_name?: string;
	title?: string;
	non_bccg_card_total?: string | number;
	[k: string]: unknown;
}

export interface BgsCardRow {
	cardNumber: string;
	playerName: string;
	title: string;
	setId: string;
	setName: string;
	grades: BgsGradeMap;
}

interface BgsResponse {
	total_records?: number;
	page?: string | number;
	size?: string | number;
	sets?: Record<string, string>;
	sets_summary_data?: Record<string, string | number>;
	/** Beckett returns TWO id spaces: `sets` keys are display ids; the
	 *  per-card drill-down wants the matching `lpg_set_ids` value, which is
	 *  also the `set_id` carried on each grade_summary_data row. */
	lpg_set_ids?: Record<string, string | number>;
	grade_summary_data?: BgsRawRow[];
}

function rowToGrades(row: BgsRawRow): BgsGradeMap {
	const out: BgsGradeMap = {};
	for (const [k, v] of Object.entries(row)) {
		if (!/^fg/i.test(k)) continue;
		const label = fgKeyToLabel(k);
		if (!label) continue;
		const n = Number(v);
		if (!Number.isFinite(n) || n <= 0) continue;
		out[label] = (out[label] ?? 0) + n;
	}
	return out;
}

export interface BgsSetCandidate {
	/** Beckett display set id (the `sets` map key). */
	setId: string;
	/** lpg id — what the per-card drill-down + row.set_id actually use. */
	lpgSetId: string;
	name: string;
	count: number;
}

/** Set candidates for a keyword. Beckett's `set_name` is a constrained
 *  substring filter over its bare set-name field (NOT the displayed
 *  "<year> Pokemon <name>"), so a tracked set may surface under an
 *  unexpected keyword — the caller fuzzy-ranks and the card-number
 *  overlap gate (in the crawler) is the real correctness guarantee. */
export async function searchBgsSets(setNameKeyword: string): Promise<BgsSetCandidate[]> {
	const d = await bgsRequest<BgsResponse>({
		sport_id: BGS_POKEMON_SPORT_ID,
		set_name: setNameKeyword,
		show_totals: '1',
		page: '1',
		limit: '100'
	});
	const sets = d.sets ?? {};
	const counts = d.sets_summary_data ?? {};
	const lpg = d.lpg_set_ids ?? {};
	return Object.entries(sets).map(([setId, name]) => ({
		setId,
		lpgSetId: String(lpg[setId] ?? setId),
		name: String(name),
		count: Number(counts[setId] ?? 0)
	}));
}

/** Walk all pages of one Beckett set's per-card grade rows.
 *  The drill-down REQUEST takes the DISPLAY set id (the `sets` map key)
 *  plus a `set_name` keyword that surfaced it; each returned row's
 *  `set_id` is the lpg id, which we filter on. */
export async function getBgsCardsForSet(args: {
	setNameKeyword: string;
	displaySetId: string;
	lpgSetId: string;
	limit?: number;
	maxPages?: number;
	onPage?: () => Promise<void>;
}): Promise<BgsCardRow[]> {
	const limit = args.limit ?? 100;
	const maxPages = args.maxPages ?? 60;
	const out: BgsCardRow[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const d = await bgsRequest<BgsResponse>({
			sport_id: BGS_POKEMON_SPORT_ID,
			set_name: args.setNameKeyword,
			set_id: args.displaySetId,
			show_totals: '1',
			page: String(page),
			limit: String(limit)
		});
		const rows = (d.grade_summary_data ?? []).filter(
			(r) => String(r.set_id) === args.lpgSetId
		);
		for (const r of rows)
			out.push({
				cardNumber: String(r.card_num ?? ''),
				playerName: String(r.player_name ?? ''),
				title: String(r.title ?? ''),
				setId: String(r.set_id ?? args.lpgSetId),
				setName: String(r.set_name ?? ''),
				grades: rowToGrades(r)
			});
		const total = Number(d.total_records ?? out.length);
		if ((d.grade_summary_data ?? []).length === 0 || out.length >= total) break;
		if (args.onPage) await args.onPage();
	}
	return out;
}

// --------------------------------------------------------------------------
// Distribution scalars
// --------------------------------------------------------------------------

export interface BgsPopScalars {
	total: number;
	/** BGS 10 + Black Label 10 — the "at 10" scalar. */
	grade10: number;
	gemRate: number | null;
}

export function bgsPopScalars(grades: BgsGradeMap | null | undefined): BgsPopScalars {
	if (!grades) return { total: 0, grade10: 0, gemRate: null };
	let total = 0;
	for (const v of Object.values(grades)) total += Number(v) || 0;
	const grade10 = (Number(grades['10']) || 0) + (Number(grades['10BL']) || 0);
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

/** A safe `set_name` drill keyword from a Beckett set name: the first
 *  core word (≥3 chars) after stripping the leading year and "Pokemon"
 *  decoration — guaranteed to be a substring of that set's name, which
 *  is what the Beckett filter requires. */
export function bgsDrillKeyword(beckettSetName: string): string {
	const core = beckettSetName
		.replace(/^\s*\d{4}\s+/, '')
		.replace(/\bpok[eé]?mon\b/gi, ' ')
		.replace(/\b(tcg|card game)\b/gi, ' ')
		.trim();
	const w = core.split(/\s+/).find((t) => t.replace(/[^a-z0-9]/gi, '').length >= 3);
	return (w ?? core.split(/\s+/)[0] ?? beckettSetName).trim();
}

/** On-query single-card BGS pop given a known Beckett set. Largest print wins. */
export async function getBgsCardPop(args: {
	setNameKeyword: string;
	displaySetId: string;
	lpgSetId: string;
	cardNumber: string;
}): Promise<BgsGradeMap | null> {
	const want = normNum(args.cardNumber);
	if (!want) return null;
	const cards = await getBgsCardsForSet(args);
	const hits = cards.filter((c) => normNum(c.cardNumber) === want);
	if (hits.length === 0) return null;
	return hits.reduce((a, b) =>
		bgsPopScalars(b.grades).total > bgsPopScalars(a.grades).total ? b : a
	).grades;
}
