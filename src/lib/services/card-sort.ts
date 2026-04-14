import type { PokemonCard } from '$types';
import {
	getHeadlinePrice,
	getPrintingSpread,
	getPrintingSpreadPct,
	parseCardNumber
} from './card-price';

export type SortMode =
	| 'default'
	| 'price-asc'
	| 'price-desc'
	| 'spread-desc'
	| 'bulk';

export interface SortOption {
	id: SortMode;
	label: string;
	hint: string;
}

export const SORT_OPTIONS: SortOption[] = [
	{ id: 'default', label: 'Set Order', hint: 'By card number' },
	{ id: 'price-desc', label: 'Price: High → Low', hint: 'Most expensive first' },
	{ id: 'price-asc', label: 'Price: Low → High', hint: 'Cheapest first' },
	{ id: 'spread-desc', label: 'Biggest Spread', hint: 'Widest low→high range, flip targets' },
	{ id: 'bulk', label: 'Bulk Hunt (under $1)', hint: 'Cheap pickups, ascending' }
];

/**
 * Apply a sort mode to a list of cards. All sorts are pure and operate on
 * a copy. Some modes (bulk, spread) also filter — cards that lack the
 * required price data are dropped so the result list isn't padded with
 * meaningless rows.
 */
export function sortCards(cards: PokemonCard[], mode: SortMode): PokemonCard[] {
	const arr = [...cards];

	switch (mode) {
		case 'default':
			return arr.sort(
				(a, b) => parseCardNumber(a.number) - parseCardNumber(b.number)
			);

		case 'price-desc':
			return arr
				.filter((c) => getHeadlinePrice(c) != null)
				.sort((a, b) => getHeadlinePrice(b)! - getHeadlinePrice(a)!);

		case 'price-asc':
			return arr
				.filter((c) => getHeadlinePrice(c) != null)
				.sort((a, b) => getHeadlinePrice(a)! - getHeadlinePrice(b)!);

		case 'spread-desc':
			return arr
				.filter((c) => {
					const s = getPrintingSpread(c);
					// Require a meaningful absolute spread so $0.04→$0.12 cards don't
					// dominate. The percent helper guards against div-by-zero too.
					return s != null && s > 0.5 && getPrintingSpreadPct(c) != null;
				})
				.sort((a, b) => getPrintingSpread(b)! - getPrintingSpread(a)!);

		case 'bulk':
			return arr
				.filter((c) => {
					const p = getHeadlinePrice(c);
					return p != null && p < 1;
				})
				.sort((a, b) => getHeadlinePrice(a)! - getHeadlinePrice(b)!);
	}
}

/**
 * For a given sort mode, return the secondary number to render as a chip on
 * the card thumbnail (e.g. spread for spread-desc). null = use the default
 * headline price badge.
 */
export function getSortBadgeValue(card: PokemonCard, mode: SortMode): number | null {
	if (mode === 'spread-desc') return getPrintingSpread(card);
	return null;
}
