/**
 * Analytics Engine — Value scoring, comp analysis, trend detection
 *
 * Uses TCG API market prices (embedded in card objects) to analyze:
 * - Undervalued cards (low price relative to rarity/set age)
 * - Price comparisons across printings of the same Pokémon
 * - Market trend signals from price data
 */

import type { PokemonCard } from '$types';

// ─── Value Scoring ───────────────────────────────────────────────

export interface ValueScore {
	card: PokemonCard;
	score: number; // 0-100 — higher = more undervalued
	marketPrice: number;
	factors: ValueFactor[];
	signal: 'undervalued' | 'fair' | 'overvalued';
}

export interface ValueFactor {
	name: string;
	impact: number; // -50 to +50
	description: string;
}

// Rarity tiers by expected value range
const RARITY_WEIGHT: Record<string, number> = {
	'Illustration Rare': 90,
	'Special Art Rare': 90,
	'Hyper Rare': 85,
	'Secret Rare': 80,
	'Ultra Rare': 70,
	'Double Rare': 60,
	'Rare Holo VMAX': 65,
	'Rare Holo VSTAR': 60,
	'Rare Holo V': 50,
	'Rare Holo GX': 55,
	'Rare Holo EX': 55,
	'Rare Holo': 40,
	'Rare': 25,
	'Uncommon': 10,
	'Common': 5
};

function getMarketPrice(card: PokemonCard): number {
	if (!card.tcgplayer?.prices) return 0;
	const prices = card.tcgplayer.prices;
	// Check variant types in priority order
	for (const variant of Object.values(prices)) {
		if (variant.market) return variant.market;
		if (variant.mid) return variant.mid;
	}
	return 0;
}

function getSetAgeDays(card: PokemonCard): number {
	if (!card.set?.releaseDate) return 0;
	const release = new Date(card.set.releaseDate);
	return Math.max(0, (Date.now() - release.getTime()) / (1000 * 60 * 60 * 24));
}

export function scoreCardValue(card: PokemonCard): ValueScore {
	const marketPrice = getMarketPrice(card);
	const factors: ValueFactor[] = [];
	let score = 50; // Start neutral

	// Factor 1: Rarity tier vs price
	const rarityWeight = RARITY_WEIGHT[card.rarity ?? ''] ?? 15;
	const expectedMinPrice = rarityWeight * 0.15; // rough $ floor
	if (marketPrice > 0 && marketPrice < expectedMinPrice) {
		const impact = Math.min(25, Math.round((expectedMinPrice - marketPrice) / expectedMinPrice * 25));
		score += impact;
		factors.push({
			name: 'Below rarity floor',
			impact,
			description: `${card.rarity} cards typically trade above $${expectedMinPrice.toFixed(2)}`
		});
	} else if (marketPrice > expectedMinPrice * 3 && rarityWeight < 50) {
		const impact = -Math.min(15, Math.round((marketPrice - expectedMinPrice * 3) / marketPrice * 15));
		score += impact;
		factors.push({
			name: 'Premium over rarity',
			impact,
			description: `Priced well above typical ${card.rarity} range`
		});
	}

	// Factor 2: Set age — older cards with low prices may be undervalued
	const ageDays = getSetAgeDays(card);
	if (ageDays > 365 * 2 && marketPrice > 0 && marketPrice < 5 && rarityWeight >= 40) {
		const impact = Math.min(20, Math.round(ageDays / 365));
		score += impact;
		factors.push({
			name: 'Vintage discount',
			impact,
			description: `${Math.round(ageDays / 365)}+ year old ${card.rarity} at low price`
		});
	}

	// Factor 3: Set print run (use total cards as proxy for set size)
	if (card.set?.total && card.set.total < 100 && rarityWeight >= 40) {
		const impact = Math.min(10, Math.round((100 - card.set.total) / 10));
		score += impact;
		factors.push({
			name: 'Small set',
			impact,
			description: `Set has only ${card.set.total} cards — lower supply`
		});
	}

	// Factor 4: TCGPlayer price spread (low vs market gap)
	if (card.tcgplayer?.prices) {
		for (const variant of Object.values(card.tcgplayer.prices)) {
			if (variant.low && variant.market && variant.market > 0) {
				const spread = (variant.market - variant.low) / variant.market;
				if (spread > 0.3) {
					const impact = Math.min(15, Math.round(spread * 20));
					score += impact;
					factors.push({
						name: 'Wide price spread',
						impact,
						description: `${Math.round(spread * 100)}% gap between low ($${variant.low.toFixed(2)}) and market ($${variant.market.toFixed(2)}) — buying opportunity`
					});
					break;
				}
			}
		}
	}

	// Factor 5: High price cards that are popular Pokémon (by name recognition)
	const iconicPokemon = ['Charizard', 'Pikachu', 'Mewtwo', 'Mew', 'Lugia', 'Rayquaza', 'Eevee', 'Gengar', 'Umbreon', 'Espeon'];
	const isIconic = iconicPokemon.some(p => card.name.includes(p));
	if (isIconic && marketPrice > 0 && marketPrice < 10 && rarityWeight >= 40) {
		score += 10;
		factors.push({
			name: 'Iconic Pokémon',
			impact: 10,
			description: `${card.name} has strong collector demand — low price may be temporary`
		});
	}

	// Clamp score
	score = Math.max(0, Math.min(100, score));

	const signal: ValueScore['signal'] =
		score >= 65 ? 'undervalued' :
		score <= 35 ? 'overvalued' : 'fair';

	return { card, score, marketPrice, factors, signal };
}

