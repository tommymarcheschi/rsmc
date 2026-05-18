#!/usr/bin/env tsx
/**
 * Trove — Track A: TAG Grading population acquisition
 *
 * TAG publishes its own authoritative pop report. This crawler closes the
 * TAG gap the same way gemrate-pop.ts closes PSA: per-year set lists from
 * api.taggrading.com, matched to our tracked_sets and PROVEN by card_number
 * overlap before any write (honesty gate — a wrong set match is rejected,
 * never persisted). See src/lib/services/tag-grading.ts for the protocol and
 * project_grading_data_sources / feedback_data_is_always_findable.
 *
 * Mirrors Track A conventions: env-driven, per-set failure isolation, alert
 * only on SUSTAINED failure, heartbeat status JSON, clean SIGTERM, one-shot
 * (nightly). Writes the FULL grade distribution into tag_grades plus the
 * scalar tag_pop_total/tag_pop_10/tag_gem_rate and provenance.
 *
 * Usage:
 *   tsx scripts/tag-pop.ts --all                  # gap-prioritised crawl
 *   tsx scripts/tag-pop.ts --set base1            # one set
 *   tsx scripts/tag-pop.ts --set base1 --dry-run  # fetch+match, no write
 *   tsx scripts/tag-pop.ts --verify base1         # strict end-to-end check
 *   tsx scripts/tag-pop.ts --all --year 1999      # restrict to a year
 *
 * Env knobs (.env.local or process env):
 *   PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or PUBLISHABLE key)
 *   TROVE_TAG_CATEGORY          override category name (default auto/Pokémon)
 *   TROVE_TAG_REQ_DELAY_MS      pacing between requests       (default 1200)
 *   TROVE_TAG_SET_LIMIT         cap sets per run, 0 = all     (default 0)
 *   TROVE_TAG_CARD_LIMIT        page size for /pops/card       (default 100)
 *   TROVE_TAG_MAX_PAGES         max card pages per set         (default 60)
 *   TROVE_TAG_FAIL_ALERT        consec set failures -> alert   (default 5)
 *   TROVE_TAG_STATUS            heartbeat file path
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
	resolvePokemonCategory,
	getTagSets,
	getAllTagCards,
	tagPopScalars,
	TagGradingError,
	type TagSetRow,
	type TagCardRow,
	type TagGradeMap
} from '../src/lib/services/tag-grading.js';
import {
	yearOf,
	scoreTagCandidate,
	normCardNumber,
	tagOverride,
	hasTagOverride
} from './tag-aliases.js';

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

const REQ_DELAY_MS = num(process.env.TROVE_TAG_REQ_DELAY_MS, 1200);
const SET_LIMIT = num(process.env.TROVE_TAG_SET_LIMIT, 0);
const CARD_LIMIT = num(process.env.TROVE_TAG_CARD_LIMIT, 100);
const MAX_PAGES = num(process.env.TROVE_TAG_MAX_PAGES, 60);
const FAIL_ALERT = num(process.env.TROVE_TAG_FAIL_ALERT, 5);
const STATUS_FILE =
	process.env.TROVE_TAG_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'tag-pop-status.json');

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

// --------------------------------------------------------------------------
// Validation gate — prove the matched TAG set is actually OUR set
// --------------------------------------------------------------------------

interface IndexCard {
	card_id: string;
	card_number: string | null;
}

async function loadIndexCards(setId: string): Promise<IndexCard[]> {
	const { data, error } = await supabase
		.from('card_index')
		.select('card_id, card_number')
		.eq('set_id', setId);
	if (error) throw new Error(`card_index load failed: ${error.message}`);
	return (data ?? []) as IndexCard[];
}

interface Matched {
	card_id: string;
	grades: TagGradeMap;
}
interface Validation {
	ok: boolean;
	reason: string;
	matches: Matched[];
}

/** Among TAG rows sharing a card number (parallels/variations), pick the
 *  largest-population print — deterministic and real; we hold one row per
 *  number until the variant layer exists (north-star decision 5). */
function pickCanonical(rows: TagCardRow[]): TagCardRow {
	return rows.reduce((a, b) =>
		tagPopScalars(b.grades).total > tagPopScalars(a.grades).total ? b : a
	);
}

