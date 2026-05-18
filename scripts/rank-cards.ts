#!/usr/bin/env tsx
/**
 * Trove — Card Rankings nightly scorer (north star pillar #9)
 *
 * Percentile-ranks the WHOLE catalog on six independent 0–100 axes, then
 * writes three pre-weighted lens composites + a confidence band. Purpose:
 * discovery — surface cards the user never knew were valuable or low-pop.
 *
 * Percentile rank needs the whole distribution, so this is a batch pass
 * (not a generated column). Runs nightly after the acquisition crons +
 * coverage-ledger so it scores the freshest data.
 *
 * Honesty doctrine: an axis score is NULL when its input is missing — we
 * never invent a neutral 50. The lens composite is the weighted mean over
 * ONLY the axes a card has, and ranking_confidence keeps thin-data cards
 * visible instead of hidden.
 *
 * Resilient to migration order: if 016 (gemrate pop) or 017 (score cols)
 * are not yet applied, --dry-run still computes + reports on live data
 * (optional columns are probed; writes no-op under --dry-run).
 *
 * Usage:
 *   tsx scripts/rank-cards.ts            # compute + write
 *   tsx scripts/rank-cards.ts --dry-run  # compute + report, no write
 *
 * Env (.env.local):
 *   PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or PUBLISHABLE)
 *   TROVE_RANK_WRITE_CONC   parallel updates       (default 12)
 *   TROVE_RANK_LIQ_DAYS     liquidity sale window  (default 180)
 *   TROVE_RANK_STATUS       heartbeat file path
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
	AXES,
	LENSES,
	LENS_KEYS,
	lensScore,
	rankingConfidence,
	type Axis
} from '../src/lib/services/lenses.js';

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
	return Number.isFinite(n) && n > 0 ? n : d;
};
const WRITE_CONC = num(process.env.TROVE_RANK_WRITE_CONC, 12);
const LIQ_DAYS = num(process.env.TROVE_RANK_LIQ_DAYS, 180);
const STATUS_FILE =
	process.env.TROVE_RANK_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'rank-cards-status.json');

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const)
	process.on(sig, () => {
		log(`${sig} — finishing then exiting`);
		stopping = true;
	});

const CORE_COLS = [
	'card_id', 'name', 'set_id', 'set_name', 'card_number',
	'psa10_price', 'raw_nm_price', 'tcg_headline_market',
	'psa_pop_total', 'cgc_pop_total', 'psa_gem_rate', 'cgc_gem_rate',
	'grading_roi_premium', 'psa10_last_sold_at'
];
// From migration 016 — present only once the user applies it.
const OPT_COLS = [
	'bgs_pop_total', 'sgc_pop_total', 'bgs_gem_rate', 'sgc_gem_rate',
	'psa_pop_30d', 'cgc_pop_30d', 'bgs_pop_30d', 'sgc_pop_30d'
];

interface Row {
	card_id: string;
	name: string | null;
	set_id: string | null;
	set_name: string | null;
	card_number: string | null;
	psa10_price: number | null;
	raw_nm_price: number | null;
	tcg_headline_market: number | null;
	psa_pop_total: number | null;
	cgc_pop_total: number | null;
	bgs_pop_total?: number | null;
	sgc_pop_total?: number | null;
	psa_gem_rate: number | null;
	cgc_gem_rate: number | null;
	bgs_gem_rate?: number | null;
	sgc_gem_rate?: number | null;
	psa_pop_30d?: number | null;
	cgc_pop_30d?: number | null;
	bgs_pop_30d?: number | null;
	sgc_pop_30d?: number | null;
	grading_roi_premium: number | null;
	psa10_last_sold_at: string | null;
}

async function optionalColumnsAvailable(): Promise<boolean> {
	const { error } = await supabase
		.from('card_index')
		.select(OPT_COLS.join(','))
		.limit(1);
	if (error) {
		log(`migration 016 columns absent (${error.message.split('\n')[0]}) — degrading: BGS/SGC + 30d momentum unscored`);
		return false;
	}
	return true;
}

async function loadAll(cols: string[]): Promise<Row[]> {
	const out: Row[] = [];
	const pageSize = 1000;
	let from = 0;
	while (true) {
		const { data, error } = await supabase
			.from('card_index')
			.select(cols.join(','))
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);
		if (error) throw new Error(`card_index load failed: ${error.message}`);
		const batch = (data ?? []) as unknown as Row[];
		out.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}
	return out;
}

/** card_id → count of PSA 10 sales within LIQ_DAYS. */
async function loadLiquidity(): Promise<Map<string, number>> {
	const since = new Date(Date.now() - LIQ_DAYS * 86400000).toISOString();
	const counts = new Map<string, number>();
	const pageSize = 1000;
	let from = 0;
	while (true) {
		const { data, error } = await supabase
			.from('psa10_sales')
			.select('card_id, sold_at')
			.gte('sold_at', since)
			.order('card_id', { ascending: true })
			.range(from, from + pageSize - 1);
		if (error) {
			log(`psa10_sales load failed (${error.message.split('\n')[0]}) — liquidity unscored`);
			return counts;
		}
		const batch = (data ?? []) as Array<{ card_id: string }>;
		for (const r of batch) counts.set(r.card_id, (counts.get(r.card_id) ?? 0) + 1);
		if (batch.length < pageSize) break;
		from += pageSize;
	}
	return counts;
}

