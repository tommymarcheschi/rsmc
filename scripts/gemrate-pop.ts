#!/usr/bin/env tsx
/**
 * Trove — Track A: GemRate population acquisition
 *
 * The catalog is complete; graded-data DEPTH is the crisis (PSA pop ~5%,
 * CGC ~3%, BGS/SGC ~0%). PriceCharting is per-card and Cloudflare-slow.
 * GemRate serves an ENTIRE set's per-card pop as one request, so a few
 * hundred set-level fetches close what 20k card fetches can't.
 * See project_gemrate_source / project_north_star (decision 3, both tracks).
 *
 * Shape mirrors the Track B conventions: env-driven (no Mac assumptions in
 * this file — the plist is the only Mac wrapper, lifts to Fly.io as-is),
 * coverage-ledger observable (writes psa_/cgc_/bgs_/sgc_pop_total which
 * coverage-ledger.ts already tallies), per-set failure isolation, alert
 * only on SUSTAINED failure, heartbeat status JSON, clean SIGTERM.
 *
 * Honesty gate: a WRONG set alias would silently write another set's pop
 * onto our cards. Every fetched candidate is validated against our own
 * card_index for that set (card_number overlap) BEFORE any write. A bad
 * alias guess is rejected at the gate, never persisted.
 *
 * One-shot (nightly), not a perpetual worker — GemRate is set-level so the
 * whole catalog is a few hundred requests. Runs after the acquisition
 * crons, before coverage-ledger, so the ledger captures the fresh pop.
 *
 * Usage:
 *   tsx scripts/gemrate-pop.ts --all                 # gap-prioritised crawl
 *   tsx scripts/gemrate-pop.ts --set base1           # one set, all graders
 *   tsx scripts/gemrate-pop.ts --set base1 --dry-run # fetch+parse, no write
 *   tsx scripts/gemrate-pop.ts --verify base1        # strict end-to-end check
 *   tsx scripts/gemrate-pop.ts --fixture f.html --set base1 --grader psa
 *                                                    # parse a captured page
 *
 * Env knobs (.env.local or process env):
 *   PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or PUBLISHABLE key)
 *   TROVE_GEMRATE_GRADERS        default "psa,cgc,bgs,sgc"
 *   TROVE_GEMRATE_REQ_DELAY_MS   pacing between requests   (default 9000)
 *   TROVE_GEMRATE_MAX_RETRIES    retries per request       (default 4)
 *   TROVE_GEMRATE_BACKOFF_MS     base backoff on challenge (default 60000)
 *   TROVE_GEMRATE_SET_LIMIT      cap sets per run, 0 = all (default 0)
 *   TROVE_GEMRATE_SKIP_FRESH_DAYS skip sets synced within N days (default 3)
 *   TROVE_GEMRATE_FAIL_ALERT     consec set failures -> alert (default 5)
 *   TROVE_GEMRATE_STATUS         heartbeat file path
 *   GEMRATE_PROXY_URL            optional CF proxy base (mirrors DEV_SERVER_URL
 *                                trick); if set, used as fallback fetch path
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { gemrateCandidates, hasOverride, yearOf, type GemrateTarget } from './gemrate-aliases.js';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ??
	process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
	'';
if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing SUPABASE_URL or SUPABASE_KEY. Check .env.local');
	process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const num = (v: string | undefined, d: number) => {
	const n = parseInt(v ?? '', 10);
	return Number.isFinite(n) && n >= 0 ? n : d;
};

const GRADERS = (process.env.TROVE_GEMRATE_GRADERS ?? 'psa,cgc,bgs,sgc')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);
const REQ_DELAY_MS = num(process.env.TROVE_GEMRATE_REQ_DELAY_MS, 9000);
const MAX_RETRIES = num(process.env.TROVE_GEMRATE_MAX_RETRIES, 4);
const BACKOFF_MS = num(process.env.TROVE_GEMRATE_BACKOFF_MS, 60000);
const SET_LIMIT = num(process.env.TROVE_GEMRATE_SET_LIMIT, 0);
const SKIP_FRESH_DAYS = num(process.env.TROVE_GEMRATE_SKIP_FRESH_DAYS, 3);
const FAIL_ALERT = num(process.env.TROVE_GEMRATE_FAIL_ALERT, 5);
const STATUS_FILE =
	process.env.TROVE_GEMRATE_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'gemrate-pop-status.json');
const PROXY_URL = process.env.GEMRATE_PROXY_URL ?? '';

const GR_BASE = 'https://www.gemrate.com';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

// --------------------------------------------------------------------------
// GemRate fetch — curl subprocess (its TLS fingerprint passes Cloudflare
// where Node undici 403s, same as the PriceCharting scraper). Cookie jar
// warmed on /set-details (never challenged) then reused on
// /item-details-advanced (intermittently challenged) with it as Referer.
// IP-rate sensitive — heavy pacing + exponential backoff, low volume.
// --------------------------------------------------------------------------

function curl(args: string[]): Promise<{ code: number; stdout: string }> {
	return new Promise((resolve) => {
		execFile(
			'curl',
			args,
			{ encoding: 'utf-8', timeout: 45000, maxBuffer: 64 * 1024 * 1024 },
			(err, stdout) => resolve({ code: err ? 1 : 0, stdout: stdout ?? '' })
		);
	});
}

function urlFor(path: string, t: GemrateTarget, grader: string): string {
	const p = new URLSearchParams({
		grader,
		year: String(t.year),
		category: t.category,
		set_name: t.setName
	});
	return `${GR_BASE}/${path}?${p.toString()}`;
}

function challenged(html: string, code: number): boolean {
	return code !== 0 || !html || html.includes('Just a moment') || html.length < 2000;
}

/** One challenge-mitigated fetch of item-details-advanced. null on failure. */
async function fetchAdvanced(t: GemrateTarget, grader: string): Promise<string | null> {
	const detailsUrl = urlFor('set-details', t, grader);
	const advancedUrl = urlFor('item-details-advanced', t, grader);
	const jar = join(tmpdir(), `trove-gr-${process.pid}-${grader}.cookies`);

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (stopping) return null;
		if (attempt > 0) {
			const wait = BACKOFF_MS * Math.pow(2, attempt - 1);
			log(`  challenge — backoff ${(wait / 1000) | 0}s then retry ${attempt}/${MAX_RETRIES}`);
			await sleep(wait);
		}
		// Warm a clearance cookie on the never-challenged set-details page.
		await curl([
			'-sL', '--compressed', '--max-time', '30', '-c', jar,
			'-H', `User-Agent: ${UA}`,
			'-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
			'-H', 'Accept-Language: en-US,en;q=0.9',
			'-o', '/dev/null', detailsUrl
		]);
		await sleep(1500);
		const r = await curl([
			'-sL', '--compressed', '--max-time', '40', '-b', jar, '-c', jar,
			'-H', `User-Agent: ${UA}`,
			'-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
			'-H', 'Accept-Language: en-US,en;q=0.9',
			'-H', `Referer: ${detailsUrl}`,
			advancedUrl
		]);
		if (!challenged(r.stdout, r.code)) return r.stdout;

		// Optional proxy fallback (mirrors refresh-index's DEV_SERVER_URL
		// trick — a server-context fetch that passes CF). Best-effort.
		if (PROXY_URL) {
			try {
				const res = await fetch(
					`${PROXY_URL}/api/gemrate?grader=${grader}&year=${t.year}` +
						`&category=${t.category}&set_name=${encodeURIComponent(t.setName)}`
				);
				if (res.ok) {
					const html = await res.text();
					if (!challenged(html, 0)) return html;
				}
			} catch {
				/* fall through to retry */
			}
		}
	}
	return null;
}

