#!/usr/bin/env tsx
/**
 * Trove — Beckett (BGS) population acquisition (like Track A / tag-pop.ts)
 *
 * Beckett publishes its own pop report. This crawler closes the BGS gap the
 * same way tag-pop.ts closes TAG: for each tracked set, ask Beckett for sets
 * whose name contains our set name, fuzzy-rank the candidates, and PROVE the
 * pick by card_number overlap before any write (honesty gate — a wrong
 * match is rejected, never persisted). Writes the FULL grade distribution
 * into bgs_grades + the scalar bgs_pop_total/bgs_pop_10/bgs_gem_rate(+_full)
 * and provenance. See src/lib/services/bgs-grading.ts and
 * project_grading_data_sources / feedback_data_is_always_findable.
 *
 * Usage:
 *   tsx scripts/bgs-pop.ts --all                  # gap-prioritised crawl
 *   tsx scripts/bgs-pop.ts --set base1            # one set
 *   tsx scripts/bgs-pop.ts --set base1 --dry-run  # fetch+match, no write
 *
 * Env: PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or PUBLISHABLE);
 *   TROVE_BGS_REQ_DELAY_MS (1000) TROVE_BGS_SET_LIMIT (0)
 *   TROVE_BGS_CARD_LIMIT (100) TROVE_BGS_MAX_PAGES (60)
 *   TROVE_BGS_FAIL_ALERT (5) TROVE_BGS_STATUS
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
	searchBgsSets,
	getBgsCardsForSet,
	bgsDrillKeyword,
	bgsPopScalars,
	BgsGradingError,
	type BgsCardRow,
	type BgsGradeMap
} from '../src/lib/services/bgs-grading.js';
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
const REQ_DELAY_MS = num(process.env.TROVE_BGS_REQ_DELAY_MS, 1000);
const SET_LIMIT = num(process.env.TROVE_BGS_SET_LIMIT, 0);
const CARD_LIMIT = num(process.env.TROVE_BGS_CARD_LIMIT, 100);
const MAX_PAGES = num(process.env.TROVE_BGS_MAX_PAGES, 60);
const FAIL_ALERT = num(process.env.TROVE_BGS_FAIL_ALERT, 5);
const STATUS_FILE =
	process.env.TROVE_BGS_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'bgs-pop-status.json');

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
	grades: BgsGradeMap;
}
interface Validation {
	ok: boolean;
	reason: string;
	matches: Matched[];
}
function pickCanonical(rows: BgsCardRow[]): BgsCardRow {
	return rows.reduce((a, b) =>
		bgsPopScalars(b.grades).total > bgsPopScalars(a.grades).total ? b : a
	);
}
function validate(bgsCards: BgsCardRow[], idx: IndexCard[]): Validation {
	if (bgsCards.length === 0) return { ok: false, reason: 'no BGS cards', matches: [] };
	if (idx.length === 0) return { ok: false, reason: 'no card_index rows', matches: [] };
	const idxByNum = new Map<string, string>();
	for (const c of idx) {
		const k = normCardNumber(c.card_number);
		if (k && !idxByNum.has(k)) idxByNum.set(k, c.card_id);
	}
	const bgsByNum = new Map<string, BgsCardRow[]>();
	for (const r of bgsCards) {
		const k = normCardNumber(r.cardNumber);
		if (!k) continue;
		const arr = bgsByNum.get(k);
		if (arr) arr.push(r);
		else bgsByNum.set(k, [r]);
	}
	const matches: Matched[] = [];
	let matchedNums = 0;
	for (const [k, rows] of bgsByNum) {
		const cardId = idxByNum.get(k);
		if (!cardId) continue;
		matchedNums++;
		matches.push({ card_id: cardId, grades: pickCanonical(rows).grades });
	}
	const denom = Math.min(bgsByNum.size, idxByNum.size);
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

async function processSet(
	set: TrackedSet,
	idx: IndexCard[],
	dryRun: boolean
): Promise<SetResult> {
	// Beckett's `set_name` is a constrained substring filter over its bare
	// set-name field (not the displayed "<year> Pokemon <name>"), so one
	// keyword often misses. Probe a few variants, union the candidates,
	// fuzzy-rank, and let the card-number overlap gate prove correctness.
	// Beckett names sets "<year> Pokemon[ TCG] <core> <edition/lang>"
	// (e.g. "1999 Pokemon Base Unlimited"); `set_name` is a substring
	// filter over that. Probe several keywords, union candidates, then a
	// lenient BGS-specific score — the card-number overlap gate is the
	// real correctness guarantee, so we keep many candidates and let it
	// reject the wrong ones rather than over-filter here.
	const base = set.set_name.replace(/^pok[eé]mon\s+/i, '').trim() || set.set_name;
	const baseToks = base.split(/\s+/).filter((t) => t.length >= 3);
	const keywords = Array.from(
		new Set(
			[base, baseToks.slice(-2).join(' '), ...baseToks]
				.map((s) => (s ?? '').trim())
				.filter((s) => s.length >= 3)
		)
	).slice(0, 5);
	const byLpg = new Map<string, import('../src/lib/services/bgs-grading.js').BgsSetCandidate>();
	for (const kw of keywords) {
		if (stopping) break;
		try {
			for (const c of await searchBgsSets(kw)) if (!byLpg.has(c.lpgSetId)) byLpg.set(c.lpgSetId, c);
		} catch (e) {
			log(`  [${set.set_id}] search "${kw}" failed: ${(e as Error).message}`);
		}
		await sleep(REQ_DELAY_MS);
	}
	const kw = keywords[0] ?? base;

	// Strip Beckett's decoration (year / Pokemon / TCG / "card game") and
	// edition+language noise so the CORE set tokens can be compared.
	const NOISE =
		/\b(1st|first|edition|unlimited|english|japanese|korean|chinese|traditional|simplified|french|german|italian|spanish|dutch|portuguese|thai|indonesian|reverse|foil|holo|theme|deck|promo|promos|gift|box|set|tcg|game|card)\b/g;
	const core = (s: string) =>
		s
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/^\s*\d{4}\s+/, '')
			.replace(/\bpok[eé]?mon\b/g, ' ')
			.replace(NOISE, ' ')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	const ourCore = new Set(core(set.set_name).split(/\s+/).filter(Boolean));
	const scoreBgs = (name: string): number => {
		const cset = new Set(core(name).split(/\s+/).filter(Boolean));
		if (ourCore.size === 0 || cset.size === 0) {
			// Both reduced to pure decoration (e.g. our "Base Set" → ""):
			// fall back to the standard fuzzy on the raw names.
			return scoreTagCandidate(set.set_name, name);
		}
		let inter = 0;
		for (const t of ourCore) if (cset.has(t)) inter++;
		const jacc = inter / (ourCore.size + cset.size - inter);
		let s = Math.round(100 * jacc);
		const low = name.toLowerCase();
		if (/\b(english|unlimited|1st edition|first edition)\b/.test(low)) s += 8;
		if (/\b(japanese|korean|chinese|french|german|italian|spanish|dutch|portuguese|thai|indonesian)\b/.test(low))
			s -= 20;
		return s;
	};
	const scored = [...byLpg.values()]
		.map((c) => ({ c, s: scoreBgs(c.name) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, 8);
	if (scored.length === 0)
		return {
			setId: set.set_id,
			ok: false,
			wrote: 0,
			note: `NO MATCH — no Beckett set scored (tried: ${keywords.join(' | ')})`
		};

	for (const { c } of scored) {
		if (stopping) break;
		const drillKw = bgsDrillKeyword(c.name);
		let cards: BgsCardRow[];
		try {
			cards = await getBgsCardsForSet({
				setNameKeyword: drillKw,
				displaySetId: c.setId,
				lpgSetId: c.lpgSetId,
				limit: CARD_LIMIT,
				maxPages: MAX_PAGES,
				onPage: () => sleep(REQ_DELAY_MS)
			});
		} catch (e) {
			log(`  [${set.set_id}] fetch "${c.name}" failed: ${(e as Error).message}`);
			await sleep(REQ_DELAY_MS);
			continue;
		}
		await sleep(REQ_DELAY_MS);
		const v = validate(cards, idx);
		if (!v.ok) {
			log(`  [${set.set_id}] reject "${c.name}" (#${c.setId}) — ${v.reason}`);
			continue;
		}
		log(`  [${set.set_id}] match "${c.name}" (#${c.setId}) — ${v.reason}`);
		if (dryRun) {
			const sample = v.matches[0];
			log(
				`  [${set.set_id}] DRY: ${v.matches.length} cards` +
					(sample
						? ` e.g. ${sample.card_id} -> ${JSON.stringify({
								...bgsPopScalars(sample.grades),
								grades: sample.grades
							})}`
						: '')
			);
			return { setId: set.set_id, ok: true, wrote: 0, note: `DRY ${c.name}` };
		}
		const now = new Date().toISOString();
		let wrote = 0;
		let errs = 0;
		for (const m of v.matches) {
			const sc = bgsPopScalars(m.grades);
			const { error } = await supabase
				.from('card_index')
				.update({
					bgs_pop_total: sc.total,
					bgs_pop_10: sc.grade10,
					bgs_gem_rate: sc.gemRate,
					bgs_gem_rate_full: sc.gemRate,
					bgs_grades: m.grades,
					bgs_fetched_at: now,
					bgs_synced_at: now,
					bgs_set_name: c.name,
					bgs_set_id: c.setId,
					bgs_lpg_set_id: c.lpgSetId
				})
				.eq('card_id', m.card_id);
			if (error) errs++;
			else wrote++;
		}
		log(`  [${set.set_id}] wrote ${wrote}, errors ${errs} (${v.reason})`);
		return { setId: set.set_id, ok: wrote > 0, wrote, note: c.name };
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
			.select('set_id, bgs_synced_at')
			.range(from, from + page - 1);
		if (e) throw new Error(`card_index scan failed: ${e.message}`);
		const rows = (data ?? []) as Array<{ set_id: string; bgs_synced_at: string | null }>;
		for (const r of rows) {
			if (r.bgs_synced_at == null) {
				minSynced.set(r.set_id, null);
				continue;
			}
			const cur = minSynced.get(r.set_id);
			if (cur === null) continue;
			const t = Date.parse(r.bgs_synced_at);
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

	log(`bgs-pop start — ${sets.length} set(s)${dryRun ? ' DRY-RUN' : ''}`);

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
			const r = await processSet(set, idx, dryRun);
			results.push(r);
			totalWrote += r.wrote;
			if (r.ok) consecBad = 0;
			else consecBad++;
			log(`(${i + 1}/${sets.length}) ${set.set_id} — ${r.ok ? 'OK' : 'MISS'} wrote=${r.wrote} ${r.note}`);
		} catch (e) {
			consecBad++;
			const m = e instanceof BgsGradingError ? `BGS: ${e.message}` : (e as Error).message;
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
	log(`bgs-pop done — ${okCount}/${sets.length} sets ok, ${totalWrote} card-rows written`);
	writeStatus({ phase: 'done', processed: sets.length, ok: okCount, total_wrote: totalWrote });
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