function validate(tagCards: TagCardRow[], idx: IndexCard[]): Validation {
	if (tagCards.length === 0)
		return { ok: false, reason: 'no TAG cards', matches: [] };
	if (idx.length === 0)
		return { ok: false, reason: 'no card_index rows for set', matches: [] };

	const idxByNum = new Map<string, string>();
	for (const c of idx) {
		const k = normCardNumber(c.card_number);
		if (k && !idxByNum.has(k)) idxByNum.set(k, c.card_id);
	}

	const tagByNum = new Map<string, TagCardRow[]>();
	for (const r of tagCards) {
		const k = normCardNumber(r.cardNumber);
		if (!k) continue;
		const arr = tagByNum.get(k);
		if (arr) arr.push(r);
		else tagByNum.set(k, [r]);
	}

	const matches: Matched[] = [];
	let matchedNums = 0;
	for (const [k, rows] of tagByNum) {
		const cardId = idxByNum.get(k);
		if (!cardId) continue;
		matchedNums++;
		matches.push({ card_id: cardId, grades: pickCanonical(rows).grades });
	}

	const denom = Math.min(tagByNum.size, idxByNum.size);
	const overlapPct = denom > 0 ? (matchedNums / denom) * 100 : 0;
	const ok = overlapPct >= 60 && matchedNums >= Math.min(5, idxByNum.size);
	return {
		ok,
		reason: ok
			? `overlap ${overlapPct.toFixed(0)}% (${matchedNums}/${denom})`
			: `low overlap ${overlapPct.toFixed(0)}% (${matchedNums}/${denom}) — match likely wrong`,
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
	note: string;
}

// year -> TAG set rows (fetched once per run, reused across our sets)
const yearSetCache = new Map<number, TagSetRow[]>();

async function tagSetsForYear(category: string, year: number): Promise<TagSetRow[]> {
	const cached = yearSetCache.get(year);
	if (cached) return cached;
	const rows = await getTagSets({ categoryName: category, year });
	yearSetCache.set(year, rows);
	await sleep(REQ_DELAY_MS);
	return rows;
}

async function processSet(
	category: string,
	set: TrackedSet,
	idx: IndexCard[],
	dryRun: boolean
): Promise<SetResult> {
	const year = yearOf(set.release_date);
	if (!Number.isFinite(year))
		return { setId: set.set_id, ok: false, wrote: 0, note: 'no release year' };

	let tagSets: TagSetRow[];
	try {
		tagSets = await tagSetsForYear(category, year);
	} catch (e) {
		return {
			setId: set.set_id,
			ok: false,
			wrote: 0,
			note: `set-list fetch failed: ${(e as Error).message}`
		};
	}

	// Candidate TAG (brand, set) keys: override first, else fuzzy-scored.
	const ovr = tagOverride(set.set_id);
	const scored = tagSets
		.map((r) => ({ r, s: scoreTagCandidate(set.set_name, r.cardSetName) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s);
	const candidates: TagSetRow[] = [];
	if (ovr) {
		const exact = tagSets.find(
			(r) =>
				r.brandName.trim() === ovr.brandName.trim() &&
				r.cardSetName.trim() === ovr.cardSetName.trim()
		);
		if (exact) candidates.push(exact);
	}
	for (const x of scored) if (!candidates.includes(x.r)) candidates.push(x.r);

	if (candidates.length === 0)
		return {
			setId: set.set_id,
			ok: false,
			wrote: 0,
			note: 'NO ALIAS — no TAG set scored for this year (add to tag-aliases OVERRIDES)'
		};

	for (const cand of candidates) {
		if (stopping) break;
		let cards: TagCardRow[];
		try {
			cards = await getAllTagCards({
				category,
				year,
				brandName: cand.brandName,
				setName: cand.cardSetName,
				limit: CARD_LIMIT,
				maxPages: MAX_PAGES
			});
		} catch (e) {
			log(
				`  [${set.set_id}] fetch "${cand.cardSetName}"/"${cand.brandName.trim()}" failed: ${(e as Error).message}`
			);
			await sleep(REQ_DELAY_MS);
			continue;
		}
		await sleep(REQ_DELAY_MS);

		const v = validate(cards, idx);
		if (!v.ok) {
			log(
				`  [${set.set_id}] reject "${cand.cardSetName}"/"${cand.brandName.trim()}" — ${v.reason}`
			);
			continue;
		}
		log(
			`  [${set.set_id}] match "${cand.cardSetName}"/"${cand.brandName.trim()}" — ${v.reason}` +
				(hasTagOverride(set.set_id) ? ' (override)' : ' (fuzzy)')
		);

		if (dryRun) {
			const sample = v.matches[0];
			log(
				`  [${set.set_id}] DRY: ${v.matches.length} cards` +
					(sample
						? ` e.g. ${sample.card_id} -> ${JSON.stringify({
								...tagPopScalars(sample.grades),
								grades: sample.grades
							})}`
						: '')
			);
			return {
				setId: set.set_id,
				ok: true,
				wrote: 0,
				note: `DRY ${cand.cardSetName}/${cand.brandName.trim()}`
			};
		}

		const now = new Date().toISOString();
		let wrote = 0;
		let errs = 0;
		for (const m of v.matches) {
			const sc = tagPopScalars(m.grades);
			const { error } = await supabase
				.from('card_index')
				.update({
					tag_pop_total: sc.total,
					tag_pop_10: sc.grade10,
					tag_gem_rate: sc.gemRate,
					tag_grades: m.grades,
					tag_fetched_at: now,
					tag_synced_at: now,
					tag_set_name: cand.cardSetName,
					tag_brand_name: cand.brandName.trim(),
					tag_year: year
				})
				.eq('card_id', m.card_id);
			if (error) errs++;
			else wrote++;
		}
		log(`  [${set.set_id}] wrote ${wrote}, errors ${errs} (${v.reason})`);
		return {
			setId: set.set_id,
			ok: wrote > 0,
			wrote,
			note: `${cand.cardSetName}/${cand.brandName.trim()}`
		};
	}

	return {
		setId: set.set_id,
		ok: false,
		wrote: 0,
		note: 'NO MATCH — all candidates failed the overlap gate'
	};
}

// --------------------------------------------------------------------------
// Gap prioritisation — never-synced sets first, then staleest
// --------------------------------------------------------------------------

async function prioritisedSets(): Promise<TrackedSet[]> {
	const { data: tracked, error } = await supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date')
		.eq('enabled', true);
	if (error) throw new Error(`tracked_sets load failed: ${error.message}`);
	const sets = (tracked ?? []) as TrackedSet[];

	// Per-set TAG freshness from card_index (paged; only 2 small columns).
	const minSynced = new Map<string, number | null>(); // null = has unsynced
	let from = 0;
	const page = 1000;
	for (;;) {
		const { data, error: e } = await supabase
			.from('card_index')
			.select('set_id, tag_synced_at')
			.range(from, from + page - 1);
		if (e) throw new Error(`card_index scan failed: ${e.message}`);
		const rows = (data ?? []) as Array<{ set_id: string; tag_synced_at: string | null }>;
		for (const r of rows) {
			if (r.tag_synced_at == null) {
				minSynced.set(r.set_id, null);
				continue;
			}
			const cur = minSynced.get(r.set_id);
			if (cur === null) continue; // an unsynced row already pins this set
			const t = Date.parse(r.tag_synced_at);
			if (cur === undefined || t < cur) minSynced.set(r.set_id, t);
		}
		if (rows.length < page) break;
		from += page;
	}

	const rank = (id: string): number => {
		const v = minSynced.get(id);
		if (v === undefined || v === null) return -1; // never-synced first
		return v;
	};
	return sets.sort((a, b) => {
		const ra = rank(a.set_id);
		const rb = rank(b.set_id);
		if (ra !== rb) return ra - rb;
		return yearOf(a.release_date) - yearOf(b.release_date);
	});
}

// --------------------------------------------------------------------------
// Status / alerting (mirrors gemrate-pop)
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
				`display notification "tag-pop: ${msg}" with title "Trove" sound name "Basso"`
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
			year: { type: 'string' },
			limit: { type: 'string' }
		},
		strict: false
	});

	const dryRun = !!values['dry-run'] || !!values.verify;
	const yearFilter = values.year ? parseInt(values.year as string, 10) : null;

	let setIds: string[];
	if (values.verify) setIds = [values.verify as string];
	else if (values.set) setIds = (values.set as string).split(',').map((s) => s.trim());
	else if (values.all) setIds = [];
	else {
		console.log('Usage: --all | --set <id,..> | --verify <id> [--dry-run] [--year YYYY]');
		return;
	}

	let category: string;
	try {
		category = process.env.TROVE_TAG_CATEGORY || (await resolvePokemonCategory());
	} catch (e) {
		console.error(`Cannot resolve TAG category: ${(e as Error).message}`);
		process.exit(1);
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
	if (yearFilter)
		sets = sets.filter((s) => yearOf(s.release_date) === yearFilter);

	const cap = num(values.limit as string, SET_LIMIT);
	if (cap > 0) sets = sets.slice(0, cap);

	log(
		`tag-pop start — ${sets.length} set(s), category="${category}"` +
			`${yearFilter ? ` year=${yearFilter}` : ''}${dryRun ? ' DRY-RUN' : ''}`
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
			const r = await processSet(category, set, idx, dryRun);
			results.push(r);
			totalWrote += r.wrote;
			if (r.ok) consecBad = 0;
			else {
				consecBad++;
				if (r.note.startsWith('NO ALIAS') || r.note.startsWith('NO MATCH'))
					needAlias.push(set.set_id);
			}
			log(
				`(${i + 1}/${sets.length}) ${set.set_id} — ${r.ok ? 'OK' : 'MISS'} ` +
					`wrote=${r.wrote} ${r.note}`
			);
		} catch (e) {
			consecBad++;
			const m = e instanceof TagGradingError ? `TAG: ${e.message}` : (e as Error).message;
			log(`(${i + 1}/${sets.length}) ${set.set_id} — ERROR ${m}`);
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
			alertSustained(`${consecBad} consecutive sets failed`);
			consecBad = 0;
		}
	}

	const okCount = results.filter((r) => r.ok).length;
	log(`tag-pop done — ${okCount}/${sets.length} sets ok, ${totalWrote} card-rows written`);
	if (needAlias.length)
		log(`NEED ALIAS (add to tag-aliases OVERRIDES): ${needAlias.join(', ')}`);
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
