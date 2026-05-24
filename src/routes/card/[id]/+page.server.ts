import { getCard } from '$services/tcg-api';
import { getPokemon, getEvolutionChain } from '$services/pokeapi';
import { getCardPrices } from '$services/poketrace';
import { getGradedPrices, getGradingFees } from '$services/price-tracker';
import { cacheTcgPlayerPrices, getPriceHistoryFromCache } from '$services/price-cache';
import { supabase } from '$services/supabase';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { getCardSignal, getSimilarCards } from '$services/insights';
import { computeGradingROI, DEFAULT_TIER_BY_SERVICE } from '$services/grading-roi';
import { buildGradeLadders, type CohortRow } from '$services/grade-estimate';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { GradingService } from '$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const card = await getCard(params.id).catch(() => null);
	if (!card) throw error(404, 'Card not found');

	// Do NOT cache the HTML document. See src/routes/browse/+page.server.ts
	// for the full rationale — cached HTML referencing deleted immutable
	// JS hashes after a Vercel deploy silently breaks hydration.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	// Cache TCGPlayer prices to Supabase (fire-and-forget, once per day)
	if (card.tcgplayer?.prices) {
		cacheTcgPlayerPrices(card.id, card.tcgplayer).catch(() => {});
	}

	const dexNumber = card.nationalPokedexNumbers?.[0];
	const hasPokeTrace = !!process.env.POKETRACE_API_KEY;
	const hasPriceTracker = !!process.env.PRICE_TRACKER_API_KEY;

	// Only make fast, reliable calls — no scrapers (eBay/PSA always fail from Vercel)
	const [pokedexData, evolutionChain, priceHistory, poketracePrice, gradedPrices] =
		await Promise.all([
			dexNumber ? getPokemon(dexNumber) : Promise.resolve(null),
			dexNumber ? getEvolutionChain(dexNumber) : Promise.resolve(null),
			getPriceHistoryFromCache(params.id),
			hasPokeTrace ? getCardPrices(params.id) : Promise.resolve(null),
			hasPriceTracker ? getGradedPrices(params.id) : Promise.resolve([])
		]);

	// Pre-fetch whether this card is already in the user's collection /
	// watchlist so the page can show "In Collection" / "Watching" state
	// on initial render without needing JS. Errors are swallowed — if
	// Supabase is unreachable the buttons just show their default state.
	const [collectionRows, watchlistRows, conditionPriceRows, cardIndexRow, gradingFees] = await Promise.all([
		supabase.from('collection').select('id').eq('card_id', params.id).limit(1),
		supabase.from('watchlist').select('id').eq('card_id', params.id).limit(1),
		// Latest snapshot per condition. Small (≤5 rows per card) so we can
		// fetch and collapse in JS without a window function.
		supabase
			.from('condition_price_snapshots')
			.select('condition, median_cents, p25_cents, p75_cents, sample_count, snapshot_date')
			.eq('card_id', params.id)
			.order('snapshot_date', { ascending: false })
			.limit(50),
		// card_index row for market signals section
		supabase
			.from('card_index')
			.select(
				'rarity, set_release_date, raw_nm_price, raw_source, psa10_price, cgc10_price, tag10_price, ' +
					'psa10_delta, psa10_multiple, psa10_last_sold_at, psa_pop_total, psa_pop_10, psa_gem_rate, ' +
					'cgc_pop_total, cgc_pop_10, cgc_gem_rate, ' +
					'tag_pop_total, tag_pop_10, ' +
					'bgs_pop_total, bgs_pop_10, bgs_gem_rate, sgc_pop_total, sgc_pop_10, sgc_gem_rate, ' +
					'graded_prices_fetched_at, last_enriched_at'
			)
			.eq('card_id', params.id)
			.maybeSingle(),
		getGradingFees()
	]);
	const inCollection = !!collectionRows.data?.length;
	const onWatchlist = !!watchlistRows.data?.length;

	// Market signals: undervalued-finder context + precomputed grading ROI.
	// Best-effort — any failure shows "no data" in the UI rather than 500ing.
	const indexRow = cardIndexRow.data;
	const cardSignal = indexRow
		? await getCardSignal(
				params.id,
				indexRow.rarity,
				indexRow.set_release_date,
				indexRow.raw_nm_price,
				indexRow.psa10_price
		  ).catch(() => null)
		: null;

	const gradingROI = indexRow
		? computeGradingROI(
				{
					raw_nm_price: indexRow.raw_nm_price,
					psa10_price: indexRow.psa10_price,
					psa_gem_rate: indexRow.psa_gem_rate,
					psa_pop_total: indexRow.psa_pop_total
				},
				'PSA' as GradingService,
				DEFAULT_TIER_BY_SERVICE.PSA,
				gradingFees
		  )
		: null;

	// CGC ROI — same math, with CGC's grade-10 price + gem rate + pop. The
	// GradingROIInput field names say "psa_*" but the function is service-
	// generic: it computes premium = (gem_rate/100) × (grade10 − raw), which
	// works for any grader whose data we pass in. Surfaced on the card page
	// next to the PSA ROI block so users can compare grader profitability at
	// a glance without leaving the card view (Sprint-1 audit consolidation).
	const cgcRow = indexRow as unknown as {
		raw_nm_price: number | null;
		cgc10_price: number | null;
		cgc_gem_rate: number | null;
		cgc_pop_total: number | null;
	} | null;
	const cgcGradingROI =
		cgcRow && cgcRow.cgc10_price != null
			? computeGradingROI(
					{
						raw_nm_price: cgcRow.raw_nm_price,
						psa10_price: cgcRow.cgc10_price,
						psa_gem_rate: cgcRow.cgc_gem_rate,
						psa_pop_total: cgcRow.cgc_pop_total
					},
					'CGC' as GradingService,
					DEFAULT_TIER_BY_SERVICE.CGC,
					gradingFees
			  )
			: null;

	const similarCards = indexRow
		? await getSimilarCards(
				params.id,
				indexRow.rarity,
				indexRow.set_release_date,
				indexRow.psa10_price
		  ).catch(() => [])
		: [];

	// PSA 10 historical sales for the time-series list on card detail.
	// Newest first, capped at 30 — matches what PriceCharting surfaces.
	interface Psa10SaleRow { sold_at: string; price_cents: number; marketplace: string | null; }
	const psa10SalesRes = await supabase
		.from('psa10_sales')
		.select('sold_at, price_cents, marketplace')
		.eq('card_id', params.id)
		.order('sold_at', { ascending: false })
		.limit(30);
	const psa10Sales: Psa10SaleRow[] = (psa10SalesRes.data ?? []) as Psa10SaleRow[];

	// Separate read for the PriceCharting override URL so pre-migration-012
	// environments don't kill the whole market-signals block. Any error
	// (missing column, table unreachable) just yields null — the override
	// form still renders and still saves once the migration lands.
	let pcUrlOverride: string | null = null;
	try {
		const { data } = await supabase
			.from('card_index')
			.select('pc_url_override')
			.eq('card_id', params.id)
			.maybeSingle();
		pcUrlOverride = (data as { pc_url_override?: string | null } | null)?.pc_url_override ?? null;
	} catch {
		// migration 012 not applied yet
	}

	// Pillar #9 discovery scores. Separate, fault-isolated read so a
	// pre-migration-017 environment (columns absent) doesn't take down the
	// whole Market Signals block — exactly like the pcUrlOverride read above.
	// Honesty doctrine: a NULL axis stays NULL (rendered "—"), never a
	// fabricated neutral 50. ranking_confidence flags thin-data cards.
	let rankingScores: {
		score_value: number | null;
		score_scarcity: number | null;
		score_gem_difficulty: number | null;
		score_momentum: number | null;
		score_grade_roi: number | null;
		score_liquidity: number | null;
		ranking_confidence: string | null;
		ranked_at: string | null;
	} | null = null;
	try {
		const { data } = await supabase
			.from('card_index')
			.select(
				'score_value, score_scarcity, score_gem_difficulty, score_momentum, ' +
					'score_grade_roi, score_liquidity, ranking_confidence, ranked_at'
			)
			.eq('card_id', params.id)
			.maybeSingle();
		rankingScores = (data as typeof rankingScores) ?? null;
	} catch {
		// migration 017 not applied yet — panel stays hidden, page is fine
	}

	// TAG full-distribution columns land in migration 019. Best-effort and
	// isolated so the card page renders normally before it's applied (the
	// TAG ladder simply stays hidden until the column + crawl exist).
	let tagExtra: {
		tag_grades: Record<string, number> | null;
		tag_gem_rate: number | null;
		tag_set_name: string | null;
		tag_synced_at: string | null;
	} | null = null;
	try {
		const { data, error } = await supabase
			.from('card_index')
			.select('tag_grades, tag_gem_rate, tag_set_name, tag_synced_at')
			.eq('card_id', params.id)
			.maybeSingle();
		if (!error) tagExtra = (data as typeof tagExtra) ?? null;
	} catch {
		// migration 019 not applied yet — TAG ladder hidden, page is fine
	}

	// CGC + Beckett full-distribution columns land in migration 021. Same
	// isolated/best-effort pattern as tagExtra so the page renders before
	// it's applied (those ladders simply stay hidden until column + crawl).
	let cgcBgsExtra: {
		cgc_grades: Record<string, number> | null;
		cgc_synced_at: string | null;
		bgs_grades: Record<string, number> | null;
		bgs_synced_at: string | null;
	} | null = null;
	try {
		const { data, error } = await supabase
			.from('card_index')
			.select('cgc_grades, cgc_synced_at, bgs_grades, bgs_synced_at')
			.eq('card_id', params.id)
			.maybeSingle();
		if (!error) cgcBgsExtra = (data as typeof cgcBgsExtra) ?? null;
	} catch {
		// migration 021 not applied yet — CGC/BGS ladders hidden, page fine
	}

	// Real per-grade ladder (migration 020). Isolated + best-effort like
	// tagExtra above so the page renders normally before 020 is applied
	// (the per-grade ladder simply stays absent until the column +
	// re-scrape exist). Honesty doctrine: real cells only.
	let gradeLadder: Record<string, Record<string, number>> | null = null;
	let gradeLadderFetchedAt: string | null = null;
	try {
		const { data, error } = await supabase
			.from('card_index')
			.select('grade_ladder, grade_ladder_fetched_at')
			.eq('card_id', params.id)
			.maybeSingle();
		if (!error && data) {
			const d = data as { grade_ladder?: unknown; grade_ladder_fetched_at?: string | null };
			gradeLadder =
				(d.grade_ladder as Record<string, Record<string, number>> | null) ?? null;
			gradeLadderFetchedAt = d.grade_ladder_fetched_at ?? null;
		}
	} catch {
		// migration 020 not applied yet — per-grade ladder hidden, page fine
	}

	// Calibration cohort for the grade estimator: catalog rows that carry
	// a real PSA 10 + real raw, so the cross-grader 10 ratio (CGC10/PSA10,
	// TAG10/PSA10) and the raw→PSA10 multiple are learned from real pairs,
	// never a free constant. Only stable columns (pre-020 safe), tiny
	// projection, capped, fault-isolated — failure just means no estimates
	// (page unaffected). rarity/era bucket the curve shape.
	let estimatorCohort: CohortRow[] | null = null;
	try {
		const { data, error: cohortErr } = await supabase
			.from('card_index')
			.select('rarity, set_release_date, raw_nm_price, psa10_price, cgc10_price, tag10_price')
			.not('psa10_price', 'is', null)
			.not('raw_nm_price', 'is', null)
			.limit(6000);
		if (!cohortErr && data) estimatorCohort = data as unknown as CohortRow[];
	} catch {
		// best-effort — without the cohort the estimator only emits cells
		// it can anchor on this card's own real prices; page unaffected.
	}

	// Collapse to one row per condition, keeping the most recent. Missing
	// table (404 after a fresh deploy before migration 005 applies) returns
	// null data — we just show nothing, per honesty doctrine.
	const conditionPrices = collapseLatestPerCondition(conditionPriceRows.data ?? []);

	// Per-grade ladders (real cells + honest, real-anchored estimates).
	// Pure + fault-isolated — any failure just omits the section.
	const ir = indexRow as unknown as {
		rarity: string | null;
		set_release_date: string | null;
		raw_nm_price: number | null;
		psa10_price: number | null;
		cgc10_price: number | null;
		tag10_price: number | null;
	} | null;
	let gradeLadders: ReturnType<typeof buildGradeLadders> = [];
	try {
		gradeLadders = buildGradeLadders({
			rarity: ir?.rarity ?? null,
			setReleaseDate: ir?.set_release_date ?? null,
			rawNm: ir?.raw_nm_price ?? null,
			psa10: ir?.psa10_price ?? null,
			cgc10: ir?.cgc10_price ?? null,
			tag10: ir?.tag10_price ?? null,
			gradeLadder,
			cohort: estimatorCohort
		});
	} catch {
		gradeLadders = [];
	}

	return {
		card,
		pokedexData,
		evolutionChain,
		poketracePrice,
		gradedPrices,
		priceHistory,
		ebaySold: { query: '', listings: [], averagePrice: 0, medianPrice: 0, lowPrice: 0, highPrice: 0, totalSold: 0 },
		psaPop: null,
		conditionPrices,
		indexRow,
		tagExtra,
		cgcBgsExtra,
		gradeLadders,
		gradeLadderFetchedAt,
		cardSignal,
		gradingROI,
		cgcGradingROI,
		similarCards,
		psa10Sales,
		pcUrlOverride,
		rankingScores,
		inCollection,
		onWatchlist
	};
};

