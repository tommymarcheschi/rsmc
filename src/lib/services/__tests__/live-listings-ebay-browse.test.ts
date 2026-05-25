import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ebayBrowseProvider, __ebayBrowseInternals } from '../live-listings/ebay-browse';

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL_PREFIX = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

type FetchInput = string | URL | Request;
interface MockResponse {
	ok: boolean;
	status?: number;
	json: () => Promise<unknown>;
}

function urlStr(input: FetchInput): string {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

function makeFetch(handler: (url: string, init?: RequestInit) => MockResponse) {
	return vi.fn(async (input: FetchInput, init?: RequestInit) =>
		handler(urlStr(input), init) as unknown as Response
	);
}

const baseOpts = {
	card_id: 'base1-4',
	name: 'Charizard',
	set_name: 'Base Set',
	card_number: '4/102'
};

describe('ebayBrowseProvider — fail-safe', () => {
	beforeEach(() => {
		__ebayBrowseInternals.resetCaches();
		delete process.env.EBAY_CLIENT_ID;
		delete process.env.EBAY_CLIENT_SECRET;
	});

	it('returns an empty result (does not throw) when EBAY_CLIENT_ID is missing', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
			throw new Error('should not be called');
		});

		const res = await ebayBrowseProvider.fetchForCard(baseOpts);
		expect(res.listings).toEqual([]);
		expect(res.source).toBe('ebay-browse');
		expect(res.lowest_ask_cents).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();

		fetchSpy.mockRestore();
	});

	it('returns an empty result on token-endpoint 401', async () => {
		process.env.EBAY_CLIENT_ID = 'id';
		process.env.EBAY_CLIENT_SECRET = 'secret';
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(
				makeFetch(() => ({ ok: false, status: 401, json: async () => ({}) }))
			);

		const res = await ebayBrowseProvider.fetchForCard(baseOpts);
		expect(res.listings).toEqual([]);
		expect(res.lowest_ask_cents).toBeNull();

		fetchSpy.mockRestore();
	});

	it('returns an empty result when search throws (network failure)', async () => {
		process.env.EBAY_CLIENT_ID = 'id';
		process.env.EBAY_CLIENT_SECRET = 'secret';
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (url: FetchInput) => {
				if (url === TOKEN_URL) {
					return {
						ok: true,
						json: async () => ({ access_token: 'tok', expires_in: 7200 })
					} as Response;
				}
				throw new Error('socket reset');
			});

		const res = await ebayBrowseProvider.fetchForCard(baseOpts);
		expect(res.listings).toEqual([]);

		fetchSpy.mockRestore();
	});
});

