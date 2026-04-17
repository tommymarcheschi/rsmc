/**
 * Auto-heal core — shared between the CLI script (scripts/auto-heal-sets.ts)
 * and the /admin/index dashboard action. Given a tracked_set row, compares
 * pokemontcg.io against card_index, inserts missing rows with bare TCG
 * metadata, discovers the TCGPlayer slug if unknown, and backfills prices
 * from TCGPlayer's search API.
 *
 * This file lives under src/lib/services/ so SvelteKit server code can
 * import it. The CLI script dynamically imports it too — no duplication.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	fetchTcgPlayerSet,
	headlineByNumber,
	discoverTcgplayerSetSlug
} from './tcgplayer-search-scraper';

export interface TrackedSetRow {
	set_id: string;
	set_name: string;
	release_date: string;
	tcgplayer_set_name: string | null;
	tcgplayer_last_backfilled_at: string | null;
}

export interface HealReport {
	setId: string;
	missingInserted: number;
	slugDiscovered: string | null;
	pricesUpdated: number;
	skipped: boolean;
	error?: string;
}

export interface HealOptions {
	/** Override the 24h freshness guard on TCGPlayer price backfill. */
	force?: boolean;
	dryRun?: boolean;
	/** Pokémon TCG API key (optional). Falls through to env POKEMON_TCG_API_KEY. */
	tcgApiKey?: string;
}

export const BACKFILL_FRESHNESS_MS = 24 * 60 * 60 * 1000;

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
	tcgplayer?: {
		prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
	};
}

async function fetchAllSetCards(setId: string, tcgApiKey?: string): Promise<TcgCard[]> {
	const pageSize = 250;
	let page = 1;
	const out: TcgCard[] = [];
	const seen = new Set<string>();
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const key = tcgApiKey || process.env.POKEMON_TCG_API_KEY;
	if (key) headers['X-Api-Key'] = key;

	while (true) {
		// No orderBy — pokemontcg.io paginates incorrectly when orderBy is
		// set on multi-page queries (see feedback_tcg_api_pagination memory).
		const params = new URLSearchParams({
			q: `set.id:${setId}`,
			page: String(page),
			pageSize: String(pageSize)
		});
		const res = await fetch(`https://api.pokemontcg.io/v2/cards?${params}`, { headers });
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
	supabase: SupabaseClient,
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
	supabase: SupabaseClient,
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

export async function healSet(
	supabase: SupabaseClient,
	tracked: TrackedSetRow,
	opts: HealOptions = {}
): Promise<HealReport> {
	const force = !!opts.force;
	const dryRun = !!opts.dryRun;
	const report: HealReport = {
		setId: tracked.set_id,
		missingInserted: 0,
		slugDiscovered: null,
		pricesUpdated: 0,
		skipped: false
	};

	let tcgCards: TcgCard[] = [];
	try {
		tcgCards = await fetchAllSetCards(tracked.set_id, opts.tcgApiKey);
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

	try {
		report.missingInserted = await insertMissingCards(
			supabase,
			tcgCards,
			existingIds,
			dryRun
		);
	} catch (e) {
		report.error = `insert: ${(e as Error).message}`;
		return report;
	}

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

	if (slug) {
		const last = tracked.tcgplayer_last_backfilled_at
			? new Date(tracked.tcgplayer_last_backfilled_at).getTime()
			: 0;
		const ageMs = Date.now() - last;
		if (!force && ageMs < BACKFILL_FRESHNESS_MS) {
			report.skipped = true;
		} else {
			try {
				report.pricesUpdated = await backfillTcgplayerPrices(
					supabase,
					tracked.set_id,
					slug,
					dryRun
				);
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
