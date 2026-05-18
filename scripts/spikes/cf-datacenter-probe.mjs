// Cloudflare-from-datacenter-IP spike (gating decision for the engine cloud move).
//
// Runs on a GitHub Actions runner (Azure datacenter IP — same Cloudflare
// class as Fly/Railway/Render). Mirrors the EXACT request shaping the real
// scrapers use (src/lib/services/pricecharting-scraper.ts curl fallback +
// scripts/gemrate-pop.ts cookie-jar warm). Reports block rate so we know,
// for free, whether the scrapers can live on any datacenter host.
//
// No secrets, no repo deps — pure public-page probing. Polite pacing.

import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PC_ATTEMPTS = Number(process.env.PC_ATTEMPTS ?? 20);
const GR_ATTEMPTS = Number(process.env.GR_ATTEMPTS ?? 12);
const PACE_MS = Number(process.env.PACE_MS ?? 3000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(args) {
	return new Promise((resolve) => {
		execFile(
			'curl',
			args,
			{ encoding: 'utf-8', timeout: 45000, maxBuffer: 64 * 1024 * 1024 },
			(err, stdout) => resolve({ code: err ? 1 : 0, out: stdout ?? '' })
		);
	});
}

const isChallenged = (html, code) =>
	code !== 0 || !html || html.includes('Just a moment') || html.length < 2000;

// --- PriceCharting: known-stable product (Base Set Charizard #4) ----------
async function probePriceCharting() {
	const url = 'https://www.pricecharting.com/game/pokemon-base-set/charizard-4';
	let ok = 0;
	const sizes = [];
	for (let i = 0; i < PC_ATTEMPTS; i++) {
		const r = await curl([
			'-sL', '--compressed', '--max-time', '15',
			'-H', `User-Agent: ${UA}`,
			'-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
			'-H', 'Accept-Language: en-US,en;q=0.9',
			'-H', 'Accept-Encoding: gzip, deflate, br',
			'-H', 'Sec-Fetch-Dest: document',
			'-H', 'Sec-Fetch-Mode: navigate',
			'-H', 'Sec-Fetch-Site: none',
			'-H', 'Sec-Fetch-User: ?1',
			'-H', 'Upgrade-Insecure-Requests: 1',
			url
		]);
		const blocked = isChallenged(r.out, r.code);
		if (!blocked) ok++;
		sizes.push(r.out.length);
		process.stdout.write(blocked ? 'x' : '.');
		await sleep(PACE_MS);
	}
	process.stdout.write('\n');
	return { name: 'PriceCharting', ok, total: PC_ATTEMPTS, sizes };
}

// --- GemRate: verified target (PSA, "Pokemon Game" 1999 = Base Set) -------
async function probeGemRate() {
	const base = 'https://www.gemrate.com';
	const qs = new URLSearchParams({
		grader: 'psa',
		year: '1999',
		category: 'tcg-cards',
		set_name: 'Pokemon Game'
	}).toString();
	const detailsUrl = `${base}/set-details?${qs}`;
	const advancedUrl = `${base}/item-details-advanced?${qs}`;
	let ok = 0;
	const sizes = [];
	for (let i = 0; i < GR_ATTEMPTS; i++) {
		const jar = join(tmpdir(), `cf-spike-gr-${i}.cookies`);
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
		const blocked = isChallenged(r.out, r.code);
		if (!blocked) ok++;
		sizes.push(r.out.length);
		process.stdout.write(blocked ? 'x' : '.');
		await sleep(PACE_MS);
	}
	process.stdout.write('\n');
	return { name: 'GemRate', ok, total: GR_ATTEMPTS, sizes };
}

const med = (a) => {
	const s = [...a].sort((x, y) => x - y);
	return s[Math.floor(s.length / 2)] ?? 0;
};

console.log(`CF datacenter spike — runner egress IP:`);
await curl(['-s', '--max-time', '10', 'https://api.ipify.org']).then((r) =>
	console.log(`  ${r.out.trim() || 'unknown'}\n`)
);

const results = [];
results.push(await probePriceCharting());
results.push(await probeGemRate());

console.log('\n===== CF DATACENTER SPIKE RESULT =====');
for (const r of results) {
	const blockPct = Math.round(((r.total - r.ok) / r.total) * 100);
	console.log(
		`${r.name}: ${r.ok}/${r.total} OK · block rate ${blockPct}% · median body ${med(r.sizes)}B`
	);
}
console.log(
	'\nReference: from the home/residential IP these run ~75-95% OK ' +
		'(GemRate item-details-advanced ~25% challenged). ' +
		'Block rate ≲25% ⇒ datacenter is viable. Near-total ⇒ need a proxy.'
);
