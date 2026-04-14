#!/usr/bin/env node
/**
 * Trove catalog ingest
 *
 * Pages through the Pokémon TCG API and upserts every set + every card into
 * the local Supabase catalog. Idempotent — safe to re-run when new sets drop
 * or when you want to refresh price snapshots embedded on each card.
 *
 * Run with:
 *   npm run ingest:catalog                    # all sets
 *   npm run ingest:catalog -- --set base1     # one set
 *   npm run ingest:catalog -- --since 2024    # only sets released this year+
 *
 * Env required:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY     (NOT the publishable key — needs RLS bypass)
 *   POKEMON_TCG_API_KEY           (optional but recommended; raises rate limit
 *                                  from 1k/day to 20k/day)
 *
 * The script writes via the admin client and never touches anything the
 * frontend reads, so you can run it against production safely.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

const TCG_BASE = 'https://api.pokemontcg.io/v2';
const TCG_PAGE_SIZE = 250; // API max

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TCG_KEY = process.env.POKEMON_TCG_API_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE) {
	console.error(
		'Missing required env. Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.'
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
	auth: { persistSession: false, autoRefreshToken: false }
});

// ─────────────────────────────────────────────────────────────────────────────
// TCG API client
// ─────────────────────────────────────────────────────────────────────────────

function tcgHeaders(): Record<string, string> {
	return TCG_KEY
		? { 'Content-Type': 'application/json', 'X-Api-Key': TCG_KEY }
		: { 'Content-Type': 'application/json' };
}

async function fetchJson<T>(url: string): Promise<T> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, { headers: tcgHeaders() });
			if (res.status === 429) {
				const wait = 2000 * (attempt + 1);
				console.warn(`  rate-limited, waiting ${wait}ms…`);
				await sleep(wait);
				continue;
			}
			if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
			return (await res.json()) as T;
		} catch (err) {
			if (attempt === 2) throw err;
			console.warn(`  fetch failed (${(err as Error).message}), retrying…`);
			await sleep(1500);
		}
	}
	throw new Error('unreachable');
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Set ingest
// ─────────────────────────────────────────────────────────────────────────────

interface RawSet {
	id: string;
	name: string;
	series?: string;
	printedTotal?: number;
	total?: number;
	releaseDate?: string;
	images?: { symbol?: string; logo?: string };
}

async function fetchAllSets(): Promise<RawSet[]> {
	const res = await fetchJson<{ data: RawSet[] }>(`${TCG_BASE}/sets?orderBy=-releaseDate`);
	return res.data;
}

async function upsertSets(sets: RawSet[]): Promise<void> {
	if (sets.length === 0) return;
	const rows = sets.map((s) => ({
		id: s.id,
		name: s.name,
		series: s.series ?? null,
		printed_total: s.printedTotal ?? null,
		total: s.total ?? null,
		// TCG API release dates use "YYYY/MM/DD" — normalize to ISO.
		release_date: s.releaseDate ? s.releaseDate.replace(/\//g, '-') : null,
		symbol_url: s.images?.symbol ?? null,
		logo_url: s.images?.logo ?? null,
		ingested_at: new Date().toISOString()
	}));

	const { error } = await supabase.from('sets').upsert(rows, { onConflict: 'id' });
	if (error) throw new Error(`set upsert failed: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Card ingest
// ─────────────────────────────────────────────────────────────────────────────

interface RawCard {
	id: string;
	name: string;
	supertype?: string;
	subtypes?: string[];
	hp?: string;
	types?: string[];
	number: string;
	artist?: string;
	rarity?: string;
	nationalPokedexNumbers?: number[];
	images?: { small?: string; large?: string };
	attacks?: unknown;
	weaknesses?: unknown;
	resistances?: unknown;
	retreatCost?: string[];
	set?: { id: string };
	tcgplayer?: { url?: string; updatedAt?: string; prices?: unknown };
	cardmarket?: { url?: string; updatedAt?: string; prices?: unknown };
}

function cardToRow(c: RawCard) {
	return {
		id: c.id,
		set_id: c.set?.id ?? null,
		name: c.name,
		supertype: c.supertype ?? null,
		subtypes: c.subtypes ?? null,
		hp: c.hp ?? null,
		types: c.types ?? null,
		number: c.number,
		artist: c.artist ?? null,
		rarity: c.rarity ?? null,
		national_pokedex_numbers: c.nationalPokedexNumbers ?? null,
		image_small: c.images?.small ?? null,
		image_large: c.images?.large ?? null,
		attacks: c.attacks ?? null,
		weaknesses: c.weaknesses ?? null,
		resistances: c.resistances ?? null,
		retreat_cost: c.retreatCost ?? null,
		tcgplayer_url: c.tcgplayer?.url ?? null,
		tcgplayer_prices: c.tcgplayer?.prices ?? null,
		// updatedAt comes through as a YYYY/MM/DD string — leave null if absent
		// rather than poisoning the timestamptz column with an invalid value.
		tcgplayer_updated_at: c.tcgplayer?.updatedAt
			? new Date(c.tcgplayer.updatedAt.replace(/\//g, '-')).toISOString()
			: null,
		cardmarket_url: c.cardmarket?.url ?? null,
		cardmarket_prices: c.cardmarket?.prices ?? null,
		cardmarket_updated_at: c.cardmarket?.updatedAt
			? new Date(c.cardmarket.updatedAt.replace(/\//g, '-')).toISOString()
			: null,
		ingested_at: new Date().toISOString()
	};
}

async function ingestSet(setId: string, setName: string): Promise<number> {
	let page = 1;
	let total = 0;
	while (true) {
		const url = `${TCG_BASE}/cards?q=set.id:${setId}&page=${page}&pageSize=${TCG_PAGE_SIZE}&orderBy=number`;
		const res = await fetchJson<{ data: RawCard[]; totalCount: number; count: number }>(url);
		if (res.data.length === 0) break;

		const rows = res.data.map(cardToRow);
		const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
		if (error) {
			throw new Error(`[${setId}] card upsert failed on page ${page}: ${error.message}`);
		}

		total += rows.length;
		process.stdout.write(
			`  ${setName} (${setId}): ${total}/${res.totalCount}\r`
		);

		if (total >= res.totalCount) break;
		page++;
		// Polite to the free TCG API even with a key.
		await sleep(150);
	}
	process.stdout.write('\n');
	return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	const { values } = parseArgs({
		options: {
			set: { type: 'string' },
			since: { type: 'string' },
			help: { type: 'boolean', short: 'h' }
		}
	});

	if (values.help) {
		console.log(`Trove catalog ingest

Usage:
  npm run ingest:catalog
  npm run ingest:catalog -- --set base1
  npm run ingest:catalog -- --since 2024

Options:
  --set <id>      Ingest only the given set
  --since <year>  Only ingest sets released on/after this year
  -h, --help      Show this help`);
		process.exit(0);
	}

	console.log('▸ fetching set list from TCG API…');
	let sets = await fetchAllSets();
	console.log(`  ${sets.length} sets total`);

	if (values.set) {
		sets = sets.filter((s) => s.id === values.set);
		if (sets.length === 0) {
			console.error(`No set found with id "${values.set}"`);
			process.exit(1);
		}
	} else if (values.since) {
		const cutoff = `${values.since}-01-01`;
		sets = sets.filter((s) => (s.releaseDate ?? '').replace(/\//g, '-') >= cutoff);
		console.log(`  filtered to ${sets.length} sets released since ${cutoff}`);
	}

	console.log('▸ upserting sets…');
	await upsertSets(sets);

	console.log(`▸ ingesting cards from ${sets.length} set(s)…`);
	let totalCards = 0;
	const startedAt = Date.now();
	for (let i = 0; i < sets.length; i++) {
		const s = sets[i];
		const prefix = `[${i + 1}/${sets.length}]`;
		console.log(`${prefix} ${s.name}`);
		try {
			totalCards += await ingestSet(s.id, s.name);
		} catch (err) {
			console.error(`  failed: ${(err as Error).message}`);
		}
	}

	const seconds = Math.round((Date.now() - startedAt) / 1000);
	console.log(`\n✓ done — ${totalCards.toLocaleString()} cards in ${seconds}s`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