interface ConditionSnapshotRow {
	condition: string;
	median_cents: number;
	p25_cents: number;
	p75_cents: number;
	sample_count: number;
	snapshot_date: string;
}

function collapseLatestPerCondition(rows: ConditionSnapshotRow[]): ConditionSnapshotRow[] {
	const latest = new Map<string, ConditionSnapshotRow>();
	for (const r of rows) {
		const existing = latest.get(r.condition);
		if (!existing || r.snapshot_date > existing.snapshot_date) latest.set(r.condition, r);
	}
	const order = ['NM', 'LP', 'MP', 'HP', 'DMG'];
	return order
		.map((c) => latest.get(c))
		.filter((r): r is ConditionSnapshotRow => r != null);
}

/**
 * Form actions for "Add to Collection" and "Add to Watchlist".
 *
 * Declared as SvelteKit actions instead of client-side `fetch` calls so the
 * buttons work without any JavaScript — native `<form method="POST" action="?/…">`
 * submission falls through to these handlers, the Supabase insert runs on the
 * server, and the page re-renders with the new state. With JS, `use:enhance`
 * on the form upgrades this to an inline update (no full reload) while still
 * hitting the same action.
 */
export const actions: Actions = {
	addToCollection: async ({ params }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'collection', message: 'Missing card id' });

		// If the user already has this card at NM condition, bump the quantity
		// instead of creating a duplicate row. Matches the /api/collection POST
		// handler so the two paths behave identically.
		const { data: existing } = await supabase
			.from('collection')
			.select('id, quantity')
			.eq('card_id', cardId)
			.eq('condition', 'NM')
			.maybeSingle();

		if (existing) {
			const { error: err } = await supabase
				.from('collection')
				.update({ quantity: existing.quantity + 1 })
				.eq('id', existing.id);
			if (err) return fail(500, { action: 'collection', message: err.message });
			return { action: 'collection', success: true, bumped: true };
		}

		const { error: err } = await supabase
			.from('collection')
			.insert({ card_id: cardId, quantity: 1, condition: 'NM' });
		if (err) return fail(500, { action: 'collection', message: err.message });
		return { action: 'collection', success: true };
	},

	savePcOverride: async ({ request, params }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'pcOverride', message: 'Missing card id' });

		const form = await request.formData();
		const raw = (form.get('pc_url') ?? '').toString().trim();
		const value = raw === '' ? null : raw;

		// Light validation so we don't persist garbage. A null clears the
		// override and re-enables fuzzy matching.
		if (value != null && !/^https?:\/\/www\.pricecharting\.com\/game\//i.test(value)) {
			return fail(400, {
				action: 'pcOverride',
				message: 'URL must start with https://www.pricecharting.com/game/'
			});
		}

		// card_index writes are service-role-only (migration 018) — see the
		// refreshNow note. Anon UPDATE here would silently affect 0 rows
		// and falsely report the override saved.
		if (!supabaseAdmin) {
			return fail(500, {
				action: 'pcOverride',
				message: 'Saving the override is not configured on this server (missing service-role key).'
			});
		}
		const { data: updated, error: err } = await supabaseAdmin
			.from('card_index')
			.update({ pc_url_override: value })
			.eq('card_id', cardId)
			.select('card_id');
		if (err) return fail(500, { action: 'pcOverride', message: err.message });
		if (!updated || updated.length === 0) {
			return fail(500, {
				action: 'pcOverride',
				message: 'Override could not be saved (no row updated).'
			});
		}
		return { action: 'pcOverride', success: true, cleared: value == null };
	},

	// Pillar #7 — "Refresh now". A user-triggered live pull: the page
	// shows cached data + its age, and this spends one on-demand scrape
	// when the user asks. Routes through the canonical /api/pricecharting
	// endpoint (it owns the scrape + Cloudflare handling + cache) so there
	// is zero scrape-logic duplication here. Honesty doctrine: only real
	// scraped values are written, a transient miss never clobbers good
	// cached data with null, and timestamps move only on a real success.
	refreshNow: async ({ params, fetch }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'refresh', message: 'Missing card id' });

		const { data: idRow } = await supabase
			.from('card_index')
			.select('name, set_name, card_number')
			.eq('card_id', cardId)
			.maybeSingle();
		const idc = idRow as { name?: string; set_name?: string; card_number?: string } | null;

		let name = idc?.name ?? '';
		let setName = idc?.set_name ?? '';
		let cardNumber = idc?.card_number ?? '';
		if (!name) {
			const card = await getCard(cardId).catch(() => null);
			if (!card) return fail(404, { action: 'refresh', message: 'Card not found' });
			name = card.name;
			setName = card.set?.name ?? '';
			cardNumber = card.number ?? '';
		}

		const qs = new URLSearchParams({ name });
		if (setName) qs.set('set', setName);
		if (cardNumber) qs.set('number', cardNumber);

		let pc: {
			ungraded: number | null;
			psa10: number | null;
			cgc10: number | null;
			tag10: number | null;
			psaPop: { total: number; grade10: number; gemRate: number } | null;
			cgcPop: { total: number; grade10: number; gemRate: number } | null;
			psa10LastSold: string | null;
			psa10Sales: Array<{ sold_at: string; price: number; marketplace: string | null }>;
			gradeLadder?: Record<string, Record<string, number>> | null;
		} | null = null;
		try {
			const res = await fetch(`/api/pricecharting?${qs}`);
			if (res.ok) pc = await res.json();
		} catch {
			pc = null;
		}

		if (!pc) {
			return fail(502, {
				action: 'refresh',
				message: 'Live data source is unavailable right now — still showing cached data.'
			});
		}

		const now = new Date().toISOString();
		// Build the update from real values only. A field absent from this
		// scrape is left as-is so a transient PriceCharting miss can't erase
		// a previously-good value. Timestamps only advance on success.
		const upd: Record<string, unknown> = {
			graded_prices_fetched_at: now,
			last_enriched_at: now
		};
		if (pc.ungraded != null) {
			upd.raw_nm_price = pc.ungraded;
			upd.raw_source = 'pricecharting';
			upd.raw_fetched_at = now;
		}
		if (pc.psa10 != null) {
			upd.psa10_price = pc.psa10;
			upd.psa10_source = 'pricecharting';
		}
		if (pc.cgc10 != null) {
			upd.cgc10_price = pc.cgc10;
			upd.cgc10_source = 'pricecharting';
		}
		if (pc.tag10 != null) {
			upd.tag10_price = pc.tag10;
			upd.tag10_source = 'pricecharting';
		}
		if (pc.psaPop) {
			upd.psa_pop_total = pc.psaPop.total;
			upd.psa_pop_10 = pc.psaPop.grade10;
			upd.psa_gem_rate = pc.psaPop.gemRate;
			upd.psa_fetched_at = now;
		}
		if (pc.cgcPop) {
			upd.cgc_pop_total = pc.cgcPop.total;
			upd.cgc_pop_10 = pc.cgcPop.grade10;
			upd.cgc_gem_rate = pc.cgcPop.gemRate;
			upd.cgc_fetched_at = now;
		}
		// Real per-grade ladder (migration 020). Only written when the
		// scrape actually returned graded cells — a transient miss never
		// clobbers a previously-good ladder with null/empty.
		if (pc.gradeLadder && Object.keys(pc.gradeLadder).length > 0) {
			upd.grade_ladder = pc.gradeLadder;
			upd.grade_ladder_fetched_at = now;
		}
		if (pc.psa10LastSold != null) upd.psa10_last_sold_at = pc.psa10LastSold;

		// migration 018 made card_index writes service-role-only (anon =
		// SELECT only). The browser/SSR `supabase` client is anon, so an
		// UPDATE through it is RLS-filtered to ZERO rows and returns NO
		// error — the action would report success while persisting nothing
		// (the silent "Refresh now did nothing" bug). Use the server-only
		// privileged client and verify a row actually changed.
		if (!supabaseAdmin) {
			return fail(500, {
				action: 'refresh',
				message:
					'Live refresh is not configured on this server (missing SUPABASE_SERVICE_ROLE_KEY) — cached data unchanged.'
			});
		}

		const { data: updated, error: err } = await supabaseAdmin
			.from('card_index')
			.update(upd)
			.eq('card_id', cardId)
			.select('card_id');
		if (err) return fail(500, { action: 'refresh', message: err.message });
		if (!updated || updated.length === 0) {
			return fail(500, {
				action: 'refresh',
				message: 'Refresh could not be saved (no row updated) — still showing cached data.'
			});
		}

		if (pc.psa10Sales?.length) {
			await supabaseAdmin
				.from('psa10_sales')
				.upsert(
					pc.psa10Sales.map((s) => ({
						card_id: cardId,
						sold_at: s.sold_at,
						price_cents: Math.round(s.price * 100),
						marketplace: s.marketplace
					})),
					{ onConflict: 'card_id,sold_at,price_cents', ignoreDuplicates: true }
				)
				.then(
					() => {},
					() => {}
				);
		}

		return { action: 'refresh', success: true, refreshedAt: now };
	},

	addToWatchlist: async ({ params }) => {
		const cardId = params.id;
		if (!cardId) return fail(400, { action: 'watchlist', message: 'Missing card id' });

		// watchlist has a unique (card_id) constraint; detect the duplicate and
		// return a success regardless so the user sees "Watching" either way.
		const { data: existing } = await supabase
			.from('watchlist')
			.select('id')
			.eq('card_id', cardId)
			.maybeSingle();

		if (existing) {
			return { action: 'watchlist', success: true, alreadyWatching: true };
		}

		const { error: err } = await supabase
			.from('watchlist')
			.insert({ card_id: cardId });
		if (err) return fail(500, { action: 'watchlist', message: err.message });
		return { action: 'watchlist', success: true };
	}
};
