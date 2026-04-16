/**
 * Condition detector — infer TCGPlayer-style condition from free-text listings
 *
 * Pure helper. Given a listing title or description, returns the most likely
 * raw-card condition in the TCGPlayer 5-tier scale (NM/LP/MP/HP/DMG) along
 * with a 0–1 confidence score. Callers downstream exclude events with
 * confidence below `MIN_SNAPSHOT_CONFIDENCE` from aggregate math so
 * low-quality signals don't pollute the median/p25/p75.
 *
 * Design doctrine (same as grading-roi.ts): when unsure, return null. Never
 * guess and bury the uncertainty — the aggregator is explicit about what it
 * couldn't classify.
 *
 * Three tiers of signal strength:
 *   1. Canonical full phrases ("Near Mint", "Lightly Played", …) → 0.95
 *   2. Abbreviations inside condition context ("Condition: NM", "NM/M") → 0.85
 *   3. Descriptive eBay language ("minor edge wear", "pack fresh") → 0.65
 *
 * False-positive traps filtered explicitly:
 *   - "HP" alone → Pokémon hit points, not Heavily Played
 *   - "damaged box/case/sleeve/wrapper" → packaging, not the card
 *   - "near mint pikachu" (card name) → still counts as NM in practice,
 *     listings that mention "near mint" are overwhelmingly condition signals
 *   - "mint" standalone inside a set name ("Jungle Mint" etc.) → ignored
 *
 * When the inferrer can't decide confidently it returns
 *   { condition: null, confidence: 0 }
 * which the ingestion script treats as "keep the event, exclude from stats".
 */

export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export interface ConditionInference {
	condition: Condition | null;
	confidence: number;
	/** Phrase we matched on — useful for debugging false positives. */
	matchedPhrase?: string;
}

/** Snapshots exclude events below this confidence. */
export const MIN_SNAPSHOT_CONFIDENCE = 0.7;

/** Order matters: longer / more-specific phrases win over shorter ones. */
const CANONICAL_PHRASES: Array<{
	pattern: RegExp;
	condition: Condition;
	confidence: number;
}> = [
	// DMG (most specific first — "damaged" phrase needs negative guard applied below)
	{ pattern: /\bdamaged\b/i, condition: 'DMG', confidence: 0.95 },
	{ pattern: /\bpoor condition\b/i, condition: 'DMG', confidence: 0.9 },

	// HP — "Heavily Played" only. Bare "HP" is handled separately with
	// strict context because Pokémon titles print HP as hit points.
	{ pattern: /\bheavily[-\s]played\b/i, condition: 'HP', confidence: 0.95 },
	{ pattern: /\bheavy wear\b/i, condition: 'HP', confidence: 0.8 },
	{ pattern: /\bheavy play\b/i, condition: 'HP', confidence: 0.85 },

	// MP
	{ pattern: /\bmoderately[-\s]played\b/i, condition: 'MP', confidence: 0.95 },
	{ pattern: /\bmoderate wear\b/i, condition: 'MP', confidence: 0.8 },
	{ pattern: /\bmoderate play\b/i, condition: 'MP', confidence: 0.85 },
	{ pattern: /\bplayed condition\b/i, condition: 'MP', confidence: 0.75 },

	// LP
	{ pattern: /\blightly[-\s]played\b/i, condition: 'LP', confidence: 0.95 },
	{ pattern: /\blight wear\b/i, condition: 'LP', confidence: 0.8 },
	{ pattern: /\blight play\b/i, condition: 'LP', confidence: 0.85 },
	{ pattern: /\bminor wear\b/i, condition: 'LP', confidence: 0.8 },
	{ pattern: /\bminor(?:\s+edge)?\s+whitening\b/i, condition: 'LP', confidence: 0.75 },
	{ pattern: /\bvery good condition\b/i, condition: 'LP', confidence: 0.7 },

	// NM
	{ pattern: /\bnear[-\s]?mint\b/i, condition: 'NM', confidence: 0.95 },
	{ pattern: /\bpack fresh\b/i, condition: 'NM', confidence: 0.9 },
	{ pattern: /\bgem mint\b/i, condition: 'NM', confidence: 0.9 },
	{ pattern: /\bpristine\b/i, condition: 'NM', confidence: 0.85 },
	{ pattern: /\bmint condition\b/i, condition: 'NM', confidence: 0.85 },
	{ pattern: /\bexcellent condition\b/i, condition: 'NM', confidence: 0.7 },

	// Bare abbreviations (no context needed). HP is deliberately omitted —
	// "120 HP" in any basic-Pokémon title would misclassify.
	// DMG is safe (not a common acronym otherwise), LP/MP appear mostly as
	// condition tags in card listings.
	{ pattern: /\bDMG\b/i, condition: 'DMG', confidence: 0.85 },
	{ pattern: /\bNM\b/i, condition: 'NM', confidence: 0.8 },
	{ pattern: /\bLP\b/i, condition: 'LP', confidence: 0.75 },
	{ pattern: /\bMP\b/i, condition: 'MP', confidence: 0.75 }
];

