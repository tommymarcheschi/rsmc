import { describe, expect, it } from 'vitest';
import {
	inferCondition,
	MIN_SNAPSHOT_CONFIDENCE,
	type Condition,
	type ConditionInference
} from '../condition-detector';

// ─── Canonical TCGPlayer phrasing ──────────────────────────────────────────
describe('canonical TCGPlayer phrases', () => {
	const tcgCases: Array<[string, Condition]> = [
		['Charizard Base Set — Near Mint', 'NM'],
		['Pikachu Illustrator Lightly Played', 'LP'],
		['Blastoise 1st Edition Moderately Played', 'MP'],
		['Venusaur Shadowless Heavily Played', 'HP'],
		['Gyarados 1999 Damaged', 'DMG']
	];

	for (const [title, expected] of tcgCases) {
		it(`${expected} ← "${title}"`, () => {
			const out = inferCondition(title);
			expect(out.condition).toBe(expected);
			expect(out.confidence).toBeGreaterThanOrEqual(0.9);
		});
	}
});

// ─── eBay free-text descriptions ───────────────────────────────────────────
describe('eBay descriptive phrasing', () => {
	const cases: Array<[string, Condition, number]> = [
		['pack fresh charizard base set holo', 'NM', 0.9],
		['excellent condition mewtwo base set', 'NM', 0.7],
		['mint condition jolteon jungle set', 'NM', 0.85],
		['pristine blastoise shadowless', 'NM', 0.85],
		['minor whitening on edges', 'LP', 0.75],
		['light wear on corners, still great', 'LP', 0.8],
		['very good condition with some edge wear', 'LP', 0.7],
		['moderate wear on edges', 'MP', 0.8],
		['played condition, some scratches', 'MP', 0.75],
		['heavy wear, still playable', 'HP', 0.8],
		['card is damaged, crease on surface', 'DMG', 0.9]
	];

	for (const [title, expected, minConf] of cases) {
		it(`${expected} ← "${title}"`, () => {
			const out = inferCondition(title);
			expect(out.condition).toBe(expected);
			expect(out.confidence).toBeGreaterThanOrEqual(minConf);
		});
	}
});

// ─── Contextual abbreviations ──────────────────────────────────────────────
describe('condition-context abbreviations', () => {
	const cases: Array<[string, Condition]> = [
		['Charizard Base Set Condition: NM', 'NM'],
		['Pikachu Jungle cond: LP', 'LP'],
		['Venusaur Base Grade: MP', 'MP'],
		['Blastoise Condition - HP', 'HP'],
		['Gyarados 1st Ed Condition: DMG', 'DMG'],
		['Charizard (NM) Unlimited', 'NM'],
		['Mewtwo Base (LP)', 'LP'],
		['Raichu Jungle (MP)', 'MP']
	];

	for (const [title, expected] of cases) {
		it(`${expected} ← "${title}"`, () => {
			const out = inferCondition(title);
			expect(out.condition).toBe(expected);
			expect(out.confidence).toBeGreaterThanOrEqual(0.85);
		});
	}

	it('NM/LP range → conservative LP', () => {
		expect(inferCondition('Charizard Holo NM/LP').condition).toBe('LP');
	});

	it('MP/HP range → conservative HP', () => {
		expect(inferCondition('Venusaur 1st Ed MP/HP').condition).toBe('HP');
	});
});

// ─── False-positive traps ──────────────────────────────────────────────────
describe('false positive filters', () => {
	it('"Charizard 120 HP" (hit points) should NOT be HP condition', () => {
		const out = inferCondition('Charizard Base Set Holo 120 HP #4 Unlimited');
		expect(out.condition).not.toBe('HP');
	});

	it('"damaged box" → card condition is NOT DMG', () => {
		const out = inferCondition('Charizard Box Set SEALED - damaged box, card is NM');
		// It should match NM (card condition) rather than DMG (box)
		expect(out.condition).toBe('NM');
	});

	it('"box is damaged" → card condition is NOT DMG', () => {
		const out = inferCondition('Pikachu plush — box is damaged but card lightly played');
		expect(out.condition).toBe('LP');
	});

	it('"damaged sleeve" → not DMG', () => {
		const out = inferCondition('Blastoise — damaged sleeve, card near mint');
		expect(out.condition).toBe('NM');
	});

	it('"heavy shipping" → not HP', () => {
		const out = inferCondition('Rare card — heavy shipping fees');
		// No actual condition signal, should return null
		expect(out.condition).toBe(null);
	});

	it('card named "Mint" inside set name does not auto-trigger NM', () => {
		// Only "mint condition" / "gem mint" / "near mint" / "pack fresh" /
		// "pristine" should fire NM. Standalone "Mint" as a word in a
		// set/product name shouldn't.
		const out = inferCondition('Pokemon Jungle Mint Pack Opening Video');
		// We don't match bare "mint" — so null here.
		expect(out.condition).toBe(null);
	});
});

