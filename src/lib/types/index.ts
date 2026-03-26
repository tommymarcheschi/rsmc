// Pokemon TCG Card types
export interface PokemonCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	hp?: string;
	types?: string[];
	attacks?: Attack[];
	weaknesses?: TypeValue[];
	resistances?: TypeValue[];
	retreatCost?: string[];
	set: CardSet;
	number: string;
	artist?: string;
	rarity?: string;
	nationalPokedexNumbers?: number[];
	images: CardImages;
	tcgplayer?: TCGPlayerData;
}

export interface Attack {
	name: string;
	cost: string[];
	convertedEnergyCost: number;
	damage: string;
	text: string;
}

export interface TypeValue {
	type: string;
	value: string;
}

export interface CardSet {
	id: string;
	name: string;
	series: string;
	printedTotal: number;
	total: number;
	releaseDate: string;
	images: {
		symbol: string;
		logo: string;
	};
}

export interface CardImages {
	small: string;
	large: string;
}

export interface TCGPlayerData {
	url: string;
	updatedAt: string;
	prices?: Record<string, PriceData>;
}

export interface PriceData {
	low?: number;
	mid?: number;
	high?: number;
	market?: number;
	directLow?: number;
}

// Collection types
export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export interface CollectionEntry {
	id: string;
	card_id: string;
	quantity: number;
	condition: CardCondition;
	purchase_price?: number;
	purchase_date?: string;
	notes?: string;
	created_at: string;
	updated_at: string;
}

// Watchlist types
export interface WatchlistEntry {
	id: string;
	card_id: string;
	target_price?: number;
	alert_enabled: boolean;
	created_at: string;
}

// Grading types
export type GradingService = 'PSA' | 'CGC' | 'BGS' | 'SGC';
export type GradingTier = 'economy' | 'regular' | 'express' | 'super_express';
export type GradingStatus = 'pending' | 'submitted' | 'received' | 'grading' | 'shipped' | 'complete';

export interface GradingEntry {
	id: string;
	card_id: string;
	service: GradingService;
	tier: GradingTier;
	status: GradingStatus;
	submitted_date?: string;
	returned_date?: string;
	grade?: number;
	cost?: number;
	final_value?: number;
	created_at: string;
	updated_at: string;
}

// Price cache types
export interface PriceSnapshot {
	card_id: string;
	source: string;
	raw_price?: number;
	graded_prices?: Record<string, number>;
	cached_at: string;
}

// PokéAPI enrichment
export interface PokedexData {
	id: number;
	name: string;
	types: string[];
	flavor_text: string;
	evolution_chain?: EvolutionNode[];
	genus: string;
	height: number;
	weight: number;
}

export interface EvolutionNode {
	name: string;
	id: number;
	evolves_to: EvolutionNode[];
}

// API response wrappers
export interface PaginatedResponse<T> {
	data: T[];
	page: number;
	pageSize: number;
	count: number;
	totalCount: number;
}