const firstNum = (...xs: Array<number | null | undefined>): number | null => {
	for (const x of xs) if (x != null && Number.isFinite(x)) return x;
	return null;
};
const sumPresent = (...xs: Array<number | null | undefined>): number | null => {
	let s = 0;
	let any = false;
	for (const x of xs)
		if (x != null && Number.isFinite(x)) {
			s += x;
			any = true;
		}
	return any ? s : null;
};

/** Raw axis metric per card. null = no data for that axis (stays unscored). */
function metrics(r: Row, liq: Map<string, number>): Record<Axis, number | null> {
	const value = firstNum(r.psa10_price, r.raw_nm_price, r.tcg_headline_market);

	const pop = sumPresent(r.psa_pop_total, r.cgc_pop_total, r.bgs_pop_total, r.sgc_pop_total);
	// Scarcer = higher score → rank on negative pop.
	const scarcity = pop == null ? null : -pop;

	const gem = firstNum(r.psa_gem_rate, r.cgc_gem_rate, r.bgs_gem_rate, r.sgc_gem_rate);
	// Harder to gem (lower rate) = higher score → rank on negative rate.
	const gem_difficulty = gem == null ? null : -gem;

	const pop30 = sumPresent(r.psa_pop_30d, r.cgc_pop_30d, r.bgs_pop_30d, r.sgc_pop_30d);
	const popTot = sumPresent(r.psa_pop_total, r.cgc_pop_total, r.bgs_pop_total, r.sgc_pop_total);
	const momentum = pop30 != null && popTot != null && popTot > 0 ? pop30 / popTot : null;

	const grade_roi = r.grading_roi_premium ?? null;

	// Liquidity: recent sale count. Absence is a real "illiquid" signal
	// only for cards we actually price-checked (psa10_last_sold_at set);
	// otherwise we never looked → unknown → null.
	const sales = liq.get(r.card_id) ?? 0;
	const liquidity = sales > 0 ? sales : r.psa10_last_sold_at ? 0 : null;

	return { value, scarcity, gem_difficulty, momentum, grade_roi, liquidity };
}

/** Percentile-rank a metric array → 0–100 (nulls excluded), index-aligned. */
function percentiles(values: Array<number | null>): Array<number | null> {
	const present: number[] = [];
	for (const v of values) if (v != null) present.push(v);
	if (present.length === 0) return values.map(() => null);
	const sorted = [...present].sort((a, b) => a - b);
	const n = sorted.length;
	const lowerBound = (x: number): number => {
		let lo = 0;
		let hi = n;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sorted[mid] < x) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};
	return values.map((v) => {
		if (v == null) return null;
		if (n === 1) return 100;
		// Fraction of values strictly below → 0..100. Ties share a score.
		return Math.round((lowerBound(v) / (n - 1)) * 100);
	});
}

