/**
 * Trove — GemRate set alias map (Track A)
 *
 * GemRate's set naming is idiosyncratic and does NOT match pokemontcg.io
 * (our tracked_sets). The verified anchor: our `base1` ("Base", 1999) is
 * GemRate's `set_name="Pokemon Game"`, `year=1999`, `category=tcg-cards`.
 *
 * A WRONG alias is worse than a missing one — it silently writes another
 * set's population onto our cards, which breaks the honesty doctrine. So
 * this module only *proposes* (set_name, year) candidates; the crawler
 * validates every fetch against our own card_index for that set and
 * refuses to upsert on mismatch. That makes heuristic guessing safe:
 * a bad guess is rejected at the gate, never persisted.
 *
 * Curated overrides are the source of truth where GemRate's name can't be
 * derived. Everything else falls back to ordered heuristic candidates,
 * each gated by validation. Add a verified mapping to OVERRIDES whenever a
 * set's heuristics all fail (the crawler logs these as "needs alias").
 */

export interface GemrateTarget {
	setName: string;
	year: number;
	category: 'tcg-cards';
}

/**
 * set_id -> verified GemRate target. Only put entries here that have been
 * confirmed against a real fetch. `base1` is verified (2026-05-18:
 * Charizard-Holo #4 g10=488, total=99129 — matches project_gemrate_source).
 */
const OVERRIDES: Record<string, GemrateTarget> = {
	base1: { setName: 'Pokemon Game', year: 1999, category: 'tcg-cards' }
};

const stripDiacritics = (s: string) =>
	s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Year from an ISO release_date (YYYY-MM-DD) or YYYY/MM/DD. */
export function yearOf(releaseDate: string): number {
	const m = releaseDate.match(/(\d{4})/);
	return m ? parseInt(m[1], 10) : NaN;
}

/**
 * Ordered GemRate (set_name, year) candidates for a tracked set. The
 * crawler tries them in order and keeps the first that passes validation.
 * The curated override (if any) is always tried first.
 */
export function gemrateCandidates(set: {
	set_id: string;
	set_name: string;
	release_date: string;
}): GemrateTarget[] {
	const out: GemrateTarget[] = [];
	const seen = new Set<string>();
	const push = (setName: string, year: number) => {
		const name = setName.trim().replace(/\s+/g, ' ');
		if (!name || !Number.isFinite(year)) return;
		const key = `${name.toLowerCase()}|${year}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ setName: name, year, category: 'tcg-cards' });
	};

	const override = OVERRIDES[set.set_id];
	if (override) push(override.setName, override.year);

	const year = yearOf(set.release_date);
	const base = stripDiacritics(set.set_name).trim();
	const noPkmn = base.replace(/^pok[eé]mon\s+/i, '').trim();

	// GemRate Pokémon TCG sets are usually the set name with a "Pokemon "
	// prefix, sometimes the bare name, occasionally "<Name> TCG".
	push(`Pokemon ${noPkmn}`, year);
	push(base, year);
	push(noPkmn, year);
	push(`Pokemon ${base}`, year);
	push(`${noPkmn} TCG`, year);

	return out;
}

export function hasOverride(setId: string): boolean {
	return setId in OVERRIDES;
}