// --------------------------------------------------------------------------
// Parse — `var RowData = '<json>'; RowData = JSON.parse(RowData);`
// The literal is a single-quoted JS string; inner JSON uses double quotes,
// so only \' and \\ need un-escaping before JSON.parse.
// --------------------------------------------------------------------------

interface GemrateCard {
	card_number?: string;
	name?: string;
	parallel?: string;
	details?: string;
	g10?: number;
	card_gems?: number;
	card_total_grades?: number;
	card_gem_rate?: number;
	ct_diff_p1?: number;
	gemrate_id?: string;
	last_updated?: string;
}

function parseRowData(html: string): GemrateCard[] | null {
	const m = html.match(/var\s+RowData\s*=\s*'([\s\S]*?)';\s*\n?\s*RowData\s*=\s*JSON\.parse/);
	if (!m) return null;
	const literal = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
	try {
		const arr = JSON.parse(literal);
		return Array.isArray(arr) ? (arr as GemrateCard[]) : null;
	} catch {
		return null;
	}
}

const normNum = (v: unknown): string =>
	String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/^0+(?=\d)/, '');

const CANONICAL_PARALLEL = /^(base|unlimited|normal|standard|)$/i;

/**
 * GemRate lists every parallel (Base / 1st Edition / Shadowless / Staff)
 * as its own row. Our card_index has ONE row per card_number (variant
 * layer not built yet — north star decision 5). Pick the canonical print
 * so we don't write a 1st-Edition-only pop onto the unlimited card.
 */
