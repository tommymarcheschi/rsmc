#!/usr/bin/env tsx
/**
 * Trove — continuous self-pacing enrichment worker (Track B)
 *
 * The once-daily `refresh-stale` one-shot (100 cards/run) cannot hold a
 * 7-day freshness window over ~20k cards — it needs ~2,900/day just to
 * tread water (see project_stale_pipeline_rootcause). This worker is the
 * architectural fix: a long-running loop that drives the already-proven,
 * just-fixed `refresh-index.ts --stale` path in cycles, adapting
 * concurrency to the real Cloudflare ceiling and backing off on pressure.
 *
 * It does NOT re-implement scraping — it spawns the existing CLI so the
 * single tested enrichment code path stays the source of truth.
 *
 * Self-healing: never exits on its own (launchd KeepAlive restarts on
 * crash); idle-sleeps when everything is fresh; backs off on failure;
 * writes a heartbeat status file; alerts only on SUSTAINED failure.
 *
 * Cloud-portable: every knob is env-driven, no Mac-only assumptions in
 * this file (the launchd plist is the only Mac-specific wrapper). Lifts
 * to Fly.io with no code change.
 *
 * Env knobs (.env.local or process env):
 *   DEV_SERVER_URL           Cloudflare proxy the enrichment path needs up
 *   TROVE_WORKER_BATCH       cards per cycle           (default 150)
 *   TROVE_WORKER_CONC_START  starting concurrency      (default 6, proven)
 *   TROVE_WORKER_CONC_MIN    floor concurrency         (default 6)
 *   TROVE_WORKER_CONC_MAX    ceiling concurrency       (default 14)
 *   TROVE_WORKER_IDLE_MS     sleep when no stale rows  (default 1800000)
 *   TROVE_WORKER_BACKOFF_MS  sleep after a bad cycle   (default 300000)
 *   TROVE_WORKER_GAP_MS      gap between healthy cycles (default 2000)
 *   TROVE_WORKER_STATUS      heartbeat file path
 *                            (default ~/Library/Logs/Trove/enrich-worker-status.json)
 *   TROVE_WORKER_FAIL_ALERT  consecutive bad cycles before alert (default 5)
 *   TROVE_STALE_PRIORITISE_GAPS  inherited by the spawned refresh-index:
 *                            '1'/unset = fill coverage gaps first (default,
 *                            climbs the KPI fastest), '0' = legacy FIFO
 */

import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

config({ path: '.env.local' });

const num = (v: string | undefined, d: number) => {
	const n = parseInt(v ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : d;
};

const BATCH = num(process.env.TROVE_WORKER_BATCH, 150);
const CONC_MIN = num(process.env.TROVE_WORKER_CONC_MIN, 6);
const CONC_MAX = num(process.env.TROVE_WORKER_CONC_MAX, 14);
const IDLE_MS = num(process.env.TROVE_WORKER_IDLE_MS, 30 * 60 * 1000);
const BACKOFF_MS = num(process.env.TROVE_WORKER_BACKOFF_MS, 5 * 60 * 1000);
const GAP_MS = num(process.env.TROVE_WORKER_GAP_MS, 2000);
const FAIL_ALERT = num(process.env.TROVE_WORKER_FAIL_ALERT, 5);
const STATUS_FILE =
	process.env.TROVE_WORKER_STATUS ??
	join(homedir(), 'Library', 'Logs', 'Trove', 'enrich-worker-status.json');

let concurrency = Math.max(
	CONC_MIN,
	Math.min(CONC_MAX, num(process.env.TROVE_WORKER_CONC_START, 6))
);
let consecutiveBad = 0;
let stopping = false;

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${ts()}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Status {
	updated_at: string;
	mode: 'working' | 'idle' | 'backoff' | 'sustained-failure';
	last_processed: number;
	last_errors: number;
	concurrency: number;
	consecutive_bad: number;
	cycles: number;
}

function writeStatus(s: Status) {
	try {
		mkdirSync(dirname(STATUS_FILE), { recursive: true });
		writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2));
	} catch (e) {
		log(`status write failed: ${(e as Error).message}`);
	}
}

function alertSustained(msg: string) {
	log(`SUSTAINED FAILURE — ${msg}`);
	// Portable: only attempt a desktop notification on macOS; elsewhere
	// the loud log line is the signal (Fly.io ships logs to its alerting).
	if (process.platform === 'darwin') {
		try {
			spawn('/usr/bin/osascript', [
				'-e',
				`display notification "enrich-worker: ${msg}" with title "Trove" sound name "Basso"`
			]);
		} catch {
			/* notification is best-effort */
		}
	}
}

