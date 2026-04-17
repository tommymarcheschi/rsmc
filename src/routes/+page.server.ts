import { supabase } from '$services/supabase';
import { getCard } from '$services/tcg-api';
import { getCachedPricesForCards } from '$services/price-cache';
import { getPsa10Momentum } from '$services/insights';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	// Do NOT cache the HTML document. See src/routes/browse/+page.server.ts
	// for the full rationale — cached HTML referencing deleted immutable
	// JS hashes after a Vercel deploy silently breaks hydration.
	setHeaders({
		'cache-control': 'private, no-cache, must-revalidate'
	});

	const [collectionRes, watchlistRes, gradingRes, momentum] = await Promise.all([
		supabase.from('collection').select('*'),
		supabase.from('watchlist').select('*'),
		supabase.from('grading').select('*').neq('status', 'complete'),
		getPsa10Momentum(5).catch(() => ({ rising: [], cooling: [], cardsAnalyzed: 0 }))
	]);

	const collection = collectionRes.data ?? [];
	const watchlist = watchlistRes.data ?? [];
	const grading = gradingRes.data ?? [];

	// Triggered watchlist alerts — same shape as /watchlist computes.
	// Pulled here so the dashboard can surface the count + top rows
	// without duplicating the logic.
	interface WatchRow { id: string; card_id: string; target_price: number | null; alert_enabled: boolean; }
	const watchRows = watchlist as WatchRow[];
	const watchIds = watchRows.filter((w) => w.alert_enabled && w.target_price != null).map((w) => w.card_id);
	const pricesByCard = new Map<string, number>();
	const cardMetaById = new Map<string, { name: string; image: string | null }>();
	if (watchIds.length > 0) {
		const { data: idxRows } = await supabase
			.from('card_index')
			.select('card_id, name, image_small_url, raw_nm_price')
			.in('card_id', watchIds);
		for (const r of (idxRows ?? []) as Array<{
			card_id: string;
			name: string;
			image_small_url: string | null;
			raw_nm_price: number | null;
		}>) {
			if (r.raw_nm_price != null) pricesByCard.set(r.card_id, r.raw_nm_price);
			cardMetaById.set(r.card_id, { name: r.name, image: r.image_small_url });
		}
	}
	interface TriggeredAlert {
		id: string;
		card_id: string;
		name: string;
		image: string | null;
		current: number;
		target: number;
		delta_pct: number;
	}
	const triggeredAlerts: TriggeredAlert[] = [];
	for (const w of watchRows) {
		if (!w.alert_enabled || w.target_price == null) continue;
		const current = pricesByCard.get(w.card_id);
		if (current == null || current > w.target_price) continue;
		const meta = cardMetaById.get(w.card_id);
		triggeredAlerts.push({
			id: w.id,
			card_id: w.card_id,
			name: meta?.name ?? w.card_id,
			image: meta?.image ?? null,
			current,
			target: w.target_price,
			delta_pct: w.target_price > 0 ? ((current - w.target_price) / w.target_price) * 100 : 0
		});
	}
	triggeredAlerts.sort((a, b) => a.delta_pct - b.delta_pct); // biggest dips first

	const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);
	const uniqueSets = new Set(collection.map((e) => e.card_id.split('-')[0])).size;
	const totalInvested = collection.reduce(
		(sum, e) => sum + (e.purchase_price ?? 0) * e.quantity,
		0
	);

	let portfolioValue = 0;
	let topHoldings: { card_id: string; name: string; quantity: number; marketPrice: number; totalValue: number; imageUrl: string; gainLoss: number }[] = [];

	if (collection.length > 0) {
		const uniqueCardIds = [...new Set(collection.map((e: { card_id: string }) => e.card_id))].slice(0, 20);

		// Get cached prices + fetch card metadata in one pass
		const [cachedPrices, ...cardResults] = await Promise.all([
			getCachedPricesForCards(uniqueCardIds),
			...uniqueCardIds.map((id) => getCard(id).catch(() => null))
		]);

		const cardMap = new Map<string, { name: string; marketPrice: number; imageUrl: string }>();

		for (const card of cardResults) {
			if (!card) continue;
			let marketPrice = (cachedPrices as Map<string, number>).get(card.id) ?? 0;
			if (marketPrice === 0 && card.tcgplayer?.prices) {
				for (const variant of Object.values(card.tcgplayer.prices)) {
					if (variant.market) { marketPrice = variant.market; break; }
					if (variant.mid) { marketPrice = variant.mid; break; }
				}
			}
			cardMap.set(card.id, { name: card.name, marketPrice, imageUrl: card.images.small });
		}

		for (const entry of collection) {
			const card = cardMap.get(entry.card_id);
			if (!card) continue;
			const totalValue = card.marketPrice * entry.quantity;
			portfolioValue += totalValue;
			const costBasis = (entry.purchase_price ?? 0) * entry.quantity;
			topHoldings.push({
				card_id: entry.card_id,
				name: card.name,
				quantity: entry.quantity,
				marketPrice: card.marketPrice,
				totalValue,
				imageUrl: card.imageUrl,
				gainLoss: totalValue - costBasis
			});
		}

		topHoldings.sort((a, b) => b.totalValue - a.totalValue);
		topHoldings = topHoldings.slice(0, 5);
	}

	const gainLoss = portfolioValue - totalInvested;
	const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

	return {
		stats: {
			totalCards,
			uniqueSets,
			totalInvested,
			portfolioValue,
			gainLoss,
			gainLossPct,
			watchlistCount: watchlist.length,
			gradingPending: grading.length
		},
		attention: {
			triggeredAlerts: triggeredAlerts.slice(0, 5),
			triggeredAlertsTotal: triggeredAlerts.length,
			rising: momentum.rising.slice(0, 3)
		},
		topHoldings,
		recentCollection: collection.slice(0, 5)
	};
};