function pickCanonical(rows: GemrateCard[]): GemrateCard | null {
	if (rows.length === 0) return null;
	if (rows.length === 1) return rows[0];
	const base = rows.filter((r) => CANONICAL_PARALLEL.test((r.parallel ?? '').trim()));
	if (base.length === 1) return base[0];
	const pool = base.length > 1 ? base : rows;
	// Deterministic, real: the largest-population print for that number.
	return pool.reduce((a, b) =>
		(b.card_total_grades ?? 0) > (a.card_total_grades ?? 0) ? b : a
	);
}

// --------------------------------------------------------------------------
// Map GemRate -> card_index columns for one grader
// --------------------------------------------------------------------------

function clampGemRate(fraction: number | undefined): number | null {
	if (fraction == null || !Number.isFinite(fraction)) return null;
	const pct = Math.round(fraction * 100 * 100) / 100; // -> percent, 2dp
	return Math.min(999.99, Math.max(0, pct)); // numeric(5,2) safe
}

function popColumns(grader: string, gr: GemrateCard): Record<string, unknown> {
	const total = gr.card_total_grades ?? null;
	const ten = gr.card_gems ?? gr.g10 ?? null;
	const rate = clampGemRate(gr.card_gem_rate);
	const v30 = gr.ct_diff_p1 ?? null;
	const now = new Date().toISOString();
	const cols: Record<string, unknown> = {
		gemrate_id: gr.gemrate_id ?? null,
		gemrate_last_updated: gr.last_updated ?? null,
		gemrate_synced_at: now
	};
	const g = grader; // psa | cgc | bgs | sgc
	cols[`${g}_pop_total`] = total;
	cols[`${g}_pop_10`] = ten;
	cols[`${g}_gem_rate`] = rate;
	cols[`${g}_pop_30d`] = v30;
	cols[`${g}_fetched_at`] = now;
	return cols;
}

// --------------------------------------------------------------------------
// Validation gate — prove the fetched data is actually OUR set
// --------------------------------------------------------------------------

interface IndexCard {
	card_id: string;
	card_number: string | null;
	name: string | null;
}

async function loadIndexCards(setId: string): Promise<IndexCard[]> {
	const { data, error } = await supabase
		.from('card_index')
		.select('card_id, card_number, name')
		.eq('set_id', setId);
	if (error) throw new Error(`card_index load failed: ${error.message}`);
	return (data ?? []) as IndexCard[];
}

interface ValidatedMatch {
	gr: GemrateCard;
	card_id: string;
}

