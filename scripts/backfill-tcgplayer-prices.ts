/**
 * One-off backfill for sets where pokemontcg.io hasn't populated
 * TCGPlayer prices yet (e.g. recent Mega Evolution releases). Hits
 * TCGPlayer's own search JSON API directly, dedups printings to one
 * headline price per card_number, writes into card_index.
 *
 * Usage:
 *   npx tsx scripts/backfill-tcgplayer-prices.ts --tcg-set me1:me-mega-evolution
 *   npx tsx scripts/backfill-tcgplayer-prices.ts --all-mega
 *
 * --tcg-set: repeat as "<card_index set_id>:<tcgplayer set url name>".
 *   The tcgplayer part comes from their search URL's setName= filter,
 *   e.g. `tcgplayer.com/search/pokemon/product?setName=…|me-ascended-heroes`
 *   → url name is `me-ascended-heroes`.
 *
 * Safe to re-run. Only updates rows whose number matches a product and
 * whose tcg_headline_market is currently null; otherwise leaves the
 * existing (fresher) enricher-written value alone.
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import {
	fetchTcgPlayerSet,
	headlineByNumber,
	type TcgPlayerProduct
} from '../src/lib/services/tcgplayer-search-scraper';

loadEnv({ path: '.env.local' });

const SUPABASE_URL =
	process.env.PUBLIC_SUPABASE_URL ||
	process.env.SUPABASE_URL ||
	'';
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	process.env.SUPABASE_ANON_KEY ||
	process.env.PUBLIC_SUPABASE_ANON_KEY ||
	'';
if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing Supabase env — check .env.local');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Known Mega Evolution era sets — bulk map for --all-mega.
// Keys are card_index.set_id; values are TCGPlayer's setName URL slug.
// Slugs were discovered by inspecting the aggregations.setName block of
// an unfiltered Pokemon search — TCGPlayer numbers main sets ME01/ME02/…
// but the mid-release "Ascended Heroes" is unnumbered (`me-ascended-heroes`).
const MEGA_SETS: Array<{ setId: string; tcgSet: string }> = [
	{ setId: 'me1', tcgSet: 'me01-mega-evolution' },
	{ setId: 'me2', tcgSet: 'me02-phantasmal-flames' },
	{ setId: 'me2pt5', tcgSet: 'me-ascended-heroes' },
	{ setId: 'me3', tcgSet: 'me03-perfect-order' }
];

async function backfillSet(setId: string, tcgSet: string, dryRun: boolean) {
	console.log(`\n[${setId}] Fetching TCGPlayer products for set "${tcgSet}"…`);
	let products: TcgPlayerProduct[] = [];
	try {
		products = await fetchTcgPlayerSet(tcgSet);
	} catch (e) {
		console.error(`[${setId}] TCGPlayer fetch failed:`, (e as Error).message);
		return { matched: 0, updated: 0, products: 0 };
	}
	console.log(`[${setId}] ${products.length} products fetched`);

	const headline = headlineByNumber(products);
	console.log(`[${setId}] ${headline.size} unique card numbers after dedup`);

	// Pull card_index rows for this set
	const { data: rows, error } = await supabase
		.from('card_index')
		.select('card_id, card_number, tcg_headline_market, tcg_headline_low, raw_nm_price, raw_source')
		.eq('set_id', setId);
	if (error) {
		console.error(`[${setId}] supabase select:`, error.message);
		return { matched: 0, updated: 0, products: products.length };
	}
	const indexRows = (rows ?? []) as Array<{
		card_id: string;
		card_number: string | null;
		tcg_headline_market: number | null;
		tcg_headline_low: number | null;
		raw_nm_price: number | null;
		raw_source: string | null;
	}>;

	let matched = 0;
	let updated = 0;
	let missing = 0;
	const toWrite: Array<{
		card_id: string;
		tcg_headline_market: number;
		tcg_headline_low: number | null;
		raw_nm_price: number | null;
		raw_source: string | null;
	}> = [];

	for (const row of indexRows) {
		const numericPrefix = row.card_number ? parseInt(row.card_number, 10) : NaN;
		if (!Number.isFinite(numericPrefix)) continue;
		const hit = headline.get(numericPrefix);
		if (!hit || hit.market == null) {
			missing++;
			continue;
		}
		matched++;
		// Only overwrite nullish or enricher-labeled 'tcgplayer' sources —
		// never stomp a PriceCharting-sourced raw price, which is richer.
		const shouldWriteRaw =
			row.raw_nm_price == null ||
			(row.raw_source === 'tcgplayer' && row.raw_nm_price !== hit.market);
		// Always refresh headline fields if we have a value (they're the
		// canonical TCG market snapshot).
		const shouldWriteHeadline =
			row.tcg_headline_market == null || row.tcg_headline_market !== hit.market;
		if (!shouldWriteRaw && !shouldWriteHeadline) continue;

		toWrite.push({
			card_id: row.card_id,
			tcg_headline_market: hit.market,
			tcg_headline_low: hit.low,
			raw_nm_price: shouldWriteRaw ? hit.market : row.raw_nm_price,
			raw_source: shouldWriteRaw ? 'tcgplayer' : row.raw_source
		});
	}

	console.log(
		`[${setId}] matched ${matched} of ${indexRows.length} cards (${missing} without a TCGPlayer product)`
	);
	console.log(`[${setId}] ${toWrite.length} rows need update`);

	if (dryRun) {
		console.log(`[${setId}] DRY RUN — first 3 writes:`, toWrite.slice(0, 3));
		return { matched, updated: 0, products: products.length };
	}

	// Issue updates in chunks.
	const chunk = 100;
	for (let i = 0; i < toWrite.length; i += chunk) {
		const slice = toWrite.slice(i, i + chunk);
		await Promise.all(
			slice.map((u) =>
				supabase
					.from('card_index')
					.update({
						tcg_headline_market: u.tcg_headline_market,
						tcg_headline_low: u.tcg_headline_low,
						raw_nm_price: u.raw_nm_price,
						raw_source: u.raw_source,
						raw_fetched_at: new Date().toISOString()
					})
					.eq('card_id', u.card_id)
			)
		);
		updated += slice.length;
		process.stdout.write(`\r[${setId}] updated ${updated}/${toWrite.length}`);
	}
	console.log();
	return { matched, updated, products: products.length };
}

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			'tcg-set': { type: 'string', multiple: true },
			'all-mega': { type: 'boolean' },
			'dry-run': { type: 'boolean' }
		},
		strict: false
	});

	const dryRun = !!values['dry-run'];

	let work: Array<{ setId: string; tcgSet: string }> = [];
	if (values['all-mega']) {
		work = MEGA_SETS;
	} else if (values['tcg-set']) {
		const pairs = Array.isArray(values['tcg-set'])
			? (values['tcg-set'] as string[])
			: [values['tcg-set'] as string];
		for (const pair of pairs) {
			const [setId, tcgSet] = pair.split(':');
			if (!setId || !tcgSet) {
				console.error(`bad --tcg-set arg (expected "setId:tcgSet"): ${pair}`);
				process.exit(1);
			}
			work.push({ setId, tcgSet });
		}
	} else {
		console.error(
			'usage: backfill-tcgplayer-prices.ts --all-mega | --tcg-set me1:me-mega-evolution [--dry-run]'
		);
		process.exit(1);
	}

	for (const w of work) {
		await backfillSet(w.setId, w.tcgSet, dryRun);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
