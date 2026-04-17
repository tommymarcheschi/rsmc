/**
 * Hunt-mode DSL parser (Tier 3.11)
 *
 * Converts a single-line query like
 *   `pikachu pop:<100 year:2010-2016 rarity:holo price:10-50 psa10`
 * into the set of URL params the existing hunt-mode loader already
 * understands. Returns `params` (to merge into a URLSearchParams) plus
 * `errors` (to surface back to the user for the unrecognized bits).
 *
 * Grammar is intentionally forgiving — field names are case-insensitive,
 * values accept `<N`, `>N`, `<=N`, `>=N`, `A-B` ranges, and bare values.
 * Anything that doesn't parse as a field:value or bareword operator is
 * treated as a name-search term and joined with spaces.
 */

export type HuntDslField =
	| 'pop'
	| 'year'
	| 'price'
	| 'raw'
	| 'rarity'
	| 'set'
	| 'name';

export interface HuntDslResult {
	/** URL params to apply. Keys match the hunt-mode loader: q, set, pop_lt, before, after, raw_lt, raw_gt, variants, require_psa10, rarity. */
	params: Record<string, string>;
	/** Raw terms that didn't match any known field — use to surface "I didn't understand X" back to the user. */
	errors: string[];
}

const FIELD_ALIASES: Record<string, HuntDslField> = {
	pop: 'pop',
	population: 'pop',
	year: 'year',
	date: 'year',
	price: 'price',
	raw: 'raw',
	rarity: 'rarity',
	rare: 'rarity',
	set: 'set',
	name: 'name'
};

// Boolean/flag tokens that map to fixed params.
const FLAG_TOKENS: Record<string, Record<string, string>> = {
	psa10: { require_psa10: '1' },
	'has:psa10': { require_psa10: '1' },
	holo: { variants: 'holo' },
	reverse: { variants: 'reverse' },
	'reverse-holo': { variants: 'reverse' }
};

/**
 * Tokenize the input respecting double-quoted strings as a single token.
 * `rarity:"Rare Holo" pikachu` → ['rarity:Rare Holo', 'pikachu'].
 */
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	const re = /"([^"]*)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input)) !== null) {
		tokens.push(m[1] ?? m[2]);
	}
	return tokens;
}

interface NumericBounds {
	min?: number;
	max?: number;
	/** True if the user used `<` / `>` (strictly exclusive). Stored for the caller so they can map to `lt` vs `lte` semantics. */
	exclusive?: boolean;
}

/**
 * Parse a value expression into numeric bounds.
 *   "<100" → {max: 100, exclusive: true}
 *   "<=50" → {max: 50}
 *   ">20"  → {min: 20, exclusive: true}
 *   "10-50" → {min: 10, max: 50}
 *   "42"   → {min: 42, max: 42}
 * Returns null if nothing parseable.
 */
function parseNumericBounds(raw: string): NumericBounds | null {
	const s = raw.replace(/[$,\s]/g, '');
	if (!s) return null;

	const lte = s.match(/^<=([\d.]+)$/);
	if (lte) return { max: Number(lte[1]) };
	const gte = s.match(/^>=([\d.]+)$/);
	if (gte) return { min: Number(gte[1]) };
	const lt = s.match(/^<([\d.]+)$/);
	if (lt) return { max: Number(lt[1]), exclusive: true };
	const gt = s.match(/^>([\d.]+)$/);
	if (gt) return { min: Number(gt[1]), exclusive: true };

	const range = s.match(/^([\d.]+)-([\d.]+)$/);
	if (range) {
		const a = Number(range[1]);
		const b = Number(range[2]);
		return { min: Math.min(a, b), max: Math.max(a, b) };
	}

	const single = s.match(/^([\d.]+)$/);
	if (single) {
		const n = Number(single[1]);
		return { min: n, max: n };
	}

	return null;
}

export function parseHuntDSL(input: string): HuntDslResult {
	const params: Record<string, string> = {};
	const errors: string[] = [];
	const nameTerms: string[] = [];
	const variants = new Set<string>();

	for (const rawToken of tokenize(input)) {
		const lower = rawToken.toLowerCase();

		if (FLAG_TOKENS[lower]) {
			for (const [k, v] of Object.entries(FLAG_TOKENS[lower])) {
				if (k === 'variants') variants.add(v);
				else params[k] = v;
			}
			continue;
		}

		const colonIdx = rawToken.indexOf(':');
		if (colonIdx === -1) {
			nameTerms.push(rawToken);
			continue;
		}

		const fieldRaw = rawToken.slice(0, colonIdx).toLowerCase();
		const value = rawToken.slice(colonIdx + 1);
		const field = FIELD_ALIASES[fieldRaw];

		if (!field) {
			errors.push(rawToken);
			continue;
		}

		switch (field) {
			case 'pop': {
				const b = parseNumericBounds(value);
				if (!b || b.max == null) {
					errors.push(rawToken);
					break;
				}
				// card_index query uses combined_pop_total lt-strict on pop_lt.
				// Interpret exclusive and inclusive the same for simplicity: the
				// "max pop" field has always meant < ceiling.
				params.pop_lt = String(Math.ceil(b.max));
				break;
			}
			case 'year': {
				const b = parseNumericBounds(value);
				if (!b) {
					errors.push(rawToken);
					break;
				}
				if (b.min != null) params.after = String(Math.floor(b.min));
				if (b.max != null) params.before = String(Math.floor(b.max) + 1);
				break;
			}
			case 'price':
			case 'raw': {
				const b = parseNumericBounds(value);
				if (!b) {
					errors.push(rawToken);
					break;
				}
				if (b.min != null) params.raw_gt = String(b.min);
				if (b.max != null) params.raw_lt = String(b.max);
				break;
			}
			case 'rarity': {
				if (value) params.rarity_like = value;
				break;
			}
			case 'set': {
				if (value) params.set = value;
				break;
			}
			case 'name': {
				if (value) nameTerms.push(value);
				break;
			}
		}
	}

	if (nameTerms.length) params.q = nameTerms.join(' ');
	if (variants.size) params.variants = [...variants].join(',');

	return { params, errors };
}