interface Validation {
	ok: boolean;
	reason: string;
	overlapPct: number;
	matches: ValidatedMatch[];
}

/**
 * A candidate alias is accepted only if GemRate's card_numbers
 * substantially overlap our card_index for this set. Threshold is
 * deliberately strict — a wrong set must be rejected, missing a right
 * set (and logging it for a manual override) is the safe failure.
 */
function validate(grRows: GemrateCard[], idx: IndexCard[]): Validation {
	if (grRows.length === 0)
		return { ok: false, reason: 'empty rowdata', overlapPct: 0, matches: [] };
	if (idx.length === 0)
		return { ok: false, reason: 'no card_index rows for set', overlapPct: 0, matches: [] };

	const idxByNum = new Map<string, IndexCard>();
	for (const c of idx) {
		const k = normNum(c.card_number);
		if (k && !idxByNum.has(k)) idxByNum.set(k, c);
	}

	const byNum = new Map<string, GemrateCard[]>();
	for (const r of grRows) {
		const k = normNum(r.card_number);
		if (!k) continue;
		(byNum.get(k) ?? byNum.set(k, []).get(k)!).push(r);
	}

	const matches: ValidatedMatch[] = [];
	let matchedNums = 0;
	for (const [k, rows] of byNum) {
		const idxCard = idxByNum.get(k);
		if (!idxCard) continue;
		matchedNums++;
		const canon = pickCanonical(rows);
		if (canon) matches.push({ gr: canon, card_id: idxCard.card_id });
	}

	const denom = Math.min(byNum.size, idxByNum.size);
	const overlapPct = denom > 0 ? (matchedNums / denom) * 100 : 0;
	// >=60% number overlap AND >=5 matched cards (or all, for tiny sets).
	const ok = overlapPct >= 60 && matchedNums >= Math.min(5, idxByNum.size);
	return {
		ok,
		reason: ok
			? `overlap ${overlapPct.toFixed(0)}% (${matchedNums}/${denom})`
			: `low overlap ${overlapPct.toFixed(0)}% (${matchedNums}/${denom}) — alias likely wrong`,
		overlapPct,
		matches
	};
}

// --------------------------------------------------------------------------
// Per-set processing
// --------------------------------------------------------------------------

interface TrackedSet {
	set_id: string;
	set_name: string;
	release_date: string;
}

interface SetResult {
	setId: string;
	ok: boolean;
	wrote: number;
	graders: string[];
	note: string;
}

