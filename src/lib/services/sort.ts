import type { PokemonCard } from '$types';

// Sort options for the card browser.
//
// There are two flavours:
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
// Rarity sort is alphabetical, not value-based — the TCG API has no concept
// of rarity tiering, so "Common" < "Uncommon" < "Rare" isn't guaranteed.
// Labelled A–Z to make that clear.
//
// Kept in $lib/services (not a route) so the browse page server loader, the
// /api/cards endpoint (used for infinite scroll), and the browse page itself
// can all share the same mapping.

export type SortKind = 'api' | 'client';

export interface SortOption {
	value: string;
	label: string;
	kind: SortKind;
	/** TCG API orderBy string when kind = 'api'. Ignored otherwise. */
	orderBy?: string;
}

export const SORT_OPTIONS: SortOption[] = [
	{ value: '', label: 'Newest first', kind: 'api', orderBy: '-set.releaseDate' },
	{ value: 'oldest', label: 'Oldest first', kind: 'api', orderBy: 'set.releaseDate' },
	{ value: 'name', label: 'Name (A–Z)', kind: 'api', orderBy: 'name' },
	{ value: 'name_desc', label: 'Name (Z–A)', kind: 'api', orderBy: '-name' },
	{
		value: 'price_high',
		label: 'Price (high to low)',
		kind: 'api',
		orderBy: '-cardmarket.prices.averageSellPrice'
	},
	{
		value: 'price_low',
		label: 'Price (low to high)',
		kind: 'api',
		orderBy: 'cardmarket.prices.averageSellPrice'
	},
	{ value: 'rarity', label: 'Rarity (A–Z)', kind: 'api', orderBy: 'rarity' },
	{ value: 'number', label: 'Card number', kind: 'api', orderBy: 'number' },
	{ value: 'spread', label: 'Biggest Spread', kind: 'client' },
	{ value: 'bulk', label: 'Bulk Hunt (under $1)', kind: 'client' }
];

const DEFAULT_OPTION = SORT_OPTIONS[0];

/** Look up a sort option by its URL value, falling back to the default. */
export function resolveSortOption(sort: string | null | undefined): SortOption {
	if (!sort) return DEFAULT_OPTION;
	return SORT_OPTIONS.find((o) => o.value === sort) ?? DEFAULT_OPTION;
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
