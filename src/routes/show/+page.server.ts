/**
 * /show — the card-show search-engine page.
 *
 * Standalone, stripped-down lookup surface (project_show_mode_page).
 * One job: type a name, see the matching cards, click the right one,
 * land on the existing /card/[id] for the full data. Designed for the
 * card-show failure modes — bad WiFi, one-handed phone, glare.
 *
 * The actual rendering is in +page.svelte and the layout-skip is in
 * src/routes/+layout.svelte (STANDALONE_PATHS). This loader stays
 * lightweight: a single ILIKE on card_index, capped, value-sorted so
 * the most expensive matches surface first (vendors usually care about
 * the big cards). Optional low-ask join from live_listings_cache only
 * for the rows we're actually rendering — keeps the round-trip count
 * down.
 */

import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';

const RESULT_LIMIT = 30;

interface IndexRow {
	card_id: string;
	name: string;
	set_name: string | null;
	card_number: string | null;
	image_small_url: string | null;
	rarity: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
}

interface CacheRow {
	card_id: string;
	lowest_ask_cents: number | null;
	provider: string;
	fetched_at: string;
}

export interface ShowResult {
	card_id: string;
	name: string;
	set_name: string;
	card_number: string;
	image_small_url: string | null;
	rarity: string | null;
	raw_nm_price: number | null;
	psa10_price: number | null;
	lowest_ask_cents: number | null;
	low_ask_is_sample: boolean;
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Same posture as the rest of the app — never let Vercel cache the
	// HTML shell (deploys would otherwise serve dead JS hashes). See the
	// /browse loader for the full rationale.
	setHeaders({ 'cache-control': 'private, no-cache, must-revalidate' });

	const q = (url.searchParams.get('q') ?? '').trim();

	if (!q) {
		return {
			q,
			results: [] as ShowResult[],
			truncated: false,
			limit: RESULT_LIMIT
		};
	}

	// Plain ILIKE name match — the show-floor user wants speed and
	// predictability, not a fancy DSL. Sort by PSA 10 price desc so the
	// "big cards" surface first when a name is ambiguous (e.g. "charizard"
	// → Base Set Charizard before Neo Genesis Charizard); fall back to
	// raw_nm so cards without a graded comp still rank. Stable tiebreak
	// keeps pagination predictable if we ever add it.
	const { data: rows } = await supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, card_number, image_small_url, rarity, raw_nm_price, psa10_price'
		)
		.ilike('name', `%${q}%`)
		.order('psa10_price', { ascending: false, nullsFirst: false })
		.order('raw_nm_price', { ascending: false, nullsFirst: false })
		.order('card_id', { ascending: true })
		.limit(RESULT_LIMIT + 1)
		.returns<IndexRow[]>();

	const truncated = (rows?.length ?? 0) > RESULT_LIMIT;
	const matched = (rows ?? []).slice(0, RESULT_LIMIT);

	// Pull low-ask cents for just these card_ids in one round-trip. Anon
	// SELECT on live_listings_cache works (migration 022). We only need
	// rows tied to the current results; this is small and cheap.
	const cardIds = matched.map((r) => r.card_id);
	let cacheByCardId = new Map<string, CacheRow>();
	if (cardIds.length > 0) {
		const { data: cacheRows } = await supabase
			.from('live_listings_cache')
			.select('card_id, lowest_ask_cents, provider, fetched_at')
			.in('card_id', cardIds)
			.eq('query_key', 'all')
			.returns<CacheRow[]>();
		for (const c of cacheRows ?? []) cacheByCardId.set(c.card_id, c);
	}

	const results: ShowResult[] = matched.map((r) => {
		const cache = cacheByCardId.get(r.card_id);
		return {
			card_id: r.card_id,
			name: r.name,
			set_name: r.set_name ?? '',
			card_number: r.card_number ?? '',
			image_small_url: r.image_small_url,
			rarity: r.rarity,
			raw_nm_price: r.raw_nm_price,
			psa10_price: r.psa10_price,
			lowest_ask_cents: cache?.lowest_ask_cents ?? null,
			low_ask_is_sample: cache?.provider === 'stub'
		};
	});

	return {
		q,
		results,
		truncated,
		limit: RESULT_LIMIT
	};
};