async function processSet(
	set: TrackedSet,
	idx: IndexCard[],
	opts: { dryRun: boolean; only?: string; fixture?: string }
): Promise<SetResult> {
	const candidates = gemrateCandidates(set);
	const graders = opts.only ? [opts.only] : GRADERS;
	let resolved: GemrateTarget | null = null;
	let totalWrote = 0;
	const wroteGraders: string[] = [];

	for (const grader of graders) {
		if (stopping) break;

		let html: string | null = null;
		let usedTarget: GemrateTarget | null = null;

		if (opts.fixture) {
			html = readFileSync(opts.fixture, 'utf-8');
			usedTarget = candidates[0] ?? null;
		} else if (resolved) {
			// Alias already proven on the first grader — reuse it.
			html = await fetchAdvanced(resolved, grader);
			usedTarget = resolved;
			await sleep(REQ_DELAY_MS);
		} else {
			for (const cand of candidates) {
				if (stopping) break;
				const tryHtml = await fetchAdvanced(cand, grader);
				await sleep(REQ_DELAY_MS);
				if (!tryHtml) continue;
				const rows = parseRowData(tryHtml);
				if (!rows) continue;
				const v = validate(rows, idx);
				if (v.ok) {
					html = tryHtml;
					usedTarget = cand;
					resolved = cand;
					log(
						`  [${set.set_id}] alias "${cand.setName}" ${cand.year} accepted — ${v.reason}` +
							(hasOverride(set.set_id) ? ' (override)' : ' (heuristic)')
					);
					break;
				}
				log(`  [${set.set_id}] reject "${cand.setName}" ${cand.year} — ${v.reason}`);
			}
		}

		if (!html || !usedTarget) {
			log(`  [${set.set_id}] ${grader}: no usable data (challenge or no alias)`);
			continue;
		}

		const rows = parseRowData(html);
		if (!rows) {
			log(`  [${set.set_id}] ${grader}: RowData parse failed`);
			continue;
		}
		const v = validate(rows, idx);
		if (!v.ok) {
			log(`  [${set.set_id}] ${grader}: validation failed post-fetch — ${v.reason}, skip`);
			continue;
		}

		if (opts.dryRun) {
			const sample = v.matches[0];
			log(
				`  [${set.set_id}] ${grader} DRY: ${v.matches.length} matched, ${v.reason}` +
					(sample
						? ` e.g. ${sample.card_id} -> ${JSON.stringify(popColumns(grader, sample.gr))}`
						: '')
			);
			wroteGraders.push(grader);
			continue;
		}

		let wrote = 0;
		let errs = 0;
		for (const mt of v.matches) {
			const { error } = await supabase
				.from('card_index')
				.update({
					...popColumns(grader, mt.gr),
					gemrate_set_name: usedTarget.setName,
					gemrate_year: usedTarget.year
				})
				.eq('card_id', mt.card_id);
			if (error) errs++;
			else wrote++;
		}
		totalWrote += wrote;
		wroteGraders.push(grader);
		log(`  [${set.set_id}] ${grader}: wrote ${wrote}, errors ${errs} (${v.reason})`);
	}

	const ok = wroteGraders.length > 0;
	return {
		setId: set.set_id,
		ok,
		wrote: totalWrote,
		graders: wroteGraders,
		note: resolved
			? `alias=${resolved.setName}/${resolved.year}`
			: opts.fixture
				? 'fixture'
				: 'NO ALIAS RESOLVED — add to gemrate-aliases OVERRIDES'
	};
}

// --------------------------------------------------------------------------
// Gap prioritisation — worst pop coverage first (coverage_ledger driven)
// --------------------------------------------------------------------------

async function prioritisedSets(): Promise<TrackedSet[]> {
	const { data: tracked, error } = await supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date')
		.eq('enabled', true);
	if (error) throw new Error(`tracked_sets load failed: ${error.message}`);
	const sets = (tracked ?? []) as TrackedSet[];

	// Latest coverage_ledger snapshot → psa_pop coverage ratio per set.
	const { data: led } = await supabase
		.from('coverage_ledger')
		.select('set_id, indexed, psa_pop, snapshot_date')
		.order('snapshot_date', { ascending: false })
		.limit(2000);
	const cov = new Map<string, number>();
	for (const r of (led ?? []) as Array<{
		set_id: string;
		indexed: number;
		psa_pop: number;
	}>) {
		if (!cov.has(r.set_id))
			cov.set(r.set_id, r.indexed > 0 ? r.psa_pop / r.indexed : 0);
	}

	return sets.sort((a, b) => {
		const ca = cov.get(a.set_id) ?? 0;
		const cb = cov.get(b.set_id) ?? 0;
		if (ca !== cb) return ca - cb; // worst-covered first
		return yearOf(a.release_date) - yearOf(b.release_date); // then oldest
	});
}

// --------------------------------------------------------------------------
// Status / alerting (mirrors enrich-worker)
// --------------------------------------------------------------------------

function writeStatus(s: Record<string, unknown>) {
	try {
		mkdirSync(dirname(STATUS_FILE), { recursive: true });
		writeFileSync(STATUS_FILE, JSON.stringify({ updated_at: ts(), ...s }, null, 2));
	} catch (e) {
		log(`status write failed: ${(e as Error).message}`);
	}
}

