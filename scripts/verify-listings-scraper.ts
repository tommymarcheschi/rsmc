/**
 * Phase 1 verification: TCGPlayer listings scraper dry-run
 *
 * Walks a small fixed set of Pokemon TCG API card_ids, resolves each to
 * its TCGPlayer productId (via the pokemontcg.io /tcgplayer redirect),
 * then runs fetchTCGPlayerListings({ dryRun: true }) against each.
 *
 * This is the gate before writing scripts/ingest-condition-prices.ts —
 * if the scraper returns zero listings or the condition split looks
 * nonsensical, fix the scraper first.
 *
 * Run with:
 *   npx tsx scripts/verify-listings-scraper.ts
 */

import { fetchTCGPlayerListings } from '../src/lib/services/tcgplayer-listings-scraper';

const TEST_CARDS = [
	{ card_id: 'base1-4', name: 'Charizard (Base Set Holo)' },
	{ card_id: 'base1-2', name: 'Blastoise (Base Set Holo)' },
	{ card_id: 'base1-15', name: 'Venusaur (Base Set Holo)' },
	{ card_id: 'sm4-54', name: 'Gardevoir GX (SM Crimson Invasion)' },
	{ card_id: 'swsh45-18', name: 'Pikachu V (Shining Fates)' }
];

/**
 * Resolve a Pokemon TCG API card_id → TCGPlayer productId.
 * pokemontcg.io exposes a redirect: /tcgplayer/{card_id} → TCGPlayer URL.
 * We follow the redirect manually and extract /product/{id}/ from the
 * Location header so we don't pay the full HTML page fetch.
 */
async function resolveProductId(cardId: string): Promise<string | null> {
	const redirectUrl = `https://prices.pokemontcg.io/tcgplayer/${cardId}`;
	try {
		const res = await fetch(redirectUrl, {
			redirect: 'manual',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
			}
		});
		const location = res.headers.get('location');
		if (!location) return null;
		const match = location.match(/\/product\/(\d+)(?:[\/?]|$)/);
		return match?.[1] ?? null;
	} catch (err) {
		console.error(`  resolve failed: ${(err as Error).message}`);
		return null;
	}
}

async function main(): Promise<void> {
	console.log('Phase 1 verification — TCGPlayer listings scraper dry-run\n');
	console.log(`${'card_id'.padEnd(16)} ${'productId'.padEnd(10)} ${'source'.padEnd(7)} result`);
	console.log('─'.repeat(80));

	let apiHits = 0;
	let htmlHits = 0;
	let misses = 0;

	for (const c of TEST_CARDS) {
		const productId = await resolveProductId(c.card_id);
		if (!productId) {
			console.log(`${c.card_id.padEnd(16)} ${'—'.padEnd(10)} —       no product resolved (${c.name})`);
			misses++;
			continue;
		}

		// Real (non-dry-run) first so we can see the actual split, then
		// explicitly call dry-run once to verify the dry-run branch prints
		// but returns empty.
		const real = await fetchTCGPlayerListings({ productId, limit: 50 });
		const summary = summarise(real.listings);
		console.log(
			`${c.card_id.padEnd(16)} ${productId.padEnd(10)} ${real.source.padEnd(7)} ` +
				`${real.listings.length} listings | ${summary}`
		);

		if (real.source === 'api') apiHits++;
		else if (real.source === 'html') htmlHits++;
		else misses++;

		// Dry-run path sanity check (logs summary, returns empty)
		const dry = await fetchTCGPlayerListings({ productId, limit: 5, dryRun: true });
		if (dry.listings.length !== 0) {
			console.error('  ⚠️  dryRun did not return empty — scraper contract violated');
		}

		// 300ms politeness between cards
		await sleep(300);
	}

	console.log('\nSummary');
	console.log(`  api=${apiHits}  html=${htmlHits}  miss=${misses}`);

	if (apiHits + htmlHits === 0) {
		console.log('\n❌ No listings returned from any source. Fix the scraper before proceeding.');
		process.exit(1);
	}
	if (misses > 0) {
		console.log(`\n⚠️  ${misses} card(s) returned nothing — investigate before full ingestion.`);
	}
	console.log('\n✅ Verification passed. Safe to write the ingestion script.');
}

function summarise(listings: Array<{ condition: string | null; price_cents: number }>): string {
	if (listings.length === 0) return '(no listings)';
	const buckets: Record<string, number[]> = {};
	for (const l of listings) {
		const k = l.condition ?? 'unknown';
		(buckets[k] ||= []).push(l.price_cents);
	}
	return Object.entries(buckets)
		.sort(([, a], [, b]) => b.length - a.length)
		.map(([k, prices]) => {
			const sorted = prices.slice().sort((a, b) => a - b);
			const median = sorted[Math.floor(sorted.length / 2)];
			return `${k} n=${prices.length} med=$${(median / 100).toFixed(2)}`;
		})
		.join(', ');
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
	console.error('fatal:', err);
	process.exit(1);
});
