#!/usr/bin/env tsx
/**
 * Trove — CGC Cards population acquisition (like Track A / tag-pop.ts)
 *
 * CGC publishes its own authoritative pop report. This crawler closes the
 * CGC gap exactly the way tag-pop.ts closes TAG: enumerate CGC's real set
 * (group) list, fuzzy-match our tracked_sets against it, and PROVE the pick
 * by card_number overlap before any write (honesty gate — a wrong match is
 * rejected, never persisted). Writes the FULL grade distribution into
 * cgc_grades + the scalar cgc_pop_total/cgc_pop_10/cgc_gem_rate(+_full) and
 * provenance. See src/lib/services/cgc-grading.ts and
 * project_grading_data_sources / feedback_data_is_always_findable.
 *
 * Usage:
 *   tsx scripts/cgc-pop.ts --all                  # gap-prioritised crawl
 *   tsx scripts/cgc-pop.ts --set base1            # one set
 *   tsx scripts/cgc-pop.ts --set base1 --dry-run  # fetch+match, no write
 *
 * Env: PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or PUBLISHABLE);
 *   TROVE_CGC_REQ_DELAY_MS (800) TROVE_CGC_SET_LIMIT (0)
 *   TROVE_CGC_MAX_PAGES (200) TROVE_CGC_FAIL_ALERT (5) TROVE_CGC_STATUS
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
	resolveCgcPokemonCategoryId,
	getCgcSubcategories,
	getCgcGroups,
	getCgcCardsForGroup,
	cgcPopScalars,
	CgcGradingError,
	type CgcGroup,
	type CgcCardRow,
	type CgcGradeMap
} from '../src/lib/services/cgc-grading.js';
import { yearOf, scoreTagCandidate, normCardNumber } from './tag-aliases.js';

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
const REQ_DELAY_MS = num(process.env.TROVE_CGC_REQ_DELAY_MS, 800);
const SET_LIMIT = num(process.env.TROVE_CGC_SET_LIMIT, 0);
const MAX_PAGES = num(process.env.TROVE_CGC_MAX_PAGES, 200);
const FAIL_ALERT = num(process.env.TROVE_CGC_FAIL_ALERT, 5);
const STATUS_FILE =
	process.env.TROVE_CGC_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'cgc-pop-status.json');

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

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
	grades: CgcGradeMap;
}
interface Validation {
	ok: boolean;
	reason: string;
	matches: Matched[];
}

function pickCanonical(rows: CgcCardRow[]): CgcCardRow {
	return rows.reduce((a, b) =>
		cgcPopScalars(b.grades).total > cgcPopScalars(a.grades).total ? b : a
	);
}

/** Same honesty gate as tag-pop: prove the matched CGC group is OUR set by
 *  card-number overlap before writing anything. */
