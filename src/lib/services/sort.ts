import type { PokemonCard } from '$types';

// Sort options for the card browser.
//
// There are three flavours:
//
//   kind: 'api'     — the TCG API does the sort via its orderBy parameter.
//                     Works for any query size; server-paginated; fast.
//
//   kind: 'client'  — the TCG API can't sort by this criterion, so we fetch
//                     a bigger page up front, then filter / sort in memory
//                     from the TCGPlayer printing data that's already on
//                     each card. Used for flip-hunting modes like "Biggest
//                     Spread" (market − low on the headline printing) and
//                     "Bulk Hunt" (headline market < $1). Done on the server
//                     so no-JS and JS paths return identical results and
//                     there's no duplicated client/server logic.
//
//   kind: 'enriched' — like 'client' (fetches a big page, sorts in memory)
//                     but also runs async enrichment against external scrapers
//                     (PriceCharting) before sorting. The enrichment step
//                     happens in the loader, not in applyClientSort.
//
//   kind: 'index'   — queries card_index in Supabase (hunt mode). Only
//                     available when mode=hunt is active.
//
// Rarity sort is alphabetical, not value-based — the TCG API has no concept
// of rarity tiering, so "Common" < "Uncommon" < "Rare" isn't guaranteed.
// Labelled A–Z to make that clear.
//
// Kept in $lib/services (not a route) so the browse page server loader, the
// /api/cards endpoint (used for infinite scroll), and the browse page itself
// can all share the same mapping.

export type SortKind = 'api' | 'client' | 'enriched' | 'index';

export interface SortOption {
	value: string;
	label: string;
	kind: SortKind;
	/** TCG API orderBy string when kind = 'api'. Ignored otherwise. */
	orderBy?: string;
	/** card_index column for kind = 'index'. */
	indexColumn?: string;
	indexDirection?: 'asc' | 'desc';
	indexNulls?: 'first' | 'last';
	/** Which browse modes this sort appears in. Defaults to ['default']. */
	availableIn?: Array<'default' | 'hunt'>;
}

export const SORT_OPTIONS: SortOption[] = [
	{ value: '', label: 'Newest first', kind: 'api', orderBy: '-set.releaseDate', availableIn: ['default'] },
	{ value: 'oldest', label: 'Oldest first', kind: 'api', orderBy: 'set.releaseDate', availableIn: ['default'] },
	{ value: 'name', label: 'Name (A–Z)', kind: 'api', orderBy: 'name', availableIn: ['default'] },
	{ value: 'name_desc', label: 'Name (Z–A)', kind: 'api', orderBy: '-name', availableIn: ['default'] },
	{
		value: 'price_high',
		label: 'Price (high to low)',
		kind: 'api',
		orderBy: '-cardmarket.prices.averageSellPrice',
		availableIn: ['default']
	},
	{
		value: 'price_low',
		label: 'Price (low to high)',
		kind: 'api',
		orderBy: 'cardmarket.prices.averageSellPrice',
		availableIn: ['default']
	},
	{ value: 'rarity', label: 'Rarity (A–Z)', kind: 'api', orderBy: 'rarity', availableIn: ['default'] },
	{ value: 'number', label: 'Card number', kind: 'api', orderBy: 'number', availableIn: ['default'] },
	{ value: 'spread', label: 'Biggest Spread', kind: 'client', availableIn: ['default'] },
	{ value: 'bulk', label: 'Bulk Hunt (under $1)', kind: 'client', availableIn: ['default'] },
	{ value: 'delta', label: 'Raw → PSA 10 Delta', kind: 'enriched', availableIn: ['default'] },
	// Hunt mode (index-backed) sort options
	{ value: 'delta_desc', label: 'PSA 10 Delta (high → low)', kind: 'index', indexColumn: 'psa10_delta', indexDirection: 'desc', indexNulls: 'last', availableIn: ['hunt'] },
	{ value: 'delta_multiple', label: 'PSA 10 Multiple (high → low)', kind: 'index', indexColumn: 'psa10_multiple', indexDirection: 'desc', indexNulls: 'last', availableIn: ['hunt'] },
	{ value: 'raw_asc', label: 'Raw Price (low → high)', kind: 'index', indexColumn: 'raw_nm_price', indexDirection: 'asc', indexNulls: 'last', availableIn: ['hunt'] },
	{ value: 'raw_desc', label: 'Raw Price (high → low)', kind: 'index', indexColumn: 'raw_nm_price', indexDirection: 'desc', indexNulls: 'last', availableIn: ['hunt'] },
	{ value: 'psa10_desc', label: 'PSA 10 Price (high → low)', kind: 'index', indexColumn: 'psa10_price', indexDirection: 'desc', indexNulls: 'last', availableIn: ['hunt'] },
	{ value: 'pop_asc', label: 'Population (low → high)', kind: 'index', indexColumn: 'combined_pop_total', indexDirection: 'asc', indexNulls: 'last', availableIn: ['hunt'] },
	// Grading ROI — gem-rate-weighted PSA 10 premium (service-independent).
	// Grading cost is applied in the UI, not SQL, so rankings stay stable
	// across service switches. Label names "PSA gem rate" so the user knows
	// the signal is anchored to PSA population data.
	{ value: 'roi_desc', label: 'Grading ROI (PSA gem rate)', kind: 'index', indexColumn: 'grading_roi_premium', indexDirection: 'desc', indexNulls: 'last', availableIn: ['hunt'] },
];

