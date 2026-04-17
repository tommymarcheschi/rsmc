/**
 * Auto-heal tracked sets.
 *
 * For every enabled row in tracked_sets:
 *   1. Compare pokemontcg.io card count with card_index row count.
 *      Insert any missing rows with bare TCG metadata.
 *   2. If tcgplayer_set_name is null, try to discover TCGPlayer's
 *      slug by name-matching against their aggregated set list.
 *   3. If a slug is known, fetch all TCGPlayer products and update
 *      card_index prices for rows where we don't yet have a
 *      PriceCharting-sourced raw price.
 *
 * Nightly cron hook — replaces the manual loop of
 *   backfill-missing-cards.ts + backfill-tcgplayer-prices.ts
 * we were running by hand whenever a new set landed.
 *
 * Safe to re-run. Skips sets that already have full coverage + fresh
 * TCGPlayer prices unless --force is set.
 *
 * Usage:
 *   npx tsx scripts/auto-heal-sets.ts           # all enabled tracked_sets
 *   npx tsx scripts/auto-heal-sets.ts --set me3 # single set
 *   npx tsx scripts/auto-heal-sets.ts --force   # ignore last-backfilled-at guard
 *   npx tsx scripts/auto-heal-sets.ts --dry-run # report but don't write
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import {
	fetchTcgPlayerSet,
	headlineByNumber,
	discoverTcgplayerSetSlug
} from '../src/lib/services/tcgplayer-search-scraper';

config({ path: '.env.local' });

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TCG_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.POKEMON_TCG_API_KEY) TCG_HEADERS['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;

// TCGPlayer prices move daily — refresh a set's backfill if it's
// been more than 24h, otherwise skip to stay polite on their API.
const BACKFILL_FRESHNESS_MS = 24 * 60 * 60 * 1000;

interface TrackedSet {
	set_id: string;
	set_name: string;
	release_date: string;
	tcgplayer_set_name: string | null;
	tcgplayer_last_backfilled_at: string | null;
}

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

interface HealReport {
	setId: string;
	missingInserted: number;
	slugDiscovered: string | null;
	pricesUpdated: number;
	skipped: boolean;
	error?: string;
}

async function fetchAllSetCards(setId: string): Promise<TcgCard[]> {
	const pageSize = 250;
	let page = 1;
	const out: TcgCard[] = [];
	const seen = new Set<string>();
	while (true) {
		// No orderBy — the TCG API returns duplicates on page 2+ when
		// orderBy is set on multi-page queries (gotcha we hit earlier
		// with ME2.5 where page 2 re-returned page 1's last rows).
		const params = new URLSearchParams({
			q: `set.id:${setId}`,
			page: String(page),
			pageSize: String(pageSize)
		});
		const res = await fetch(`https://api.pokemontcg.io/v2/cards?${params}`, {
			headers: TCG_HEADERS
		});
		if (!res.ok) throw new Error(`TCG API ${res.status} for set ${setId}`);
		const json = (await res.json()) as { data: TcgCard[]; totalCount: number };
		for (const c of json.data) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				out.push(c);
			}
		}
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

async function insertMissingCards(
	setId: string,
	tcgCards: TcgCard[],
	existingIds: Set<string>,
	dryRun: boolean
): Promise<number> {
	const missing = tcgCards.filter((c) => !existingIds.has(c.id));
	if (missing.length === 0) return 0;

	if (dryRun) return missing.length;

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
			enrich_errors: { pricecharting: 'skipped — auto-heal bare insert' }
		};
	});

	const chunk = 50;
	for (let i = 0; i < rows.length; i += chunk) {
		const { error } = await supabase
			.from('card_index')
			.upsert(rows.slice(i, i + chunk), { onConflict: 'card_id' });
		if (error) throw new Error(`upsert failed: ${error.message}`);
	}
	return rows.length;
}

async function backfillTcgplayerPrices(
	setId: string,
	tcgSet: string,
	dryRun: boolean
): Promise<number> {
	const products = await fetchTcgPlayerSet(tcgSet);
	if (products.length === 0) return 0;
	const headline = headlineByNumber(products);

	const { data: rows } = await supabase
		.from('card_index')
		.select(
			'card_id, card_number, tcg_headline_market, tcg_headline_low, raw_nm_price, raw_source'
		)
		.eq('set_id', setId);
	const indexRows = (rows ?? []) as Array<{
		card_id: string;
		card_number: string | null;
		tcg_headline_market: number | null;
		tcg_headline_low: number | null;
		raw_nm_price: number | null;
		raw_source: string | null;
	}>;

	const now = new Date().toISOString();
	const updates: Array<Record<string, unknown>> = [];
	for (const row of indexRows) {
		const num = row.card_number ? parseInt(row.card_number, 10) : NaN;
		if (!Number.isFinite(num)) continue;
		const hit = headline.get(num);
		if (!hit || hit.market == null) continue;

		// Don't overwrite a PriceCharting-sourced raw price — it's richer
		// than TCGPlayer market (reflects realized sales, not asks).
		const shouldWriteRaw =
			row.raw_nm_price == null ||
			(row.raw_source === 'tcgplayer' && row.raw_nm_price !== hit.market);
		const shouldWriteHeadline =
			row.tcg_headline_market == null || row.tcg_headline_market !== hit.market;
		if (!shouldWriteRaw && !shouldWriteHeadline) continue;

		updates.push({
			card_id: row.card_id,
			tcg_headline_market: hit.market,
			tcg_headline_low: hit.low,
			raw_nm_price: shouldWriteRaw ? hit.market : row.raw_nm_price,
			raw_source: shouldWriteRaw ? 'tcgplayer' : row.raw_source,
			raw_fetched_at: now
		});
	}

	if (dryRun) return updates.length;

	const chunk = 100;
	for (let i = 0; i < updates.length; i += chunk) {
		const slice = updates.slice(i, i + chunk);
		await Promise.all(
			slice.map((u) =>
				supabase
					.from('card_index')
					.update({
						tcg_headline_market: u.tcg_headline_market,
						tcg_headline_low: u.tcg_headline_low,
						raw_nm_price: u.raw_nm_price,
						raw_source: u.raw_source,
						raw_fetched_at: u.raw_fetched_at
					})
					.eq('card_id', u.card_id)
			)
		);
	}
	return updates.length;
}

async function healSet(tracked: TrackedSet, force: boolean, dryRun: boolean): Promise<HealReport> {
	const report: HealReport = {
		setId: tracked.set_id,
		missingInserted: 0,
		slugDiscovered: null,
		pricesUpdated: 0,
		skipped: false
	};

	// 1. Card coverage. Compare TCG API to card_index.
	let tcgCards: TcgCard[] = [];
	try {
		tcgCards = await fetchAllSetCards(tracked.set_id);
	} catch (e) {
		report.error = `TCG API: ${(e as Error).message}`;
		return report;
	}

	const { data: existing } = await supabase
		.from('card_index')
		.select('card_id')
		.eq('set_id', tracked.set_id);
	const existingIds = new Set(
		((existing ?? []) as Array<{ card_id: string }>).map((r) => r.card_id)
	);

	report.missingInserted = await insertMissingCards(tracked.set_id, tcgCards, existingIds, dryRun);

	// 2. TCGPlayer slug discovery. Runs once per set, persisted.
	let slug = tracked.tcgplayer_set_name;
	if (!slug) {
		try {
			const discovered = await discoverTcgplayerSetSlug(tracked.set_name);
			if (discovered) {
				slug = discovered.slug;
				report.slugDiscovered = slug;
				if (!dryRun) {
					await supabase
						.from('tracked_sets')
						.update({ tcgplayer_set_name: slug })
						.eq('set_id', tracked.set_id);
				}
			}
		} catch (e) {
			report.error = `discovery: ${(e as Error).message}`;
		}
	}

	// 3. TCGPlayer price backfill. Respect the freshness guard.
	if (slug) {
		const last = tracked.tcgplayer_last_backfilled_at
			? new Date(tracked.tcgplayer_last_backfilled_at).getTime()
			: 0;
		const ageMs = Date.now() - last;
		if (!force && ageMs < BACKFILL_FRESHNESS_MS) {
			report.skipped = true;
		} else {
			try {
				report.pricesUpdated = await backfillTcgplayerPrices(tracked.set_id, slug, dryRun);
				if (!dryRun) {
					await supabase
						.from('tracked_sets')
						.update({ tcgplayer_last_backfilled_at: new Date().toISOString() })
						.eq('set_id', tracked.set_id);
				}
			} catch (e) {
				report.error = `backfill: ${(e as Error).message}`;
			}
		}
	}

	return report;
}

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			set: { type: 'string' },
			force: { type: 'boolean' },
			'dry-run': { type: 'boolean' }
		},
		strict: false
	});
	const dryRun = !!values['dry-run'];
	const force = !!values.force;

	let query = supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date, tcgplayer_set_name, tcgplayer_last_backfilled_at')
		.eq('enabled', true)
		.order('release_date', { ascending: false });

	if (values.set) {
		query = query.eq('set_id', values.set as string);
	}

	const { data, error } = await query;
	if (error) {
		console.error('tracked_sets read failed:', error.message);
		process.exit(1);
	}
	const sets = (data ?? []) as TrackedSet[];

	console.log(`auto-heal: ${sets.length} set(s)${dryRun ? ' (DRY RUN)' : ''}${force ? ' (force)' : ''}`);

	let totals = { missing: 0, priced: 0, discovered: 0, errors: 0, skipped: 0 };
	for (const set of sets) {
		process.stdout.write(`  ${set.set_id.padEnd(12)} ${set.set_name.slice(0, 30).padEnd(30)} `);
		const r = await healSet(set, force, dryRun);
		if (r.error) {
			console.log(`ERROR: ${r.error}`);
			totals.errors++;
			continue;
		}
		if (r.skipped) {
			console.log('up to date');
			totals.skipped++;
			continue;
		}
		const bits: string[] = [];
		if (r.missingInserted) bits.push(`+${r.missingInserted} cards`);
		if (r.slugDiscovered) bits.push(`slug=${r.slugDiscovered}`);
		if (r.pricesUpdated) bits.push(`${r.pricesUpdated} prices`);
		if (bits.length === 0) bits.push('no changes');
		console.log(bits.join(', '));
		totals.missing += r.missingInserted;
		totals.priced += r.pricesUpdated;
		if (r.slugDiscovered) totals.discovered++;
	}

	console.log(
		`\ntotals: +${totals.missing} card rows, ${totals.priced} prices updated, ${totals.discovered} new slugs, ${totals.skipped} up-to-date, ${totals.errors} errors`
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