function validate(cgcCards: CgcCardRow[], idx: IndexCard[]): Validation {
	if (cgcCards.length === 0) return { ok: false, reason: 'no CGC cards', matches: [] };
	if (idx.length === 0) return { ok: false, reason: 'no card_index rows', matches: [] };

	const idxByNum = new Map<string, string>();
	for (const c of idx) {
		const k = normCardNumber(c.card_number);
		if (k && !idxByNum.has(k)) idxByNum.set(k, c.card_id);
	}
	const cgcByNum = new Map<string, CgcCardRow[]>();
	for (const r of cgcCards) {
		const k = normCardNumber(r.cardNumber);
		if (!k) continue;
		const arr = cgcByNum.get(k);
		if (arr) arr.push(r);
		else cgcByNum.set(k, [r]);
	}
	const matches: Matched[] = [];
	let matchedNums = 0;
	for (const [k, rows] of cgcByNum) {
		const cardId = idxByNum.get(k);
		if (!cardId) continue;
		matchedNums++;
		matches.push({ card_id: cardId, grades: pickCanonical(rows).grades });
	}
	const denom = Math.min(cgcByNum.size, idxByNum.size);
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

// All Pokémon CGC groups (fetched once per run).
let allGroups: CgcGroup[] | null = null;
async function cgcGroups(categoryId: number): Promise<CgcGroup[]> {
	if (allGroups) return allGroups;
	const subs = await getCgcSubcategories(categoryId);
	await sleep(REQ_DELAY_MS);
	const groups: CgcGroup[] = [];
	for (const s of subs) {
		if (stopping) break;
		try {
			groups.push(...(await getCgcGroups(s.researchSubcategoryID)));
		} catch (e) {
			log(`  subcategory ${s.researchSubcategoryID} groups failed: ${(e as Error).message}`);
		}
		await sleep(REQ_DELAY_MS);
	}
	allGroups = groups;
	log(`CGC group catalogue: ${groups.length} Pokémon groups`);
	return groups;
}

async function processSet(
	categoryId: number,
	set: TrackedSet,
	idx: IndexCard[],
	dryRun: boolean
): Promise<SetResult> {
	let groups: CgcGroup[];
	try {
		groups = await cgcGroups(categoryId);
	} catch (e) {
		return { setId: set.set_id, ok: false, wrote: 0, note: `group-list failed: ${(e as Error).message}` };
	}
	const scored = groups
		.map((g) => ({ g, s: scoreTagCandidate(set.set_name, g.name) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s);
	if (scored.length === 0)
		return { setId: set.set_id, ok: false, wrote: 0, note: 'NO MATCH — no CGC group scored' };

	for (const { g } of scored) {
		if (stopping) break;
		let cards: CgcCardRow[];
		try {
			cards = await getCgcCardsForGroup(g.researchGroupID, {
				maxPages: MAX_PAGES,
				onPage: () => sleep(REQ_DELAY_MS)
			});
		} catch (e) {
			log(`  [${set.set_id}] fetch "${g.name}" failed: ${(e as Error).message}`);
			await sleep(REQ_DELAY_MS);
			continue;
		}
		await sleep(REQ_DELAY_MS);

		const v = validate(cards, idx);
		if (!v.ok) {
			log(`  [${set.set_id}] reject "${g.name}" — ${v.reason}`);
			continue;
		}
		log(`  [${set.set_id}] match "${g.name}" (#${g.researchGroupID}) — ${v.reason}`);

		if (dryRun) {
			const sample = v.matches[0];
			log(
				`  [${set.set_id}] DRY: ${v.matches.length} cards` +
					(sample
						? ` e.g. ${sample.card_id} -> ${JSON.stringify({
								...cgcPopScalars(sample.grades),
								grades: sample.grades
							})}`
						: '')
			);
			return { setId: set.set_id, ok: true, wrote: 0, note: `DRY ${g.name}` };
		}

		const now = new Date().toISOString();
		let wrote = 0;
		let errs = 0;
		for (const m of v.matches) {
			const sc = cgcPopScalars(m.grades);
			const { error } = await supabase
				.from('card_index')
				.update({
					cgc_pop_total: sc.total,
					cgc_pop_10: sc.grade10,
					cgc_gem_rate: sc.gemRate,
					cgc_gem_rate_full: sc.gemRate,
					cgc_grades: m.grades,
					cgc_fetched_at: now,
					cgc_synced_at: now,
					cgc_set_name: g.name,
					cgc_group_id: g.researchGroupID
				})
				.eq('card_id', m.card_id);
			if (error) errs++;
			else wrote++;
		}
		log(`  [${set.set_id}] wrote ${wrote}, errors ${errs} (${v.reason})`);
		return { setId: set.set_id, ok: wrote > 0, wrote, note: g.name };
	}
	return { setId: set.set_id, ok: false, wrote: 0, note: 'NO MATCH — all candidates failed the gate' };
}

async function prioritisedSets(): Promise<TrackedSet[]> {
	const { data: tracked, error } = await supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date')
		.eq('enabled', true);
	if (error) throw new Error(`tracked_sets load failed: ${error.message}`);
	const sets = (tracked ?? []) as TrackedSet[];

	const minSynced = new Map<string, number | null>();
	let from = 0;
	const page = 1000;
	for (;;) {
		const { data, error: e } = await supabase
			.from('card_index')
			.select('set_id, cgc_synced_at')
			.range(from, from + page - 1);
		if (e) throw new Error(`card_index scan failed: ${e.message}`);
		const rows = (data ?? []) as Array<{ set_id: string; cgc_synced_at: string | null }>;
		for (const r of rows) {
			if (r.cgc_synced_at == null) {
				minSynced.set(r.set_id, null);
				continue;
			}
			const cur = minSynced.get(r.set_id);
			if (cur === null) continue;
			const t = Date.parse(r.cgc_synced_at);
			if (cur === undefined || t < cur) minSynced.set(r.set_id, t);
		}
		if (rows.length < page) break;
		from += page;
	}
	const rank = (id: string): number => {
		const v = minSynced.get(id);
		if (v === undefined || v === null) return -1;
		return v;
	};
	return sets.sort((a, b) => {
		const ra = rank(a.set_id);
		const rb = rank(b.set_id);
		if (ra !== rb) return ra - rb;
		return yearOf(a.release_date) - yearOf(b.release_date);
	});
}

function writeStatus(s: Record<string, unknown>) {
	try {
		mkdirSync(dirname(STATUS_FILE), { recursive: true });
		writeFileSync(STATUS_FILE, JSON.stringify({ updated_at: ts(), ...s }, null, 2));
	} catch (e) {
		log(`status write failed: ${(e as Error).message}`);
	}
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, () => {
		log(`${sig} received — finishing current set then exiting`);
		stopping = true;
	});
}

async function main() {
	const { values } = parseArgs({
		options: {
			set: { type: 'string' },
			all: { type: 'boolean', default: false },
			'dry-run': { type: 'boolean', default: false },
			limit: { type: 'string' }
		},
		strict: false
	});
	const dryRun = !!values['dry-run'];

	let setIds: string[];
	if (values.set) setIds = (values.set as string).split(',').map((s) => s.trim());
	else if (values.all) setIds = [];
	else {
		console.log('Usage: --all | --set <id,..> [--dry-run]');
		return;
	}

	let categoryId: number;
	try {
		categoryId = await resolveCgcPokemonCategoryId();
	} catch (e) {
		console.error(`Cannot resolve CGC category: ${(e as Error).message}`);
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
	const cap = num(values.limit as string, SET_LIMIT);
	if (cap > 0) sets = sets.slice(0, cap);

	log(`cgc-pop start — ${sets.length} set(s), categoryId=${categoryId}${dryRun ? ' DRY-RUN' : ''}`);

	let consecBad = 0;
	let totalWrote = 0;
	const results: SetResult[] = [];
	for (let i = 0; i < sets.length; i++) {
		if (stopping) {
			log('stopping — clean exit');
			break;
		}
		const set = sets[i];
		try {
			const idx = await loadIndexCards(set.set_id);
			const r = await processSet(categoryId, set, idx, dryRun);
			results.push(r);
			totalWrote += r.wrote;
			if (r.ok) consecBad = 0;
			else consecBad++;
			log(`(${i + 1}/${sets.length}) ${set.set_id} — ${r.ok ? 'OK' : 'MISS'} wrote=${r.wrote} ${r.note}`);
		} catch (e) {
			consecBad++;
			const m = e instanceof CgcGradingError ? `CGC: ${e.message}` : (e as Error).message;
			log(`(${i + 1}/${sets.length}) ${set.set_id} — ERROR ${m}`);
		}
		writeStatus({
			phase: stopping ? 'stopping' : 'running',
			processed: i + 1,
			total: sets.length,
			total_wrote: totalWrote,
			consecutive_bad: consecBad
		});
		if (consecBad >= FAIL_ALERT) {
			log(`SUSTAINED FAILURE — ${consecBad} consecutive sets failed`);
			consecBad = 0;
		}
	}
	const okCount = results.filter((r) => r.ok).length;
	log(`cgc-pop done — ${okCount}/${sets.length} sets ok, ${totalWrote} card-rows written`);
	writeStatus({ phase: 'done', processed: sets.length, ok: okCount, total_wrote: totalWrote });
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