// ─── Nulls / empties / garbage ─────────────────────────────────────────────
describe('inconclusive inputs', () => {
	const nullCases = [
		'',
		'   ',
		'Charizard Base Set Holo 1999',
		'Pokemon card for sale',
		'Rare vintage holo'
	];

	for (const title of nullCases) {
		it(`null ← "${title}"`, () => {
			const out = inferCondition(title);
			expect(out.condition).toBe(null);
			expect(out.confidence).toBe(0);
		});
	}

	it('non-string input returns null safely', () => {
		// @ts-expect-error intentionally wrong type
		expect(inferCondition(null).condition).toBe(null);
		// @ts-expect-error intentionally wrong type
		expect(inferCondition(undefined).condition).toBe(null);
	});
});

// ─── Accuracy benchmark on hand-labeled corpus ─────────────────────────────
// Target from the roadmap: >95% accuracy on 100 hand-labeled titles.
// This mixed corpus mimics real TCGPlayer + eBay surface forms.
describe('benchmark: hand-labeled 100-title corpus', () => {
	const corpus: Array<[string, Condition | null]> = [
		// ─── NM (25) ───
		['Charizard Base Set Holo Near Mint', 'NM'],
		['Pikachu Illustrator NEAR MINT', 'NM'],
		['Blastoise Near-Mint 1st Edition', 'NM'],
		['Mewtwo Base Unlimited - Near Mint', 'NM'],
		['Venusaur Shadowless, Near Mint Condition', 'NM'],
		['Gyarados Base Pack Fresh', 'NM'],
		['Raichu Jungle pristine condition', 'NM'],
		['Alakazam Base Gem Mint copy', 'NM'],
		['Machamp 1st Ed Mint Condition', 'NM'],
		['Zapdos Fossil - excellent condition', 'NM'],
		['Articuno Fossil Near Mint Holo', 'NM'],
		['Moltres Fossil NM', 'NM'],
		['Dragonite Fossil Condition: NM', 'NM'],
		['Clefairy Base (NM)', 'NM'],
		['Nidoking Base NM/M', 'NM'],
		['Poliwrath Base Near Mint 1999 WOTC', 'NM'],
		['Chansey Base NEAR MINT holo PSA worthy', 'NM'],
		['Hitmonchan Base - pack fresh, straight from booster', 'NM'],
		['Magneton Fossil pristine', 'NM'],
		['Electabuzz Base near mint condition', 'NM'],
		['Scyther Jungle - excellent condition, centered', 'NM'],
		['Flareon Jungle Holo NM', 'NM'],
		['Vaporeon Jungle (NM)', 'NM'],
		['Jolteon Jungle Near Mint straight out of pack', 'NM'],
		['Snorlax Jungle Gem Mint Candidate', 'NM'],

		// ─── LP (20) ───
		['Charizard Base Lightly Played', 'LP'],
		['Blastoise Shadowless LIGHTLY PLAYED', 'LP'],
		['Venusaur Base Lightly-Played', 'LP'],
		['Mewtwo Base light wear on corners', 'LP'],
		['Pikachu Illustrator - minor wear', 'LP'],
		['Gyarados 1st Ed minor whitening', 'LP'],
		['Dragonite Fossil LP', 'LP'],
		['Machamp 1st Ed (LP)', 'LP'],
		['Alakazam Base cond: LP', 'LP'],
		['Ninetales Base very good condition', 'LP'],
		['Raichu Jungle NM/LP', 'LP'],
		['Scyther Jungle - light play', 'LP'],
		['Electabuzz Base Lightly Played', 'LP'],
		['Hitmonchan Base Lightly Played holo', 'LP'],
		['Zapdos Fossil Condition - LP', 'LP'],
		['Articuno Fossil minor edge whitening', 'LP'],
		['Moltres Fossil - light wear, centered', 'LP'],
		['Snorlax Jungle Lightly Played 1st edition', 'LP'],
		['Flareon Jungle very good condition overall', 'LP'],
		['Vaporeon Jungle minor wear on back', 'LP'],

		// ─── MP (20) ───
		['Charizard Base Moderately Played', 'MP'],
		['Blastoise Base MODERATELY PLAYED', 'MP'],
		['Venusaur Shadowless - moderate wear', 'MP'],
		['Mewtwo Base played condition', 'MP'],
		['Pikachu Illustrator moderate wear on corners', 'MP'],
		['Gyarados Base Moderately-Played', 'MP'],
		['Dragonite Fossil MP', 'MP'],
		['Machamp 1st Ed (MP)', 'MP'],
		['Alakazam Base Cond: MP', 'MP'],
		['Raichu Jungle LP/MP', 'MP'],
		['Scyther Jungle moderate play', 'MP'],
		['Electabuzz Base Moderately Played holo', 'MP'],
		['Hitmonchan Base played condition 1st ed', 'MP'],
		['Zapdos Fossil Grade: MP', 'MP'],
		['Articuno Fossil moderate wear on edges', 'MP'],
		['Moltres Fossil - played condition overall', 'MP'],
		['Snorlax Jungle Moderately Played 1st ed', 'MP'],
		['Flareon Jungle - moderate wear on back', 'MP'],
		['Vaporeon Jungle played condition', 'MP'],
		['Jolteon Jungle Moderately Played', 'MP'],

		// ─── HP (15) ───
		['Charizard Base Heavily Played', 'HP'],
		['Blastoise Base HEAVILY PLAYED', 'HP'],
		['Venusaur Base - heavy wear', 'HP'],
		['Mewtwo Base Heavily-Played', 'HP'],
		['Gyarados Base Heavy Play wear visible', 'HP'],
		['Dragonite Fossil - heavy wear on edges', 'HP'],
		['Machamp 1st Ed Condition: HP', 'HP'],
		['Alakazam Base (HP)', 'HP'],
		['Raichu Jungle MP/HP', 'HP'],
		['Scyther Jungle Heavily Played', 'HP'],
		['Electabuzz Base heavy wear holo', 'HP'],
		['Zapdos Fossil Heavily Played', 'HP'],
		['Snorlax Jungle HEAVY WEAR visible', 'HP'],
		['Flareon Jungle Heavily Played', 'HP'],
		['Vaporeon Jungle heavy play, creases', 'HP'],

		// ─── DMG (10) ───
		['Charizard Base Damaged', 'DMG'],
		['Blastoise Base - poor condition, tear', 'DMG'],
		['Venusaur Base DAMAGED crease', 'DMG'],
		['Mewtwo Base Damaged with bent corner', 'DMG'],
		['Gyarados Base - damaged, water spots', 'DMG'],
		['Dragonite Fossil DMG', 'DMG'],
		['Machamp 1st Ed (DMG)', 'DMG'],
		['Alakazam Base Condition: DMG', 'DMG'],
		['Raichu Jungle HP/DMG', 'DMG'],
		['Scyther Jungle damaged surface crease', 'DMG'],

		// ─── False-positive traps (10) → expect null ───
		['Charizard 120 HP Base Set Unlimited', null],
		['Pikachu 40 HP Jungle 1st Edition', null],
		['Blastoise 100 HP Base Set Shadowless', null],
		['Damaged box but unopened pack', null], // "damaged box" stripped, no other signal
		['Mewtwo 60 HP Base Set', null],
		['Pokemon Card Lot — buy now', null],
		['Vintage Holo Rare 1999 WOTC', null],
		['Pokemon Jungle Booster Pack sealed', null],
		['Snorlax Jungle 90 HP 1st edition', null],
		['Raichu Jungle 60 HP holo rare', null]
	];

	it('corpus is exactly 100 titles', () => {
		expect(corpus.length).toBe(100);
	});

	it('achieves ≥95% accuracy', () => {
		let correct = 0;
		const failures: Array<{ title: string; expected: Condition | null; got: ConditionInference }> =
			[];
		for (const [title, expected] of corpus) {
			const got = inferCondition(title);
			if (got.condition === expected) {
				correct++;
			} else {
				failures.push({ title, expected, got });
			}
		}
		const accuracy = correct / corpus.length;
		// Include failure diagnostics in the assertion message so CI output is useful
		if (accuracy < 0.95) {
			console.error('Failures:', failures);
		}
		expect(accuracy).toBeGreaterThanOrEqual(0.95);
	});
});

// ─── Snapshot filter threshold is actually usable ──────────────────────────
describe('MIN_SNAPSHOT_CONFIDENCE sanity', () => {
	it('threshold accepts canonical matches', () => {
		expect(inferCondition('Near Mint Charizard').confidence).toBeGreaterThanOrEqual(
			MIN_SNAPSHOT_CONFIDENCE
		);
	});

	it('threshold rejects silent nulls', () => {
		expect(inferCondition('Charizard Base Set Holo').confidence).toBeLessThan(
			MIN_SNAPSHOT_CONFIDENCE
		);
	});
});