/**
 * Negative guards — applied BEFORE canonical matching. If a title matches
 * one of these patterns, we remove the matched phrase from the title before
 * running condition detection. This eliminates "damaged box" → DMG, etc.
 */
const NEGATIVE_GUARDS: RegExp[] = [
	/\bdamaged\s+(?:box|case|sleeve|wrapper|package|packaging|envelope)\b/gi,
	/\b(?:box|case|sleeve|wrapper|package|packaging|envelope)\s+(?:is\s+)?damaged\b/gi,
	// "light/heavy shipping" isn't about the card
	/\b(?:light|heavy)\s+shipping\b/gi
];

/**
 * Abbreviation patterns that need condition CONTEXT to fire. Otherwise bare
 * "HP" in "Charizard 120 HP" would misclassify every basic Pokémon card.
 */
const CONTEXTUAL_ABBREVIATIONS: Array<{
	pattern: RegExp;
	condition: Condition;
	confidence: number;
}> = [
	// "Condition: NM" / "Cond: LP" / "Grade: MP"
	{ pattern: /\b(?:condition|cond|grade)\s*[:\-]\s*nm\b/i, condition: 'NM', confidence: 0.9 },
	{ pattern: /\b(?:condition|cond|grade)\s*[:\-]\s*lp\b/i, condition: 'LP', confidence: 0.9 },
	{ pattern: /\b(?:condition|cond|grade)\s*[:\-]\s*mp\b/i, condition: 'MP', confidence: 0.9 },
	{ pattern: /\b(?:condition|cond|grade)\s*[:\-]\s*hp\b/i, condition: 'HP', confidence: 0.9 },
	{ pattern: /\b(?:condition|cond|grade)\s*[:\-]\s*dmg\b/i, condition: 'DMG', confidence: 0.9 },

	// Slash-separated condition ranges pick the WORSE side (conservative)
	{ pattern: /\bnm\s*\/\s*m\b/i, condition: 'NM', confidence: 0.85 },
	{ pattern: /\bnm\s*\/\s*lp\b/i, condition: 'LP', confidence: 0.8 },
	{ pattern: /\blp\s*\/\s*mp\b/i, condition: 'MP', confidence: 0.8 },
	{ pattern: /\bmp\s*\/\s*hp\b/i, condition: 'HP', confidence: 0.8 },
	{ pattern: /\bhp\s*\/\s*dmg\b/i, condition: 'DMG', confidence: 0.8 },

	// Parenthetical: "(NM)" / "(LP)"
	{ pattern: /\(\s*nm\s*\)/i, condition: 'NM', confidence: 0.85 },
	{ pattern: /\(\s*lp\s*\)/i, condition: 'LP', confidence: 0.85 },
	{ pattern: /\(\s*mp\s*\)/i, condition: 'MP', confidence: 0.85 },
	{ pattern: /\(\s*hp\s*\)/i, condition: 'HP', confidence: 0.85 },
	{ pattern: /\(\s*dmg\s*\)/i, condition: 'DMG', confidence: 0.85 }
];

/**
 * Infer card condition from a free-text listing title or description.
 *
 * Returns `{ condition: null, confidence: 0 }` when no signal is found or
 * when the only signals hit false-positive filters.
 */
export function inferCondition(title: string): ConditionInference {
	if (!title || typeof title !== 'string') {
		return { condition: null, confidence: 0 };
	}

	// Step 1 — strip negative guards so packaging-damage doesn't leak into the
	// canonical matcher.
	let cleaned = title;
	for (const guard of NEGATIVE_GUARDS) {
		cleaned = cleaned.replace(guard, ' ');
	}

	// Step 2 — contextual abbreviations (highest precision).
	const abbrevMatch = firstMatch(cleaned, CONTEXTUAL_ABBREVIATIONS);
	if (abbrevMatch) return abbrevMatch;

	// Step 3 — canonical phrases. We want the highest-confidence match; if
	// multiple tiers hit (rare — e.g. "near mint excellent condition") the
	// first (longest canonical) wins because the list is ordered.
	const canonicalMatch = firstMatch(cleaned, CANONICAL_PHRASES);
	if (canonicalMatch) return canonicalMatch;

	return { condition: null, confidence: 0 };
}

function firstMatch(
	text: string,
	candidates: Array<{ pattern: RegExp; condition: Condition; confidence: number }>
): ConditionInference | null {
	// Collect all matches, then prefer the highest confidence. If two tie,
	// the earlier one in the list (more specific) wins.
	let best: ConditionInference | null = null;
	for (const c of candidates) {
		const m = text.match(c.pattern);
		if (!m) continue;
		if (!best || c.confidence > best.confidence) {
			best = {
				condition: c.condition,
				confidence: c.confidence,
				matchedPhrase: m[0]
			};
		}
	}
	return best;
}