// ─── Comp Analysis ───────────────────────────────────────────────

export interface CompAnalysis {
	pokemonName: string;
	printings: CompPrinting[];
	averagePrice: number;
	medianPrice: number;
	cheapest: CompPrinting | null;
	mostExpensive: CompPrinting | null;
	priceRange: number;
}

export interface CompPrinting {
	card: PokemonCard;
	marketPrice: number;
	rarity: string;
	set: string;
	releaseDate: string;
	vsAverage: number; // % above or below average
}

export function analyzeComps(cards: PokemonCard[]): CompAnalysis | null {
	if (cards.length === 0) return null;

	const printings: CompPrinting[] = cards
		.map((card) => ({
			card,
			marketPrice: getMarketPrice(card),
			rarity: card.rarity ?? 'Unknown',
			set: card.set?.name ?? 'Unknown',
			releaseDate: card.set?.releaseDate ?? '',
			vsAverage: 0
		}))
		.filter((p) => p.marketPrice > 0)
		.sort((a, b) => a.marketPrice - b.marketPrice);

	if (printings.length === 0) return null;

	const prices = printings.map((p) => p.marketPrice);
	const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
	const sorted = [...prices].sort((a, b) => a - b);
	const medianPrice = sorted.length % 2 === 0
		? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
		: sorted[Math.floor(sorted.length / 2)];

	// Calculate vs average
	for (const p of printings) {
		p.vsAverage = averagePrice > 0 ? ((p.marketPrice - averagePrice) / averagePrice) * 100 : 0;
	}

	return {
		pokemonName: cards[0].name.split(' ')[0], // Base name
		printings,
		averagePrice,
		medianPrice,
		cheapest: printings[0] ?? null,
		mostExpensive: printings[printings.length - 1] ?? null,
		priceRange: prices[prices.length - 1] - prices[0]
	};
}

// ─── Trend Detection ─────────────────────────────────────────────

export interface TrendSignal {
	direction: 'rising' | 'falling' | 'stable' | 'volatile';
	strength: number; // 0-100
	description: string;
	movingAvg7d: number;
	movingAvg30d: number;
	momentum: number; // positive = accelerating up
}