describe('ebayBrowseProvider — happy path', () => {
	beforeEach(() => {
		__ebayBrowseInternals.resetCaches();
		process.env.EBAY_CLIENT_ID = 'id';
		process.env.EBAY_CLIENT_SECRET = 'secret';
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('maps item summaries, sorts ascending by price, and reports the low ask', async () => {
		const items = [
			{
				title: 'PSA 10 Charizard Base Set 4/102 1999',
				price: { value: '950.00' },
				shippingOptions: [{ shippingCost: { value: '5.00' } }],
				condition: 'Used',
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/1',
				image: { imageUrl: 'https://i.ebayimg.com/1.jpg' }
			},
			{
				title: 'CGC 9.5 Charizard Base 4',
				price: { value: '720.00' },
				shippingOptions: [],
				condition: 'Used',
				buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
				itemWebUrl: 'https://www.ebay.com/itm/2',
				image: { imageUrl: 'https://i.ebayimg.com/2.jpg' }
			},
			{
				title: 'Charizard Base Set 4/102 Raw NM',
				price: { value: '300.00' },
				shippingOptions: [{ shippingCost: { value: '0' } }],
				condition: 'Used',
				buyingOptions: ['AUCTION'],
				itemWebUrl: 'https://www.ebay.com/itm/3',
				image: { imageUrl: 'https://i.ebayimg.com/3.jpg' },
				itemEndDate: '2026-05-30T18:00:00.000Z'
			}
		];

		let capturedUrl = '';
		let capturedHeaders: Record<string, string> = {};
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			async (input: FetchInput, init?: RequestInit) => {
				const url = urlStr(input);
				if (url === TOKEN_URL) {
					return {
						ok: true,
						json: async () => ({ access_token: 'tok', expires_in: 7200 })
					} as Response;
				}
				if (typeof url === 'string' && url.startsWith(SEARCH_URL_PREFIX)) {
					capturedUrl = url;
					capturedHeaders = (init?.headers as Record<string, string>) ?? {};
					return {
						ok: true,
						json: async () => ({ itemSummaries: items })
					} as Response;
				}
				throw new Error(`unexpected fetch ${String(url)}`);
			}
		);

		const res = await ebayBrowseProvider.fetchForCard(baseOpts);

		expect(capturedHeaders['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_US');
		expect(capturedHeaders.Authorization).toBe('Bearer tok');
		const params = new URLSearchParams(capturedUrl.split('?')[1]);
		expect(params.get('q')).toBe('Charizard Base Set 4/102');
		expect(params.get('category_ids')).toBe('183454');
		expect(params.get('sort')).toBe('price');
		expect(params.get('filter')).toContain('buyingOptions:{FIXED_PRICE|AUCTION}');

		expect(res.source).toBe('ebay-browse');
		expect(res.listings).toHaveLength(3);
		expect(res.listings.map((l) => l.price_cents)).toEqual([30000, 72000, 95000]);
		expect(res.lowest_ask_cents).toBe(30000);

		const psa10 = res.listings.find((l) => l.grader === 'PSA');
		expect(psa10).toBeDefined();
		expect(psa10?.grade).toBe(10);
		expect(psa10?.condition).toBe('graded');
		expect(psa10?.shipping_cents).toBe(500);

		const cgc = res.listings.find((l) => l.grader === 'CGC');
		expect(cgc?.grade).toBe(9.5);
		expect(cgc?.buying_option).toBe('best_offer');

		const auction = res.listings.find((l) => l.buying_option === 'auction');
		expect(auction?.ends_at).toBe('2026-05-30T18:00:00.000Z');
		expect(auction?.condition).toBe('raw');
		expect(auction?.grader).toBeNull();
	});

	it('filters by grader + grade when requested', async () => {
		const items = [
			{
				title: 'PSA 10 Charizard Base 4',
				price: { value: '900.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/a'
			},
			{
				title: 'PSA 9 Charizard Base 4',
				price: { value: '400.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/b'
			},
			{
				title: 'CGC 10 Charizard Base 4',
				price: { value: '700.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/c'
			},
			{
				title: 'Charizard Base 4 Raw',
				price: { value: '250.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/d'
			}
		];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: FetchInput) => {
			const url = urlStr(input);
			if (url === TOKEN_URL) {
				return {
					ok: true,
					json: async () => ({ access_token: 'tok', expires_in: 7200 })
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ itemSummaries: items })
			} as Response;
		});

		const res = await ebayBrowseProvider.fetchForCard({
			...baseOpts,
			grader: 'PSA',
			grade: 10
		});
		expect(res.listings).toHaveLength(1);
		expect(res.listings[0].grader).toBe('PSA');
		expect(res.listings[0].grade).toBe(10);
	});

	it('filters to raw-only when raw_only is set', async () => {
		const items = [
			{
				title: 'PSA 10 Charizard Base 4',
				price: { value: '900.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/a'
			},
			{
				title: 'Charizard Base 4 Raw NM',
				price: { value: '300.00' },
				buyingOptions: ['FIXED_PRICE'],
				itemWebUrl: 'https://www.ebay.com/itm/b'
			}
		];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: FetchInput) => {
			const url = urlStr(input);
			if (url === TOKEN_URL) {
				return {
					ok: true,
					json: async () => ({ access_token: 'tok', expires_in: 7200 })
				} as Response;
			}
			return { ok: true, json: async () => ({ itemSummaries: items }) } as Response;
		});

		const res = await ebayBrowseProvider.fetchForCard({ ...baseOpts, raw_only: true });
		expect(res.listings).toHaveLength(1);
		expect(res.listings[0].condition).toBe('raw');
	});

	it('caches by card key — second call within TTL does not re-hit the search endpoint', async () => {
		const fetchImpl = vi.fn(async (input: FetchInput) => {
			const url = urlStr(input);
			if (url === TOKEN_URL) {
				return {
					ok: true,
					json: async () => ({ access_token: 'tok', expires_in: 7200 })
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({
					itemSummaries: [
						{
							title: 'Charizard',
							price: { value: '100' },
							buyingOptions: ['FIXED_PRICE'],
							itemWebUrl: 'https://www.ebay.com/itm/x'
						}
					]
				})
			} as Response;
		});
		vi.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);

		await ebayBrowseProvider.fetchForCard(baseOpts);
		await ebayBrowseProvider.fetchForCard(baseOpts);

		const searchCalls = fetchImpl.mock.calls.filter(([u]) =>
			typeof u === 'string' && u.startsWith(SEARCH_URL_PREFIX)
		);
		expect(searchCalls).toHaveLength(1);
	});
});
