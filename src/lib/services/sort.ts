// Sort options for the card browser. The `value` is what goes in the URL as
// ?sort=…; the `orderBy` is what gets passed to the Pokémon TCG API. The API
// supports dot-notation on nested fields, so price sorts lean on
// `cardmarket.prices.averageSellPrice` — this is the closest thing the API
// has to a "market price" that's cheap and available on every card with any
// pricing data.
//
// Rarity sort is alphabetical, not value-based — the TCG API has no concept
// of rarity tiering, so "Common" < "Uncommon" < "Rare" isn't guaranteed. It's
// still useful for grouping but is labelled A–Z to make the behaviour clear.
//
// Kept in $lib/services (not a route) so the browse page server loader, the
// /api/cards endpoint (used for infinite scroll), and the browse page itself
// can all share the same mapping.

export interface SortOption {
	value: string;
	label: string;
	orderBy: string;
}

export const SORT_OPTIONS: SortOption[] = [
	{ value: '', label: 'Newest first', orderBy: '-set.releaseDate' },
	{ value: 'oldest', label: 'Oldest first', orderBy: 'set.releaseDate' },
	{ value: 'name', label: 'Name (A–Z)', orderBy: 'name' },
	{ value: 'name_desc', label: 'Name (Z–A)', orderBy: '-name' },
	{
		value: 'price_high',
		label: 'Price (high to low)',
		orderBy: '-cardmarket.prices.averageSellPrice'
	},
	{
		value: 'price_low',
		label: 'Price (low to high)',
		orderBy: 'cardmarket.prices.averageSellPrice'
	},
	{ value: 'rarity', label: 'Rarity (A–Z)', orderBy: 'rarity' },
	{ value: 'number', label: 'Card number', orderBy: 'number' }
];

const DEFAULT_ORDER_BY = SORT_OPTIONS[0].orderBy;

/** Map a URL sort value (possibly empty or unknown) to a TCG API orderBy string. */
export function resolveSortOrderBy(sort: string | null | undefined): string {
	if (!sort) return DEFAULT_ORDER_BY;
	const match = SORT_OPTIONS.find((o) => o.value === sort);
	return match ? match.orderBy : DEFAULT_ORDER_BY;
}
