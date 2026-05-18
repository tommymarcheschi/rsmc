/**
 * Trove — TAG set matcher (Track A)
 *
 * TAG identifies a set by (category, year, brandName, cardSetName). Unlike
 * GemRate we don't have to guess a single string: TAG's /pops/set returns
 * EVERY set for a year with its real brandName + cardSetName, so the crawler
 * enumerates that list and matches our tracked set against it by name, then
 * proves the pick by card_number overlap (the honesty gate). A wrong match
 * is rejected at the gate, never written.
 *
 * This module only normalises names and scores candidates; OVERRIDES pins a
 * verified (brandName, cardSetName) when fuzzy matching is ambiguous.
 */

export interface TagSetKey {
	brandName: string;
	cardSetName: string;
}

/** set_id -> verified TAG (brandName, cardSetName). Add entries the crawler
 *  logs as "NEED ALIAS" once confirmed against a real fetch. */
const OVERRIDES: Record<string, TagSetKey> = {};

export function hasTagOverride(setId: string): boolean {
	return setId in OVERRIDES;
}
export function tagOverride(setId: string): TagSetKey | undefined {
	return OVERRIDES[setId];
}

export function yearOf(releaseDate: string): number {
	const m = (releaseDate ?? '').match(/(\d{4})/);
	return m ? parseInt(m[1], 10) : NaN;
}

/** Lowercase, strip diacritics, drop a leading "pokemon ", collapse
 *  whitespace and punctuation — for fuzzy name comparison only. */
export function normName(s: string): string {
	return (s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[\t\r\n]+/g, ' ')
		.replace(/^p\.?\s*m\.?\s+/i, '')
		.replace(/\bpok[e]?mon\b/gi, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * Score a TAG set row against our tracked set name. Higher = better; 0 = no
 * match worth trying. Exact normalised equality ranks first, then
 * containment either direction, then token overlap.
 */
export function scoreTagCandidate(ourSetName: string, tagCardSetName: string): number {
	const a = normName(ourSetName);
	const b = normName(tagCardSetName);
	if (!a || !b) return 0;
	if (a === b) return 100;
	if (b.includes(a) || a.includes(b)) return 70;
	const ta = new Set(a.split(' ').filter(Boolean));
	const tb = new Set(b.split(' ').filter(Boolean));
	if (ta.size === 0 || tb.size === 0) return 0;
	let inter = 0;
	for (const t of ta) if (tb.has(t)) inter++;
	const jaccard = inter / (ta.size + tb.size - inter);
	return jaccard >= 0.5 ? Math.round(40 * jaccard) : 0;
}

/** Normalise a card number for cross-source overlap: "42/102" -> "42",
 *  strip leading zeros, lowercase (handles "TG12", "SWSH001"). */
export function normCardNumber(v: string | null | undefined): string {
	const s = String(v ?? '')
		.trim()
		.toLowerCase();
	const head = s.split('/')[0]?.trim() ?? '';
	return head.replace(/^0+(?=\d)/, '');
}
