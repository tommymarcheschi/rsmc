import type { PokemonCard } from '$types';

/**
 * Pure helpers for deriving sort/filter values from a card's TCGPlayer price
 * block. Cards expose multiple printings (normal / holofoil / reverseHolofoil
 * / 1stEditionHolofoil / etc.), each with its own low/mid/high/market values,
 * so every helper has to reduce that map down to a single comparable number.
 */

export interface PrintingPrice {
	printing: string;
	market: number | null;
	low: number | null;
	mid: number | null;
	high: number | null;
}

export function getPrintings(card: PokemonCard): PrintingPrice[] {
	const prices = card.tcgplayer?.prices;
	if (!prices) return [];
	return Object.entries(prices).map(([printing, p]) => ({
		printing,
		market: p?.market ?? null,
		low: p?.low ?? null,
		mid: p?.mid ?? null,
		high: p?.high ?? null
	}));
}

/**
 * Headline price = highest market across all printings. A card's "what is
 * this thing worth" number for the purposes of sorting and badges. We pick
 * the max so a $50 holo doesn't hide behind a $0.25 reverse.
 */
export function getHeadlinePrice(card: PokemonCard): number | null {
	const markets = getPrintings(card)
		.map((p) => p.market)
		.filter((v): v is number => v != null);
	if (markets.length === 0) return null;
	return Math.max(...markets);
}

/** Highest-market printing — used to compute spread on the printing that matters. */
export function getHeadlinePrinting(card: PokemonCard): PrintingPrice | null {
	const prints = getPrintings(card);
	let best: PrintingPrice | null = null;
	for (const p of prints) {
		if (p.market == null) continue;
		if (!best || p.market > (best.market ?? -Infinity)) best = p;
	}
	return best;
}

/**
 * Spread within the headline printing: how much room there is between the
 * lowest current listing and the recent market price. Positive = the cheapest
 * available copy is below market, i.e. a flip opportunity.
 *
 * We deliberately use `market - low` instead of `high - low`. TCGPlayer's
 * `high` field is polluted with absurd outlier listings ($9999 "if-you're-
 * desperate" prices), which made the high-low spread useless as a signal.
 */
export function getPrintingSpread(card: PokemonCard): number | null {
	const best = getHeadlinePrinting(card);
	if (!best || best.market == null || best.low == null) return null;
	return best.market - best.low;
}

/** Spread as a percentage of the low — flat dollar spread is misleading on cheap cards. */
export function getPrintingSpreadPct(card: PokemonCard): number | null {
	const best = getHeadlinePrinting(card);
	if (!best || best.market == null || best.low == null || best.low <= 0) return null;
	return (best.market - best.low) / best.low;
}

/** Parse the leading integer out of a card number string like "25", "150a", "TG01", "SWSH001". */
export function parseCardNumber(num: string): number {
	const match = num.match(/\d+/);
	return match ? parseInt(match[0], 10) : 9999;
}
