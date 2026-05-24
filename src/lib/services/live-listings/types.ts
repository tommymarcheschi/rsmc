/**
 * Live listings — the provider-agnostic contract.
 *
 * Trove's first-principle (project_live_listings_first_principle) says
 * active asking prices are first-class data alongside sold comps. The
 * source for that data is in flux — the official eBay Browse API path is
 * blocked (project_ebay_dev_rejected), so Sprint 2 builds against this
 * interface and ships a stub provider. When a real Path C source unblocks
 * (eBay re-apply, 130point partnership, Bright Data residential-proxy
 * scrape), it implements `LiveListingsProvider` and we swap by changing
 * the factory in `./index.ts` — no UI rework.
 *
 * Design choices baked in:
 * - Cents (not dollars) for `price_cents` so we never multiply floats.
 * - `marketplace` is a discriminated union so we can render per-source
 *   chips ("eBay" / "TCGPlayer") and route different click-throughs.
 * - `source` on the result is the actual provider that answered (`stub`,
 *   `ebay-browse`, `130point-scrape`, `brightdata:ebay`...) — useful in
 *   the UI to show "via 130point" honesty labels and in logs.
 * - All fields nullable that can plausibly be missing from a real feed.
 *   Don't over-promise structure the upstream may not provide.
 */

export type Marketplace = 'ebay' | 'tcgplayer' | 'mercari' | 'other';
export type BuyingOption = 'fixed_price' | 'auction' | 'best_offer';
export type ListingCondition = 'raw' | 'graded' | 'unknown';

export interface LiveListing {
	/** Listing title as the marketplace shows it. */
	title: string;
	/** Ask price in cents. For auctions, the current bid. */
	price_cents: number;
	/** Marketplace shipping cost in cents, if known. Null if not exposed. */
	shipping_cents: number | null;
	/** Raw vs graded; for graded, see `grader` + `grade` for specifics. */
	condition: ListingCondition;
	/** Grading service if condition === 'graded', else null. */
	grader: 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'TAG' | null;
	/** Numeric grade if condition === 'graded' and the title parsed cleanly. */
	grade: number | null;
	marketplace: Marketplace;
	buying_option: BuyingOption;
	/** Click-through to the listing. */
	listing_url: string;
	/** Thumbnail for the listing. Null if not available. */
	image_url: string | null;
	/** Auction end time as ISO. Null for fixed-price. */
	ends_at: string | null;
}

export interface LiveListingsResult {
	listings: LiveListing[];
	/** ISO timestamp the result was fetched. Drives "Last refreshed 5m ago". */
	fetched_at: string;
	/** Provider label for transparency in UI + logs. */
	source: string;
	/** What was actually searched, for debugging. */
	query: string;
	/** Best-effort low ask in cents across the returned listings. Null if empty. */
	lowest_ask_cents: number | null;
}

export interface FetchForCardOptions {
	card_id: string;
	/** Card name from the catalog — e.g. "Charizard". */
	name: string;
	/** Set name — e.g. "Base Set". */
	set_name: string;
	/** Card number within the set — e.g. "4/102". */
	card_number: string;
	/** When set, filter to only listings of this grader (e.g. PSA-only). */
	grader?: 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'TAG';
	/** When set, filter to only this grade (typically 10). */
	grade?: number;
	/** When set, only return raw (ungraded) listings. */
	raw_only?: boolean;
	/** Max listings to return. Default 20. */
	limit?: number;
}

export interface LiveListingsProvider {
	/** Provider name for logs + UI labels. */
	readonly name: string;
	/** Fetch active listings for a specific card. Best-effort: returns an empty
	 *  result rather than throwing on transient upstream failures so the page
	 *  still renders cached/stale data gracefully. */
	fetchForCard(opts: FetchForCardOptions): Promise<LiveListingsResult>;
}
