// Collector-concept search resolver.
//
// Collectors search by *concept* ("gold star", "vstar", "prism star"),
// but those are card_index `rarity` values, not card names — a plain
// name search for "gold star" returns nothing (the card is literally
// "Torchic ★", rarity "Rare Holo Star"). This maps a whole-query concept
// phrase to a hunt-mode card_index query so the user lands on every
// matching card WITH its prices/pop/sales, which is the whole point.
//
// Deliberately conservative: matches only when the entire (normalised)
// query IS the concept — "gold star" hits, "gold star charizard" falls
// through to normal search. Rarity substrings below are verified to
// exist in card_index. Add new rows freely; keep them distinctive.

interface Concept {
	/** Normalised phrases that should trigger this concept. */
	aliases: string[];
	/** Hunt-mode params to redirect to (card_index-backed, data-rich). */
	params: Record<string, string>;
}

const CONCEPTS: Concept[] = [
	{
		aliases: ['gold star', 'goldstar', 'gold stars', '★', 'star pokemon'],
		params: { mode: 'hunt', rarity_like: 'Rare Holo Star' }
	},
	{
		aliases: ['vstar', 'v star', 'vstars'],
		params: { mode: 'hunt', rarity_like: 'VSTAR' }
	},
	{
		aliases: ['prism star', 'prism', 'prism stars'],
		params: { mode: 'hunt', rarity_like: 'Prism Star' }
	}
];

function normalise(q: string): string {
	return q
		.trim()
		.toLowerCase()
		.replace(/[“”"']/g, '')
		.replace(/\s+/g, ' ');
}

/**
 * If the whole query is a known collector concept, return the hunt-mode
 * query string to redirect to (e.g. "gold star" → "mode=hunt&rarity_like=Rare%20Holo%20Star").
 * Returns null for anything that isn't an exact concept match.
 */
export function resolveSearchConcept(rawQuery: string): string | null {
	const q = normalise(rawQuery);
	if (!q) return null;
	for (const c of CONCEPTS) {
		if (c.aliases.includes(q)) {
			return new URLSearchParams(c.params).toString();
		}
	}
	return null;
}