async function pmap<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
	let i = 0;
	const worker = async () => {
		while (i < items.length && !stopping) await fn(items[i++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function writeStatus(s: Record<string, unknown>) {
	try {
		mkdirSync(dirname(STATUS_FILE), { recursive: true });
		writeFileSync(STATUS_FILE, JSON.stringify({ updated_at: ts(), ...s }, null, 2));
	} catch (e) {
		log(`status write failed: ${(e as Error).message}`);
	}
}

async function main() {
	const { values } = parseArgs({
		options: { 'dry-run': { type: 'boolean', default: false } },
		strict: false
	});
	const dryRun = !!values['dry-run'];

	log(`rank-cards start${dryRun ? ' DRY-RUN' : ''}`);
	const hasOpt = await optionalColumnsAvailable();
	const cols = hasOpt ? [...CORE_COLS, ...OPT_COLS] : CORE_COLS;

	const [rows, liq] = await Promise.all([loadAll(cols), loadLiquidity()]);
	log(`loaded ${rows.length} cards, ${liq.size} with PSA10 sales in ${LIQ_DAYS}d`);
	if (rows.length === 0) {
		log('no cards — abort');
		return;
	}

	const m: Record<Axis, Array<number | null>> = {
		value: [], scarcity: [], gem_difficulty: [], momentum: [], grade_roi: [], liquidity: []
	};
	for (const r of rows) {
		const mm = metrics(r, liq);
		for (const a of Object.keys(m) as Axis[]) m[a].push(mm[a]);
	}

	const pct: Record<Axis, Array<number | null>> = {
		value: percentiles(m.value),
		scarcity: percentiles(m.scarcity),
		gem_difficulty: percentiles(m.gem_difficulty),
		momentum: percentiles(m.momentum),
		grade_roi: percentiles(m.grade_roi),
		liquidity: percentiles(m.liquidity)
	};

	// Per-card composite + confidence.
	interface Scored {
		card_id: string;
		name: string | null;
		set_id: string | null;
		axis: Record<Axis, number | null>;
		lens: Record<string, number | null>;
		confidence: 'high' | 'medium' | 'low';
	}
	const scored: Scored[] = rows.map((r, i) => {
		const axis = {
			value: pct.value[i],
			scarcity: pct.scarcity[i],
			gem_difficulty: pct.gem_difficulty[i],
			momentum: pct.momentum[i],
			grade_roi: pct.grade_roi[i],
			liquidity: pct.liquidity[i]
		} as Record<Axis, number | null>;
		const present = (Object.values(axis) as Array<number | null>).filter((x) => x != null).length;
		const lens: Record<string, number | null> = {};
		for (const k of LENS_KEYS) lens[k] = lensScore(LENSES[k].weights, axis);
		return {
			card_id: r.card_id,
			name: r.name,
			set_id: r.set_id,
			axis,
			lens,
			confidence: rankingConfidence(present)
		};
	});

	// Report
	const axisCount = (a: Axis) => pct[a].filter((x) => x != null).length;
	log('axis coverage (cards scored):');
	for (const a of AXES) log(`  ${a.label.padEnd(15)} ${axisCount(a.key)}/${rows.length}`);
	const conf = { high: 0, medium: 0, low: 0 };
	for (const s of scored) conf[s.confidence]++;
	log(`confidence: high=${conf.high} medium=${conf.medium} low=${conf.low}`);
	for (const k of LENS_KEYS) {
		const top = [...scored]
			.filter((s) => s.lens[k] != null)
			.sort((a, b) => (b.lens[k] ?? 0) - (a.lens[k] ?? 0))
			.slice(0, 5);
		log(`top ${LENSES[k].label}: ` + top.map((t) => `${t.name}(${t.set_id},${t.lens[k]})`).join(' | '));
	}

	if (dryRun) {
		log('DRY-RUN — no writes');
		writeStatus({ phase: 'dry-run', cards: rows.length, confidence: conf });
		return;
	}

	let wrote = 0;
	let errs = 0;
	await pmap(scored, WRITE_CONC, async (s) => {
		const { error } = await supabase
			.from('card_index')
			.update({
				score_value: s.axis.value,
				score_scarcity: s.axis.scarcity,
				score_gem_difficulty: s.axis.gem_difficulty,
				score_momentum: s.axis.momentum,
				score_grade_roi: s.axis.grade_roi,
				score_liquidity: s.axis.liquidity,
				score_investor: s.lens.investor,
				score_collector: s.lens.collector,
				score_flipper: s.lens.flipper,
				ranking_confidence: s.confidence,
				ranked_at: ts()
			})
			.eq('card_id', s.card_id);
		if (error) errs++;
		else wrote++;
		if ((wrote + errs) % 2000 === 0)
			writeStatus({ phase: 'writing', wrote, errs, total: scored.length });
	});

	log(`rank-cards done — wrote ${wrote}, errors ${errs}`);
	writeStatus({ phase: 'done', wrote, errs, total: scored.length, confidence: conf });
	if (errs > wrote) process.exit(1);
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
