/**
 * Local catalog reads. Source of truth for static card/set data once ingest
 * has run. Returns the same shape as `$services/tcg-api`'s search responses
 * so the API route can swap between catalog and live API without callers
 * noticing.
 *
 * Falls back to nothing — if the catalog is empty, callers should themselves
 * fall back to the TCG API. We don't want the route handler doing two
 * different things based on row count; that decision lives in one place.
 */
import type { PaginatedResponse, PokemonCard, CardSet } from '$types';
import { getSupabaseAdmin } from './supabase-admin';

interface CardRow {
	id: string;
	set_id: string | null;
	name: string;
	supertype: string | null;
	subtypes: string[] | null;
	hp: string | null;
	types: string[] | null;
	number: string;
	artist: string | null;
	rarity: string | null;
	national_pokedex_numbers: number[] | null;
	image_small: string | null;
	image_large: string | null;
	attacks: unknown;
	weaknesses: unknown;
	resistances: unknown;
	retreat_cost: string[] | null;
	tcgplayer_url: string | null;
	tcgplayer_prices: Record<string, unknown> | null;
	tcgplayer_updated_at: string | null;
	cardmarket_url: string | null;
	cardmarket_prices: Record<string, unknown> | null;
	cardmarket_updated_at: string | null;
}

interface SetRow {
	id: string;
	name: string;
	series: string | null;
	printed_total: number | null;
	total: number | null;
	release_date: string | null;
	symbol_url: string | null;
	logo_url: string | null;
}

function rowToSet(row: SetRow): CardSet {
	return {
		id: row.id,
		name: row.name,
		series: row.series ?? '',
		printedTotal: row.printed_total ?? 0,
		total: row.total ?? 0,
		releaseDate: row.release_date ?? '',
		images: {
			symbol: row.symbol_url ?? '',
			logo: row.logo_url ?? ''
		}
	};
}

function rowToCard(row: CardRow, set: CardSet | null): PokemonCard {
	return {
		id: row.id,
		name: row.name,
		supertype: row.supertype ?? '',
		subtypes: row.subtypes ?? undefined,
		hp: row.hp ?? undefined,
		types: row.types ?? undefined,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		attacks: (row.attacks as any) ?? undefined,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		weaknesses: (row.weaknesses as any) ?? undefined,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resistances: (row.resistances as any) ?? undefined,
		retreatCost: row.retreat_cost ?? undefined,
		set: set ?? {
			id: row.set_id ?? '',
			name: '',
			series: '',
			printedTotal: 0,
			total: 0,
			releaseDate: '',
			images: { symbol: '', logo: '' }
		},
		number: row.number,
		artist: row.artist ?? undefined,
		rarity: row.rarity ?? undefined,
		nationalPokedexNumbers: row.national_pokedex_numbers ?? undefined,
		images: {
			small: row.image_small ?? '',
			large: row.image_large ?? ''
		},
		tcgplayer: row.tcgplayer_url
			? {
					url: row.tcgplayer_url,
					updatedAt: row.tcgplayer_updated_at ?? '',
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					prices: (row.tcgplayer_prices as any) ?? undefined
				}
			: undefined,
		cardmarket: row.cardmarket_url
			? {
					url: row.cardmarket_url,
					updatedAt: row.cardmarket_updated_at ?? '',
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					prices: (row.cardmarket_prices as any) ?? undefined
				}
			: undefined
	};
}

/**
 * Returns true if the catalog has been populated. Used by callers to decide
 * whether to read locally or fall back to the live TCG API. Result is
 * cached for the lifetime of the process — if you just ran ingest, restart
 * the server.
 */
let catalogReadyCache: boolean | null = null;
export async function isCatalogReady(): Promise<boolean> {
	if (catalogReadyCache !== null) return catalogReadyCache;
	try {
		const admin = getSupabaseAdmin();
		const { count, error } = await admin
			.from('cards')
			.select('id', { head: true, count: 'exact' });
		if (error) return (catalogReadyCache = false);
		catalogReadyCache = (count ?? 0) > 0;
		return catalogReadyCache;
	} catch {
		return (catalogReadyCache = false);
	}
}

export async function getAllSets(): Promise<CardSet[]> {
	const admin = getSupabaseAdmin();
	const { data, error } = await admin
		.from('sets')
		.select('*')
		.order('release_date', { ascending: false });
	if (error || !data) return [];
	return (data as SetRow[]).map(rowToSet);
}

export interface CatalogSearchOptions {
	name?: string;
	setId?: string;
	type?: string;
	rarity?: string;
	page: number;
	pageSize: number;
}

/**
 * Catalog-backed equivalent of `searchCards` from `$services/tcg-api`.
 * Mirrors the shape: same query semantics where possible, same response
 * envelope. Sorts by set release date desc, then card number ascending —
 * matching the TCG API default order.
 */
export async function searchCatalog(
	opts: CatalogSearchOptions
): Promise<PaginatedResponse<PokemonCard>> {
	const admin = getSupabaseAdmin();

	let query = admin
		.from('cards')
		.select('*, set:sets(*)', { count: 'exact' });

	if (opts.name) query = query.ilike('name', `${opts.name}%`);
	if (opts.setId) query = query.eq('set_id', opts.setId);
	if (opts.rarity) query = query.eq('rarity', opts.rarity);
	if (opts.type) query = query.contains('types', [opts.type]);

	const from = (opts.page - 1) * opts.pageSize;
	const to = from + opts.pageSize - 1;

	// Order: newest sets first, then by card number within the set.
	query = query
		.order('release_date', {
			ascending: false,
			referencedTable: 'sets',
			nullsFirst: false
		})
		.order('number')
		.range(from, to);

	const { data, count, error } = await query;
	if (error) {
		console.error('[catalog] searchCatalog error:', error.message);
		return { data: [], page: opts.page, pageSize: opts.pageSize, count: 0, totalCount: 0 };
	}

	const cards = (data ?? []).map((row) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const set = (row as any).set as SetRow | null;
		return rowToCard(row as CardRow, set ? rowToSet(set) : null);
	});

	return {
		data: cards,
		page: opts.page,
		pageSize: opts.pageSize,
		count: cards.length,
		totalCount: count ?? cards.length
	};
}