interface CycleResult {
	ok: boolean;
	idle: boolean;
	processed: number;
	errors: number;
}

function runCycle(): Promise<CycleResult> {
	return new Promise((resolve) => {
		const tsxBin = process.env.TROVE_TSX_BIN ?? 'node_modules/.bin/tsx';
		const child = spawn(
			tsxBin,
			['scripts/refresh-index.ts', '--stale', String(BATCH), '--concurrency', String(concurrency)],
			{ env: process.env }
		);

		let out = '';
		const cap = (b: Buffer) => {
			const s = b.toString();
			out += s;
			process.stdout.write(s);
		};
		child.stdout.on('data', cap);
		child.stderr.on('data', cap);

		child.on('close', (code) => {
			const idle = /No stale rows found\./.test(out);
			const m = out.match(/Stale refresh:\s*(\d+)\s*processed,\s*(\d+)\s*errors/);
			const processed = m ? parseInt(m[1], 10) : 0;
			const errors = m ? parseInt(m[2], 10) : 0;
			const failed = code !== 0 || /Stale selection FAILED/.test(out);
			resolve({ ok: !failed, idle, processed, errors });
		});
		child.on('error', () => resolve({ ok: false, idle: false, processed: 0, errors: 0 }));
	});
}

let cycles = 0;

async function loop() {
	log(
		`enrich-worker up — batch=${BATCH} conc=${concurrency} [${CONC_MIN}-${CONC_MAX}] ` +
			`idle=${IDLE_MS}ms backoff=${BACKOFF_MS}ms`
	);
	if (!process.env.DEV_SERVER_URL) {
		log('WARNING: DEV_SERVER_URL unset — PriceCharting Cloudflare proxy unavailable, expect high errors');
	}

	while (!stopping) {
		cycles++;
		const r = await runCycle();
		const rate = r.processed > 0 ? r.errors / r.processed : r.ok ? 0 : 1;

		let mode: Status['mode'] = 'working';

		if (!r.ok) {
			consecutiveBad++;
			mode = 'backoff';
			log(`cycle ${cycles} FAILED (bad streak ${consecutiveBad}) — backoff ${BACKOFF_MS}ms, conc -> ${CONC_MIN}`);
			concurrency = CONC_MIN;
			if (consecutiveBad >= FAIL_ALERT) {
				mode = 'sustained-failure';
				alertSustained(`${consecutiveBad} consecutive bad cycles`);
			}
			writeStatus(statusOf(mode, r));
			await sleep(BACKOFF_MS);
			continue;
		}

		consecutiveBad = 0;

		if (r.idle) {
			mode = 'idle';
			log(`cycle ${cycles} — no stale rows, all fresh. idle ${IDLE_MS}ms`);
			writeStatus(statusOf(mode, r));
			await sleep(IDLE_MS);
			continue;
		}

		// Adaptive ramp on the real Cloudflare ceiling.
		if (rate <= 0.05 && concurrency < CONC_MAX) {
			concurrency++;
			log(`cycle ${cycles} healthy (${r.processed}p/${r.errors}e) — ramp conc -> ${concurrency}`);
		} else if (rate >= 0.2 && concurrency > CONC_MIN) {
			concurrency = Math.max(CONC_MIN, concurrency - 3);
			log(`cycle ${cycles} pressure (rate ${(rate * 100).toFixed(0)}%) — drop conc -> ${concurrency}, backoff`);
			writeStatus(statusOf('backoff', r));
			await sleep(BACKOFF_MS);
			continue;
		} else {
			log(`cycle ${cycles} steady (${r.processed}p/${r.errors}e) — hold conc ${concurrency}`);
		}

		writeStatus(statusOf(mode, r));
		await sleep(GAP_MS);
	}
	log('enrich-worker stopped cleanly');
}

function statusOf(mode: Status['mode'], r: CycleResult): Status {
	return {
		updated_at: ts(),
		mode,
		last_processed: r.processed,
		last_errors: r.errors,
		concurrency,
		consecutive_bad: consecutiveBad,
		cycles
	};
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, () => {
		log(`${sig} received — finishing, will exit`);
		stopping = true;
		setTimeout(() => process.exit(0), 1000);
	});
}

loop().catch((e) => {
	log(`FATAL ${(e as Error).message}`);
	process.exit(1);
});