function alertSustained(msg: string) {
	log(`SUSTAINED FAILURE — ${msg}`);
	if (process.platform === 'darwin') {
		try {
			execFile('/usr/bin/osascript', [
				'-e',
				`display notification "gemrate-pop: ${msg}" with title "Trove" sound name "Basso"`
			]);
		} catch {
			/* best-effort */
		}
	}
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, () => {
		log(`${sig} received — finishing current set then exiting`);
		stopping = true;
	});
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

async function main() {
	const { values } = parseArgs({
		options: {
			set: { type: 'string' },
			all: { type: 'boolean', default: false },
			'dry-run': { type: 'boolean', default: false },
			verify: { type: 'string' },
			fixture: { type: 'string' },
			grader: { type: 'string' },
			limit: { type: 'string' }
		},
		strict: false
	});

	const dryRun = !!values['dry-run'] || !!values.verify;
	const only = values.grader as string | undefined;
	const fixture = values.fixture as string | undefined;

	let setIds: string[];
	if (values.verify) setIds = [values.verify as string];
	else if (values.set) setIds = (values.set as string).split(',').map((s) => s.trim());
	else if (values.all) setIds = [];
	else {
		console.log(
			'Usage: --all | --set <id,..> | --verify <id> [--dry-run] [--grader psa] [--fixture f.html]'
		);
		return;
	}

	let sets: TrackedSet[];
	if (setIds.length > 0) {
		const { data, error } = await supabase
			.from('tracked_sets')
			.select('set_id, set_name, release_date')
			.in('set_id', setIds);
		if (error) throw new Error(error.message);
		sets = (data ?? []) as TrackedSet[];
	} else {
		sets = await prioritisedSets();
	}

	const cap = num(values.limit as string, SET_LIMIT);
	if (cap > 0) sets = sets.slice(0, cap);

	log(
		`gemrate-pop start — ${sets.length} set(s), graders=[${(only ? [only] : GRADERS).join(',')}]` +
			`${dryRun ? ' DRY-RUN' : ''}${fixture ? ` fixture=${fixture}` : ''}`
	);

	let consecBad = 0;
	let totalWrote = 0;
	const needAlias: string[] = [];
	const results: SetResult[] = [];

	for (let i = 0; i < sets.length; i++) {
		if (stopping) {
			log('stopping — clean exit');
			break;
		}
		const set = sets[i];
		try {
			const idx = await loadIndexCards(set.set_id);
			const r = await processSet(set, idx, { dryRun, only, fixture });
			results.push(r);
			totalWrote += r.wrote;
			if (r.ok) consecBad = 0;
			else {
				consecBad++;
				if (r.note.startsWith('NO ALIAS')) needAlias.push(set.set_id);
			}
			log(
				`(${i + 1}/${sets.length}) ${set.set_id} — ${r.ok ? 'OK' : 'MISS'} ` +
					`wrote=${r.wrote} graders=[${r.graders.join(',')}] ${r.note}`
			);
		} catch (e) {
			consecBad++;
			log(`(${i + 1}/${sets.length}) ${set.set_id} — ERROR ${(e as Error).message}`);
		}

		writeStatus({
			phase: stopping ? 'stopping' : 'running',
			processed: i + 1,
			total: sets.length,
			total_wrote: totalWrote,
			consecutive_bad: consecBad,
			need_alias: needAlias
		});

		if (consecBad >= FAIL_ALERT) {
			alertSustained(`${consecBad} consecutive sets failed (challenge or alias)`);
			consecBad = 0;
		}
	}

	const okCount = results.filter((r) => r.ok).length;
	log(
		`gemrate-pop done — ${okCount}/${sets.length} sets ok, ${totalWrote} card-rows written`
	);
	if (needAlias.length)
		log(`NEED ALIAS (add to gemrate-aliases OVERRIDES): ${needAlias.join(', ')}`);
	writeStatus({
		phase: 'done',
		processed: sets.length,
		ok: okCount,
		total_wrote: totalWrote,
		need_alias: needAlias
	});
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