const DEFAULT_OPTION = SORT_OPTIONS[0];
const DEFAULT_HUNT_OPTION = SORT_OPTIONS.find((o) => o.value === 'delta_desc')!;

/** Look up a sort option by its URL value, falling back to the default. */
export function resolveSortOption(sort: string | null | undefined, mode?: string): SortOption {
	const fallback = mode === 'hunt' ? DEFAULT_HUNT_OPTION : DEFAULT_OPTION;
	if (!sort) return fallback;
	return SORT_OPTIONS.find((o) => o.value === sort) ?? fallback;
}

/** Get sort options filtered by browse mode. */
export function getSortOptionsForMode(mode: string = 'default'): SortOption[] {
	return SORT_OPTIONS.filter((o) => {
		const available = o.availableIn ?? ['default'];
		return available.includes(mode as 'default' | 'hunt');
	});
}

/**
 * The TCG API orderBy to use for a given URL sort value.
 *
 * For client-side sort modes we still need SOMETHING to pass to the API —
 * we fetch the raw page with card-number ordering so the in-memory sort has
 * a stable baseline before filtering.
 */
export function resolveSortOrderBy(sort: string | null | undefined): string {
	const opt = resolveSortOption(sort);
	if (opt.kind === 'api') return opt.orderBy ?? '-set.releaseDate';
	return 'number';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers for deriving sort/filter values from a card's TCGPlayer price
// block. Each card exposes several printings (normal / holofoil / reverse /
// 1stEditionHolofoil / etc), each with its own low/mid/high/market. These
// helpers reduce that map down to a single comparable number.

interface PrintingPrice {
	printing: string;
	market: number | null;
	low: number | null;
}

function getPrintings(card: PokemonCard): PrintingPrice[] {
	const prices = card.tcgplayer?.prices;
	if (!prices) return [];
	return Object.entries(prices).map(([printing, p]) => ({
		printing,
		market: p?.market ?? null,
		low: p?.low ?? null
	}));
}

/**
 * Headline printing = the one with the highest market price. Picking the
 * max so a $50 holo doesn't hide behind a $0.25 reverse-holo printing.
 */
function getHeadlinePrinting(card: PokemonCard): PrintingPrice | null {
	let best: PrintingPrice | null = null;
	for (const p of getPrintings(card)) {
		if (p.market == null) continue;
		if (!best || p.market > (best.market ?? -Infinity)) best = p;
	}
	return best;
}

/** Headline market price — the card's "what is this worth" number. */
function getHeadlineMarket(card: PokemonCard): number | null {
	return getHeadlinePrinting(card)?.market ?? null;
}

/**
 * Spread within the headline printing. Uses `market - low`, NOT `high - low`:
 * TCGPlayer's `high` field is polluted with $9999-style outlier listings,
 * which made the high–low spread useless as a signal. `market - low` is the
 * actionable number — how much room there is between the cheapest current
 * copy and the recent market price.
 */
function getHeadlineSpread(card: PokemonCard): number | null {
	const best = getHeadlinePrinting(card);
	if (!best || best.market == null || best.low == null) return null;
	return best.market - best.low;
}

/**
 * Apply a client-side sort mode to a fetched card list. Pure — operates on
 * a copy. These modes also filter: cards without the required price data
 * are dropped so the result isn't padded with meaningless rows.
 *
 * For api-kind sort modes or the default, returns the input unchanged.
 */
export function applyClientSort(cards: PokemonCard[], sort: string | null | undefined): PokemonCard[] {
	const opt = resolveSortOption(sort);
	if (opt.kind !== 'client') return cards;

	if (opt.value === 'spread') {
		return cards
			.filter((c) => {
				const s = getHeadlineSpread(c);
				// Require a meaningful absolute spread so $0.04→$0.12 pennies
				// don't dominate the list.
				return s != null && s > 0.5;
			})
			.sort((a, b) => (getHeadlineSpread(b) ?? 0) - (getHeadlineSpread(a) ?? 0));
	}

	if (opt.value === 'bulk') {
		return cards
			.filter((c) => {
				const p = getHeadlineMarket(c);
				return p != null && p < 1;
			})
			.sort((a, b) => (getHeadlineMarket(a) ?? 0) - (getHeadlineMarket(b) ?? 0));
	}

	return cards;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriched card type — PokemonCard with PriceCharting data attached.
// Used by the 'enriched' sort mode (delta sort) and the hunt mode UI.

export interface EnrichedCard extends PokemonCard {
	_enrichment?: {
		raw_nm_price: number | null;
		raw_source: string | null;
		psa10_price: number | null;
		psa10_delta: number | null;
		psa10_multiple: number | null;
		pcUrl: string | null;
	};
}

/**
 * Sort enriched cards by the delta between PSA 10 and raw price.
 * Cards without enrichment data or without a PSA 10 comp are filtered out.
 */
export function applyEnrichedSort(cards: EnrichedCard[], sort: string | null | undefined): EnrichedCard[] {
	const opt = resolveSortOption(sort);
	if (opt.value !== 'delta') return cards;

	return cards
		.filter((c) => {
			const e = c._enrichment;
			return e?.psa10_delta != null && e.psa10_delta > 0;
		})
		.sort((a, b) => {
			const da = a._enrichment?.psa10_delta ?? 0;
			const db = b._enrichment?.psa10_delta ?? 0;
			return db - da;
		});
}
