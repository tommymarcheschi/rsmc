import { getSets, getCardsBySet } from '$services/tcg-api';
import { supabase } from '$services/supabase';
import { getSetValueTracker } from '$services/insights';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const selectedSetId = url.searchParams.get('set') ?? '';

	// Load all sets, collection entries, and market-value rollup in parallel
	const [sets, collectionRes, setValue] = await Promise.all([
		getSets().catch(() => []),
		supabase.from('collection').select('card_id, quantity'),
		getSetValueTracker().catch(() => ({ rows: [], totalSets: 0, totalCards: 0 }))
	]);

	const collection = collectionRes.data ?? [];

	// Build a map of owned card IDs with quantities
	const ownedCards = new Map<string, number>();
	for (const entry of collection) {
		ownedCards.set(entry.card_id, (ownedCards.get(entry.card_id) ?? 0) + entry.quantity);
	}

	// Calculate completion for each set the user has cards from
	const ownedSetIds = new Set<string>();
	for (const cardId of ownedCards.keys()) {
		const setId = cardId.split('-')[0];
		ownedSetIds.add(setId);
	}

	interface SetProgress {
		id: string;
		name: string;
		series: string;
		total: number;
		owned: number;
		pct: number;
		releaseDate: string;
		logo: string;
		symbol: string;
	}

	const setProgress: SetProgress[] = [];
	for (const s of sets) {
		const owned = collection.filter(
			(e) => e.card_id.startsWith(s.id + '-')
		).length;
		if (owned > 0 || s.id === selectedSetId) {
			setProgress.push({
				id: s.id,
				name: s.name,
				series: s.series,
				total: s.total,
				owned,
				pct: s.total > 0 ? Math.round((owned / s.total) * 100) : 0,
				releaseDate: s.releaseDate,
				logo: s.images.logo,
				symbol: s.images.symbol
			});
		}
	}
	setProgress.sort((a, b) => b.pct - a.pct || b.owned - a.owned);

	// If a set is selected, fetch all cards in that set and mark owned/missing
	interface SetCard {
		id: string;
		name: string;
		number: string;
		rarity: string;
		imageSmall: string;
		owned: boolean;
		quantity: number;
		marketPrice: number;
	}

	let selectedSet: { name: string; total: number; owned: number; cards: SetCard[] } | null = null;

	if (selectedSetId) {
		try {
			const result = await getCardsBySet(selectedSetId, 1, 250);
			const cards: SetCard[] = result.data.map((card) => {
				let marketPrice = 0;
				if (card.tcgplayer?.prices) {
					for (const variant of Object.values(card.tcgplayer.prices)) {
						if (variant.market) { marketPrice = variant.market; break; }
						if (variant.mid) { marketPrice = variant.mid; break; }
					}
				}
				return {
					id: card.id,
					name: card.name,
					number: card.number,
					rarity: card.rarity ?? 'Unknown',
					imageSmall: card.images.small,
					owned: ownedCards.has(card.id),
					quantity: ownedCards.get(card.id) ?? 0,
					marketPrice
				};
			});

			// Sort by card number numerically
			cards.sort((a, b) => {
				const numA = parseInt(a.number) || 999;
				const numB = parseInt(b.number) || 999;
				return numA - numB;
			});

			const setInfo = sets.find((s) => s.id === selectedSetId);
			selectedSet = {
				name: setInfo?.name ?? selectedSetId,
				total: cards.length,
				owned: cards.filter((c) => c.owned).length,
				cards
			};
		} catch {
			// Failed to load set cards
		}
	}

	// Build a "Market" ranking of tracked sets by expected grading ROI,
	// merging in collection-completion info so users can see at a glance
	// how much of each set they own.
	const ownedCountBySet = new Map<string, number>();
	for (const [cardId] of ownedCards) {
		const setId = cardId.split('-')[0];
		ownedCountBySet.set(setId, (ownedCountBySet.get(setId) ?? 0) + 1);
	}
	const setMetaById = new Map<string, { name: string; series: string; total: number; releaseDate: string; logo: string; symbol: string }>();
	for (const s of sets) {
		setMetaById.set(s.id, {
			name: s.name,
			series: s.series,
			total: s.total,
			releaseDate: s.releaseDate,
			logo: s.images.logo,
			symbol: s.images.symbol
		});
	}

	const marketSets = setValue.rows.slice(0, 30).map((r) => {
		const meta = setMetaById.get(r.set_id);
		const owned = ownedCountBySet.get(r.set_id) ?? 0;
		const releaseYear = (meta?.releaseDate ?? '')
			.split(/[-/]/)[0];
		return {
			id: r.set_id,
			name: r.set_name,
			releaseYear,
			series: meta?.series ?? '',
			symbol: meta?.symbol ?? '',
			total: meta?.total ?? r.indexed_cards,
			indexedCards: r.indexed_cards,
			raw_basis: r.raw_basis,
			psa10_ceiling: r.psa10_ceiling,
			avg_gem_rate: r.avg_gem_rate,
			expected_roi: r.expected_roi,
			positive_roi_cards: r.positive_roi_cards,
			confident_cards: r.confident_cards,
			owned
		};
	});

	return {
		sets: sets.slice(0, 50), // Limit for the set picker
		setProgress,
		selectedSet,
		selectedSetId,
		marketSets
	};
};
