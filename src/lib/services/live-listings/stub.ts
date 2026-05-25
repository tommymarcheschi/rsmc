/**
 * Stub live-listings provider — deterministic fake data for dev / demo.
 *
 * Used while the real path-C source is being decided / implemented
 * (project_ebay_dev_rejected). The UI MUST render this with a "Sample
 * data" label so users don't mistake it for real market prices (honesty
 * doctrine, feedback_multipliers_vs_real_data).
 *
 * Deterministic: hashes the card_id + name to seed the count + price
 * spread so the same card always shows the same stub listings across
 * reloads. That avoids the "every refresh re-rolls fake numbers" look
 * which screams placeholder, and makes the demo feel like real data.
 */

import type {
	LiveListingsProvider,
	FetchForCardOptions,
	LiveListingsResult,
	LiveListing,
	BuyingOption
} from './types';

function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return Math.abs(h);
}

function pseudoRand(seed: number, n: number): number {
	// Mulberry32 — small, deterministic, no dependency.
	let t = (seed + n * 0x6d2b79f5) | 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const STUB_MARKETPLACES: Array<{ name: 'ebay' | 'tcgplayer' | 'mercari'; share: number }> = [
	{ name: 'ebay', share: 0.6 },
	{ name: 'tcgplayer', share: 0.25 },
	{ name: 'mercari', share: 0.15 }
];

function pickMarketplace(roll: number) {
	let acc = 0;
	for (const m of STUB_MARKETPLACES) {
		acc += m.share;
		if (roll < acc) return m.name;
	}
	return STUB_MARKETPLACES[0].name;
}

export const stubProvider: LiveListingsProvider = {
	name: 'stub',

	async fetchForCard(opts: FetchForCardOptions): Promise<LiveListingsResult> {
		const seed = hash(`${opts.card_id}|${opts.name}|${opts.grader ?? ''}|${opts.grade ?? ''}`);
		const limit = Math.min(opts.limit ?? 8, 20);

		// 3–8 listings per card by default. Cards with low seed get fewer
		// (mirrors thin-market reality where rare cards have few asks).
		const count = 3 + (seed % 6);
		const actualCount = Math.min(count, limit);

		// Base price anchor — would come from the catalog row in reality.
		// 5–500 with a long-ish tail.
		const basePrice = 500 + (seed % 50000);
		const isGradedQuery = opts.grader != null;
		// Graded listings cost a multiple of raw.
		const gradedMult = isGradedQuery ? 4 + ((seed >> 4) % 10) : 1;

		const listings: LiveListing[] = [];
		for (let i = 0; i < actualCount; i++) {
			const r1 = pseudoRand(seed, i * 7 + 1);
			const r2 = pseudoRand(seed, i * 7 + 2);
			const r3 = pseudoRand(seed, i * 7 + 3);
			const r4 = pseudoRand(seed, i * 7 + 4);

			// Spread ±35% around the base, sorted asc by price.
			const variance = 0.65 + r1 * 0.7;
			const price = Math.round(basePrice * gradedMult * variance);
			const shipping = r2 < 0.3 ? 0 : Math.round(300 + r2 * 700);
			const buying: BuyingOption =
				r3 < 0.7 ? 'fixed_price' : r3 < 0.85 ? 'best_offer' : 'auction';
			const marketplace = pickMarketplace(r4);

			const titleGrader = opts.grader ? `${opts.grader} ${opts.grade ?? 10} ` : '';
			const titleRaw = opts.grader ? '' : ['NM', 'LP', 'MP'][i % 3] + ' ';
			const title = `${titleGrader}${titleRaw}${opts.name} ${opts.set_name} ${opts.card_number}`.trim();

			listings.push({
				title,
				price_cents: price,
				shipping_cents: shipping,
				condition: opts.grader ? 'graded' : 'raw',
				grader: opts.grader ?? null,
				grade: opts.grader ? opts.grade ?? 10 : null,
				marketplace,
				buying_option: buying,
				// Stub listings link nowhere — explicit "javascript:void(0)" would
				// trigger CSP issues + look broken; just point them at the search
				// page for the marketplace so a click is at least useful.
				listing_url:
					marketplace === 'ebay'
						? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(opts.name + ' ' + opts.set_name)}`
						: marketplace === 'tcgplayer'
							? `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(opts.name)}`
							: `https://www.mercari.com/search/?keyword=${encodeURIComponent(opts.name)}`,
				image_url: null,
				ends_at: buying === 'auction' ? new Date(Date.now() + (1 + i) * 86_400_000).toISOString() : null
			});
		}

		listings.sort((a, b) => a.price_cents - b.price_cents);

		return {
			listings,
			fetched_at: new Date().toISOString(),
			source: 'stub',
			query: `${opts.name} ${opts.set_name} ${opts.card_number}`.trim(),
			lowest_ask_cents: listings.length > 0 ? listings[0].price_cents : null
		};
	}
};