export function detectTrend(dataPoints: { date: string; price: number }[]): TrendSignal {
	if (dataPoints.length < 7) {
		return {
			direction: 'stable',
			strength: 0,
			description: 'Not enough data for trend analysis',
			movingAvg7d: 0,
			movingAvg30d: 0,
			momentum: 0
		};
	}

	const prices = dataPoints.map((p) => p.price);

	// Calculate moving averages
	const last7 = prices.slice(-7);
	const last30 = prices.slice(-30);
	const movingAvg7d = last7.reduce((a, b) => a + b, 0) / last7.length;
	const movingAvg30d = last30.reduce((a, b) => a + b, 0) / last30.length;

	// Calculate momentum (rate of change of the moving average)
	const prev7 = prices.slice(-14, -7);
	const prevAvg7 = prev7.length > 0 ? prev7.reduce((a, b) => a + b, 0) / prev7.length : movingAvg7d;
	const momentum = prevAvg7 > 0 ? ((movingAvg7d - prevAvg7) / prevAvg7) * 100 : 0;

	// Calculate volatility (standard deviation / mean)
	const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
	const variance = prices.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / prices.length;
	const volatility = mean > 0 ? Math.sqrt(variance) / mean : 0;

	// Determine direction and strength
	let direction: TrendSignal['direction'];
	let strength: number;
	let description: string;

	if (volatility > 0.3) {
		direction = 'volatile';
		strength = Math.min(100, Math.round(volatility * 200));
		description = `High volatility (${(volatility * 100).toFixed(0)}% std dev) — price swinging significantly`;
	} else if (momentum > 5) {
		direction = 'rising';
		strength = Math.min(100, Math.round(momentum * 5));
		description = `Rising trend — 7-day avg ($${movingAvg7d.toFixed(2)}) above 30-day avg ($${movingAvg30d.toFixed(2)})`;
	} else if (momentum < -5) {
		direction = 'falling';
		strength = Math.min(100, Math.round(Math.abs(momentum) * 5));
		description = `Falling trend — 7-day avg ($${movingAvg7d.toFixed(2)}) below 30-day avg ($${movingAvg30d.toFixed(2)})`;
	} else {
		direction = 'stable';
		strength = Math.round(Math.max(0, 50 - Math.abs(momentum) * 10));
		description = `Stable price around $${movingAvg7d.toFixed(2)}`;
	}

	return { direction, strength, description, movingAvg7d, movingAvg30d, momentum };
}

// ─── Simulated Price History Generation ──────────────────────────
// Generates realistic-looking price history from a card's current market price
// Used when external price history APIs aren't available

export function generateSimulatedHistory(
	card: PokemonCard,
	days = 90
): { date: string; price: number }[] {
	const currentPrice = getMarketPrice(card);
	if (currentPrice <= 0) return [];

	const points: { date: string; price: number }[] = [];
	const now = Date.now();

	// Use card ID as seed for deterministic but varied patterns
	let seed = 0;
	for (let i = 0; i < card.id.length; i++) {
		seed = ((seed << 5) - seed + card.id.charCodeAt(i)) | 0;
	}

	// Generate a trend pattern based on rarity
	const rarityWeight = RARITY_WEIGHT[card.rarity ?? ''] ?? 15;
	const trendBias = rarityWeight > 60 ? 0.001 : rarityWeight > 30 ? 0 : -0.001;

	let price = currentPrice * (0.85 + (Math.abs(seed % 30) / 100)); // Start 85-115% of current

	for (let d = days; d >= 0; d--) {
		const date = new Date(now - d * 24 * 60 * 60 * 1000);
		// Seeded pseudo-random walk
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		const random = (seed % 1000) / 1000 - 0.5;
		const volatility = currentPrice * 0.02; // 2% daily volatility
		price = Math.max(0.01, price + random * volatility + trendBias * currentPrice);

		points.push({
			date: date.toISOString().split('T')[0],
			price: Math.round(price * 100) / 100
		});
	}

	// Ensure the last point is close to actual current price
	if (points.length > 0) {
		const last = points[points.length - 1];
		const adjustment = currentPrice - last.price;
		// Gradually adjust last 7 points toward actual price
		const adjustDays = Math.min(7, points.length);
		for (let i = 0; i < adjustDays; i++) {
			const idx = points.length - adjustDays + i;
			const factor = (i + 1) / adjustDays;
			points[idx].price = Math.round((points[idx].price + adjustment * factor) * 100) / 100;
		}
	}

	return points;
}

// ─── Batch Analysis ──────────────────────────────────────────────

export function findUndervaluedCards(cards: PokemonCard[], limit = 20): ValueScore[] {
	return cards
		.map(scoreCardValue)
		.filter((v) => v.marketPrice > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

export { getMarketPrice };
