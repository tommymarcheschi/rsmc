import { describe, expect, it } from 'vitest';
import { pcGradedFields } from '../enrich-graded-fields';
import type { PriceChartingData } from '../pricecharting-scraper';

const NOW = '2026-05-19T12:00:00.000Z';

function mk(overrides: Partial<PriceChartingData>): PriceChartingData {
	return {
		ungraded: 10,
		psa10: 500,
		cgc10: 300,
		bgs10: 350,
		tag10: 250,
		allTiers: {},
		gradeLadder: { psa: { '9': 100, '10': 500 } },
		psaPop: { grades: [], total: 1000, grade10: 50, gemRate: 5 },
		cgcPop: { grades: [], total: 200, grade10: 20, gemRate: 10 },
		psa10LastSold: '2026-05-01',
		psa10Sales: [],
		pcUrl: 'https://www.pricecharting.com/game/x',
		// productName etc. are unused by the helper; cast covers the rest.
		...overrides
	} as unknown as PriceChartingData;
}

describe('pcGradedFields — no-clobber contract', () => {
	it('returns {} for a failed/transient scrape (pc == null)', () => {
		// THE data-loss guard: a Cloudflare miss must touch ZERO graded
		// columns so the upsert preserves previously-good values.
		expect(pcGradedFields(null, NOW)).toEqual({});
	});

	it('emits every graded field when the scrape returned everything', () => {
		const f = pcGradedFields(mk({}), NOW);
		expect(f).toMatchObject({
			graded_prices_fetched_at: NOW,
			psa10_price: 500,
			psa10_source: 'pricecharting',
			tag10_price: 250,
			tag10_source: 'pricecharting',
			cgc10_price: 300,
			cgc10_source: 'pricecharting',
			grade_ladder: { psa: { '9': 100, '10': 500 } },
			grade_ladder_fetched_at: NOW,
			psa10_last_sold_at: '2026-05-01',
			psa_pop_total: 1000,
			psa_pop_10: 50,
			psa_gem_rate: 5,
			psa_fetched_at: NOW,
			cgc_pop_total: 200,
			cgc_pop_10: 20,
			cgc_gem_rate: 10,
			cgc_fetched_at: NOW
		});
	});

	it('OMITS the key (never null) when a value is absent — the actual contract', () => {
		// pc reached but this card has no PSA10 market: psa10 keys must be
		// ABSENT (so ON CONFLICT UPDATE leaves the stored psa10 untouched),
		// while graded_prices_fetched_at still advances (we did check).
		const f = pcGradedFields(mk({ psa10: null, psa10LastSold: null }), NOW);
		expect(f).not.toHaveProperty('psa10_price');
		expect(f).not.toHaveProperty('psa10_source');
		expect(f).not.toHaveProperty('psa10_last_sold_at');
		expect(f.graded_prices_fetched_at).toBe(NOW);
		// unrelated present values are still emitted
		expect(f.cgc10_price).toBe(300);
	});

	it('omits grade_ladder when the ladder is empty', () => {
		const f = pcGradedFields(mk({ gradeLadder: {} }), NOW);
		expect(f).not.toHaveProperty('grade_ladder');
		expect(f).not.toHaveProperty('grade_ladder_fetched_at');
	});

	it('emits each pop block independently', () => {
		const f = pcGradedFields(mk({ cgcPop: null }), NOW);
		expect(f.psa_pop_total).toBe(1000);
		expect(f).not.toHaveProperty('cgc_pop_total');
		expect(f).not.toHaveProperty('cgc_fetched_at');
	});
});
