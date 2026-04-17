/**
 * For a given set, compare TCG API card listings against card_index
 * and insert any rows that are missing with bare TCG metadata.
 * Skips PriceCharting enrichment — the stale-refresh cron picks
 * those up on its next cycle. Meant as a fast follow to
 * backfill-tcgplayer-prices when TCG API's card count has grown
 * past what our last full enrichment captured.
 *
 * Usage:
 *   npx tsx scripts/backfill-missing-cards.ts --set me2pt5
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

config({ path: '.env.local' });

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TCG_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.POKEMON_TCG_API_KEY) TCG_HEADERS['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;

interface TcgCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	types?: string[];
	number: string;
	artist?: string;
	rarity?: string;
	set: { id: string; name: string; series: string; releaseDate: string };
	images: { small: string; large: string };
	tcgplayer?: { prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }> };
}

async function fetchAllSetCards(setId: string): Promise<TcgCard[]> {
	const pageSize = 250;
	let page = 1;
	const out: TcgCard[] = [];
	while (true) {
		// No orderBy — TCG API paginates incorrectly when orderBy is set
		// on multi-page results, returning duplicate rows on page 2+.
		const params = new URLSearchParams({
			q: `set.id:${setId}`,
			page: String(page),
			pageSize: String(pageSize)
		});
		const res = await fetch(`https://api.pokemontcg.io/v2/cards?${params}`, { headers: TCG_HEADERS });
		if (!res.ok) throw new Error(`TCG API ${res.status}`);
		const json = (await res.json()) as { data: TcgCard[]; totalCount: number };
		out.push(...json.data);
		if (out.length >= json.totalCount || json.data.length < pageSize) break;
		page++;
	}
	return out;
}

function getHeadlineMarket(card: TcgCard): { market: number | null; low: number | null } {
	const prices = card.tcgplayer?.prices;
	if (!prices) return { market: null, low: null };
	let best: { market: number | null; low: number | null } = { market: null, low: null };
	for (const p of Object.values(prices)) {
		if (p.market != null && (best.market == null || p.market > best.market)) {
			best = { market: p.market, low: p.low ?? null };
		}
	}
	return best;
}

function derivePrintings(card: TcgCard) {
	const keys = Object.keys(card.tcgplayer?.prices ?? {});
	const lower = keys.map((k) => k.toLowerCase());
	return {
		has_normal: lower.some((v) => v === 'normal'),
		has_holofoil: lower.some((v) => v.includes('holofoil') && !v.includes('reverse')),
		has_reverse_holofoil: lower.some((v) => v.includes('reverseholofoil')),
		has_first_edition: lower.some((v) => v.includes('1stedition')),
		printing_variants: keys
	};
}

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: { set: { type: 'string' } },
		strict: false
	});
	const setId = values.set as string;
	if (!setId) {
		console.error('usage: backfill-missing-cards.ts --set <set_id>');
		process.exit(1);
	}

	console.log(`[${setId}] fetching all cards from TCG API…`);
	const tcgCards = await fetchAllSetCards(setId);
	console.log(`[${setId}] TCG API returned ${tcgCards.length} cards (${new Set(tcgCards.map(c => c.id)).size} unique ids)`);

	const { data: existing } = await supabase
		.from('card_index')
		.select('card_id')
		.eq('set_id', setId);
	const have = new Set(((existing ?? []) as Array<{ card_id: string }>).map((r) => r.card_id));
	const missing = tcgCards.filter((c) => !have.has(c.id));
	console.log(`[${setId}] card_index has ${have.size}; ${missing.length} missing`);
	if (missing.length === 0) return;

	const now = new Date().toISOString();
	const rows = missing.map((c) => {
		const headline = getHeadlineMarket(c);
		const printings = derivePrintings(c);
		const normalPrices = c.tcgplayer?.prices?.normal;
		const holoPrices = c.tcgplayer?.prices?.holofoil;
		const reversePrices = c.tcgplayer?.prices?.reverseHolofoil;
		return {
			card_id: c.id,
			name: c.name,
			set_id: c.set.id,
			set_name: c.set.name,
			set_series: c.set.series ?? null,
			set_release_date: c.set.releaseDate,
			card_number: c.number ?? null,
			rarity: c.rarity ?? null,
			supertype: c.supertype ?? null,
			subtypes: c.subtypes ?? [],
			types: c.types ?? [],
			artist: c.artist ?? null,
			image_small_url: c.images.small ?? null,
			image_large_url: c.images.large ?? null,
			...printings,
			tcg_normal_market: normalPrices?.market ?? null,
			tcg_holofoil_market: holoPrices?.market ?? null,
			tcg_reverse_holofoil_market: reversePrices?.market ?? null,
			tcg_headline_market: headline.market,
			tcg_headline_low: headline.low,
			raw_nm_price: headline.market,
			raw_source: headline.market != null ? 'tcgplayer' : null,
			raw_fetched_at: now,
			last_enriched_at: now,
			enrich_version: 2,
			enrich_errors: { pricecharting: 'skipped — bare insert' }
		};
	});

	const chunk = 50;
	let written = 0;
	for (let i = 0; i < rows.length; i += chunk) {
		const { error } = await supabase
			.from('card_index')
			.upsert(rows.slice(i, i + chunk), { onConflict: 'card_id' });
		if (error) {
			console.error(`[${setId}] upsert failed:`, error.message);
			process.exit(1);
		}
		written += Math.min(chunk, rows.length - i);
		process.stdout.write(`\r[${setId}] inserted ${written}/${rows.length}`);
	}
	console.log(`\n[${setId}] done — run backfill-tcgplayer-prices next to capture TCGPlayer-only prices`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
