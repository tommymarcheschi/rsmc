<script lang="ts">
	import { enhance } from '$app/forms';
	import { PriceChart } from '$components';
	import type { PokedexData, EvolutionNode } from '$types';
	import type { PokeTracePrice } from '$services/poketrace';
	import type { GradedPrice } from '$services/price-tracker';
	import type { PriceHistory } from '$services/price-tracker';
	import type { EbaySoldResult } from '$services/ebay-scraper';
	import type { PSAPopData } from '$services/psa-scraper';
	import type { CardSignal, SimilarCard } from '$services/insights';
	import { ERA_LABELS } from '$services/insights';
	import type { GradingROIResult } from '$services/grading-roi';

	interface IndexRow {
		rarity: string | null;
		raw_nm_price: number | null;
		raw_source: string | null;
		psa10_price: number | null;
		cgc10_price: number | null;
		tag10_price: number | null;
		psa10_delta: number | null;
		psa10_multiple: number | null;
		psa10_last_sold_at: string | null;
		psa_pop_total: number | null;
		psa_pop_10: number | null;
		psa_gem_rate: number | null;
		cgc_pop_total: number | null;
		cgc_pop_10: number | null;
		cgc_gem_rate: number | null;
		graded_prices_fetched_at: string | null;
		last_enriched_at: string | null;
	}

	let { data, form } = $props();

	let card = $derived(data.card);
	let pokedexData = $derived(data.pokedexData as PokedexData | null);
	let evolutionChain = $derived(data.evolutionChain as EvolutionNode[] | null);
	let poketracePrice = $derived(data.poketracePrice as PokeTracePrice | null);
	let gradedPrices = $derived(data.gradedPrices as GradedPrice[]);
	let priceHistory = $derived(data.priceHistory as PriceHistory | null);
	let ebaySold = $derived(data.ebaySold as EbaySoldResult);
	let psaPop = $derived(data.psaPop as PSAPopData | null);
	let conditionPrices = $derived(
		(data.conditionPrices ?? []) as Array<{
			condition: string;
			median_cents: number;
			p25_cents: number;
			p75_cents: number;
			sample_count: number;
			snapshot_date: string;
		}>
	);
	let hasConditionPrices = $derived(conditionPrices.length > 0);
	let conditionPricesAsOf = $derived(conditionPrices[0]?.snapshot_date ?? null);

	let indexRow = $derived(data.indexRow as IndexRow | null);
	let cardSignal = $derived(data.cardSignal as CardSignal | null);
	let gradingROI = $derived(data.gradingROI as GradingROIResult | null);
	let similarCards = $derived((data.similarCards ?? []) as SimilarCard[]);
	let hasMarketSignals = $derived(
		indexRow != null &&
			(indexRow.raw_nm_price != null ||
				indexRow.psa10_price != null ||
				indexRow.psa_pop_total != null ||
				indexRow.cgc_pop_total != null)
	);

	function fmtMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}
	function fmtInt(n: number | null | undefined): string {
		if (n == null) return '—';
		return n.toLocaleString();
	}

	function daysSince(isoDate: string | null | undefined): number | null {
		if (!isoDate) return null;
		const then = new Date(`${isoDate}T00:00:00Z`).getTime();
		if (Number.isNaN(then)) return null;
		return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
	}

	const STALE_DAYS = 90;
	/** Minimum PSA-graded sample size for a trustworthy gem rate — mirrors
	 *  grading-roi.ts::GEM_RATE_MIN_SAMPLE so the visible confidence bar
	 *  here lines up with the ROI calculator's `confident` flag. */
	const GEM_RATE_MIN_SAMPLE = 20;

	function rawSourceLabel(src: string | null | undefined): string | null {
		if (!src) return null;
		if (src === 'pricecharting') return 'PriceCharting Ungraded';
		if (src === 'tcgplayer') return 'TCGPlayer market';
		return src;
	}

	const CONDITION_LABEL: Record<string, string> = {
		NM: 'Near Mint',
		LP: 'Lightly Played',
		MP: 'Moderately Played',
		HP: 'Heavily Played',
		DMG: 'Damaged'
	};

	// "Added" state comes from either the server loader (reload-resistant,
	// works without JS) or the most recent form submission result.
	let inCollection = $derived(data.inCollection || form?.action === 'collection' && form?.success);
	let onWatchlist = $derived(data.onWatchlist || form?.action === 'watchlist' && form?.success);
	let actionError = $derived(form && !form.success ? form.message : null);

	function typeColor(type: string): string {
		const colors: Record<string, string> = {
			Colorless: 'bg-gray-400', Darkness: 'bg-stone-600', Dragon: 'bg-violet-600',
			Fairy: 'bg-pink-400', Fighting: 'bg-red-700', Fire: 'bg-orange-500',
			Grass: 'bg-green-500', Lightning: 'bg-yellow-400', Metal: 'bg-slate-400',
			Psychic: 'bg-fuchsia-500', Water: 'bg-blue-500'
		};
		return colors[type] ?? 'bg-gray-500';
	}

	function flattenEvolutions(nodes: EvolutionNode[]): { name: string; id: number; stage: number }[] {
		const result: { name: string; id: number; stage: number }[] = [];
		function walk(node: EvolutionNode, stage: number) {
			result.push({ name: node.name, id: node.id, stage });
			for (const child of node.evolves_to) walk(child, stage + 1);
		}
		for (const node of nodes) walk(node, 0);
		return result;
	}

	let evolutions = $derived(evolutionChain ? flattenEvolutions(evolutionChain) : []);

	// Determine if we have multi-marketplace data
	let hasPokeTrace = $derived(!!poketracePrice && (!!poketracePrice.tcgplayer || !!poketracePrice.ebay || !!poketracePrice.cardmarket));
	let hasGradedPrices = $derived(gradedPrices.length > 0);

	// Group graded prices by service
	let gradedByService = $derived.by(() => {
		const grouped: Record<string, GradedPrice[]> = {};
		for (const gp of gradedPrices) {
			if (!grouped[gp.service]) grouped[gp.service] = [];
			grouped[gp.service].push(gp);
		}
		// Sort grades within each service
		for (const svc of Object.keys(grouped)) {
			grouped[svc].sort((a, b) => b.grade - a.grade);
		}
		return grouped;
	});
</script>

<svelte:head>
	<title>{card.name} — Trove</title>
</svelte:head>

<div class="space-y-6">
	<a href="/browse" class="inline-flex items-center gap-2 text-sm text-vault-purple hover:text-vault-purple-hover hover:underline">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
		Back to Browse
	</a>

	<div class="grid grid-cols-1 gap-5 sm:gap-8 lg:grid-cols-3">
		<!-- Card Image -->
		<div class="flex items-start justify-center lg:col-span-1">
			<div class="sticky top-8 mx-auto w-full max-w-[240px] sm:max-w-sm">
				<img src={card.images.large} alt={card.name} class="w-full rounded-xl shadow-2xl shadow-vault-purple/10" />
			</div>
		</div>

		<!-- Card Details -->
		<div class="space-y-4 sm:space-y-6 lg:col-span-2">
			<!-- Header -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h1 class="truncate text-2xl font-bold text-white sm:text-3xl">{card.name}</h1>
						<p class="mt-1 text-vault-text-muted">
							{card.set.name} · #{card.number}/{card.set.printedTotal} · {card.rarity ?? 'Unknown'}
						</p>
					</div>
					{#if card.set.images?.symbol}
						<img src={card.set.images.symbol} alt={card.set.name} class="h-8 w-8 object-contain" />
					{/if}
				</div>
				<div class="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
					{#if card.hp}
						<div>
							<span class="text-vault-text-muted">HP</span>
							<p class="mt-0.5 text-lg font-bold text-white">{card.hp}</p>
						</div>
					{/if}
					{#if card.types?.length}
						<div>
							<span class="text-vault-text-muted">Type</span>
							<div class="mt-1 flex gap-1.5">
								{#each card.types as type}
									<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white {typeColor(type)}">{type}</span>
								{/each}
							</div>
						</div>
					{/if}
					<div>
						<span class="text-vault-text-muted">Supertype</span>
						<p class="mt-0.5 font-medium text-white">{card.supertype}</p>
					</div>
					{#if card.artist}
						<div>
							<span class="text-vault-text-muted">Artist</span>
							<p class="mt-0.5 font-medium text-white">{card.artist}</p>
						</div>
					{/if}
				</div>
				{#if card.subtypes?.length}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each card.subtypes as subtype}
							<span class="rounded-lg border border-vault-border px-2.5 py-1 text-xs text-vault-text-muted">{subtype}</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- ==================== PRICING SECTION ==================== -->

			<!-- Multi-Marketplace Pricing (PokeTrace) -->
			{#if hasPokeTrace}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Multi-Marketplace Prices</h2>
						<span class="rounded-full bg-vault-green/10 px-2.5 py-0.5 text-xs font-medium text-vault-green">
							Live Data
						</span>
					</div>
					<p class="mt-1 text-xs text-vault-text-muted">
						Confidence: {Math.round((poketracePrice?.confidence ?? 0) * 100)}% · Updated: {poketracePrice?.updated_at ? new Date(poketracePrice.updated_at).toLocaleDateString() : 'N/A'}
					</p>

					<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
						<!-- TCGPlayer -->
						{#if poketracePrice?.tcgplayer}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
								<div class="flex items-center justify-between">
									<p class="text-sm font-medium text-vault-purple">TCGPlayer</p>
									<span class="text-xs text-vault-text-muted">{poketracePrice.tcgplayer.currency}</span>
								</div>
								<div class="mt-3 space-y-1.5">
									{#if poketracePrice.tcgplayer.raw.market != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Market</span>
											<span class="font-bold text-vault-green">${poketracePrice.tcgplayer.raw.market.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.tcgplayer.raw.low != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Low</span>
											<span class="text-white">${poketracePrice.tcgplayer.raw.low.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.tcgplayer.raw.high != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">High</span>
											<span class="text-white">${poketracePrice.tcgplayer.raw.high.toFixed(2)}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- eBay -->
						{#if poketracePrice?.ebay}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
								<div class="flex items-center justify-between">
									<p class="text-sm font-medium text-yellow-400">eBay</p>
									<span class="text-xs text-vault-text-muted">{poketracePrice.ebay.currency}</span>
								</div>
								<div class="mt-3 space-y-1.5">
									{#if poketracePrice.ebay.raw.market != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Avg Sold</span>
											<span class="font-bold text-vault-green">${poketracePrice.ebay.raw.market.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.ebay.raw.low != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Low</span>
											<span class="text-white">${poketracePrice.ebay.raw.low.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.ebay.raw.high != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">High</span>
											<span class="text-white">${poketracePrice.ebay.raw.high.toFixed(2)}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- CardMarket (EU) -->
						{#if poketracePrice?.cardmarket}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
								<div class="flex items-center justify-between">
									<p class="text-sm font-medium text-emerald-400">CardMarket</p>
									<span class="text-xs text-vault-text-muted">{poketracePrice.cardmarket.currency}</span>
								</div>
								<div class="mt-3 space-y-1.5">
									{#if poketracePrice.cardmarket.raw.market != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Trend</span>
											<span class="font-bold text-vault-green">€{poketracePrice.cardmarket.raw.market.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.cardmarket.raw.low != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">Low</span>
											<span class="text-white">€{poketracePrice.cardmarket.raw.low.toFixed(2)}</span>
										</div>
									{/if}
									{#if poketracePrice.cardmarket.raw.high != null}
										<div class="flex justify-between text-sm">
											<span class="text-vault-text-muted">High</span>
											<span class="text-white">€{poketracePrice.cardmarket.raw.high.toFixed(2)}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- TCGPlayer Prices (fallback from card data) -->
			{#if card.tcgplayer?.prices && !hasPokeTrace}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Market Prices</h2>
						{#if card.tcgplayer.url}
							<a href={card.tcgplayer.url} target="_blank" rel="noopener noreferrer" class="text-sm text-vault-accent hover:underline">
								View on TCGPlayer
							</a>
						{/if}
					</div>
					<p class="mt-1 text-xs text-vault-text-muted">
						Updated: {new Date(card.tcgplayer.updatedAt).toLocaleDateString()}
					</p>
					<div class="mt-4 space-y-3">
						{#each Object.entries(card.tcgplayer.prices) as [variant, prices]}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
								<p class="mb-2 text-sm font-medium capitalize text-vault-text-muted">
									{variant.replace(/([A-Z])/g, ' $1').trim()}
								</p>
								<div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
									{#if prices.low != null}
										<div><span class="text-vault-text-muted">Low</span><p class="font-semibold text-white">${prices.low.toFixed(2)}</p></div>
									{/if}
									{#if prices.mid != null}
										<div><span class="text-vault-text-muted">Mid</span><p class="font-semibold text-white">${prices.mid.toFixed(2)}</p></div>
									{/if}
									{#if prices.high != null}
										<div><span class="text-vault-text-muted">High</span><p class="font-semibold text-white">${prices.high.toFixed(2)}</p></div>
									{/if}
									{#if prices.market != null}
										<div><span class="text-vault-text-muted">Market</span><p class="font-bold text-vault-green">${prices.market.toFixed(2)}</p></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if card.cardmarket?.prices && !hasPokeTrace}
				<!-- CardMarket fallback when TCGPlayer has no prices -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Market Prices</h2>
						{#if card.cardmarket.url}
							<a href={card.cardmarket.url} target="_blank" rel="noopener noreferrer" class="text-sm text-vault-accent hover:underline">
								View on CardMarket
							</a>
						{/if}
					</div>
					<p class="mt-1 text-xs text-vault-text-muted">
						Source: CardMarket (EU) · Updated: {new Date(card.cardmarket.updatedAt).toLocaleDateString()}
					</p>
					<div class="mt-4">
						<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
							<div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
								{#if card.cardmarket.prices.trendPrice != null}
									<div><span class="text-vault-text-muted">Trend</span><p class="font-bold text-vault-green">${card.cardmarket.prices.trendPrice.toFixed(2)}</p></div>
								{/if}
								{#if card.cardmarket.prices.averageSellPrice != null}
									<div><span class="text-vault-text-muted">Avg Sell</span><p class="font-semibold text-white">${card.cardmarket.prices.averageSellPrice.toFixed(2)}</p></div>
								{/if}
								{#if card.cardmarket.prices.lowPrice != null}
									<div><span class="text-vault-text-muted">Low</span><p class="font-semibold text-white">${card.cardmarket.prices.lowPrice.toFixed(2)}</p></div>
								{/if}
								{#if card.cardmarket.prices.avg30 != null}
									<div><span class="text-vault-text-muted">30d Avg</span><p class="font-semibold text-white">${card.cardmarket.prices.avg30.toFixed(2)}</p></div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else if !hasPokeTrace}
				<!-- No pricing data available -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Market Prices</h2>
						{#if card.tcgplayer?.url}
							<a href={card.tcgplayer.url} target="_blank" rel="noopener noreferrer" class="text-sm text-vault-accent hover:underline">
								View on TCGPlayer
							</a>
						{/if}
					</div>
					<div class="mt-4 flex flex-col items-center justify-center rounded-xl border border-vault-border bg-vault-bg py-8 text-vault-text-muted">
						<svg class="mb-2 h-8 w-8 text-vault-purple/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<p class="text-sm font-medium">Pricing not yet available</p>
						<p class="mt-1 text-xs">New cards may take a few days to get market pricing</p>
					</div>
				</div>
			{/if}

			<!-- Market Signals — all data we have on this card from card_index -->
			{#if hasMarketSignals && indexRow}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Market Signals</h2>
						{#if indexRow.last_enriched_at}
							<span class="text-[10px] text-vault-text-muted">
								enriched {new Date(indexRow.last_enriched_at).toLocaleDateString()}
							</span>
						{/if}
					</div>

					<!-- Price ladder (raw + each grader's 10) -->
					<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
						<div class="rounded-xl border border-vault-border bg-vault-bg p-3 text-center">
							<p class="text-[11px] font-medium text-vault-text-muted">Raw NM</p>
							<p class="mt-1 text-base font-bold text-white">{fmtMoney(indexRow.raw_nm_price)}</p>
							<p class="text-[10px] text-vault-text-muted">{rawSourceLabel(indexRow.raw_source) ?? 'PriceCharting'}</p>
						</div>
						<div class="rounded-xl border border-vault-border bg-vault-bg p-3 text-center">
							<p class="text-[11px] font-medium text-vault-gold">PSA 10</p>
							<p class="mt-1 text-base font-bold text-white">{fmtMoney(indexRow.psa10_price)}</p>
							{#if indexRow.psa10_multiple != null}
								<p class="text-[10px] text-vault-text-muted">{indexRow.psa10_multiple.toFixed(1)}× raw</p>
							{/if}
							{#if indexRow.psa10_last_sold_at}
								{@const age = daysSince(indexRow.psa10_last_sold_at)}
								{#if age != null && age > STALE_DAYS}
									<p class="mt-1 text-[10px] font-medium text-vault-red" title="Most recent PSA 10 sold comp on PriceCharting is {indexRow.psa10_last_sold_at}. The price above is an algorithmic estimate — treat with caution.">
										stale · {age}d old
									</p>
								{:else if age != null}
									<p class="mt-1 text-[10px] text-vault-text-muted" title="Most recent PSA 10 sold comp on PriceCharting is {indexRow.psa10_last_sold_at}.">
										fresh · {age}d
									</p>
								{/if}
							{/if}
						</div>
						<div class="rounded-xl border border-vault-border bg-vault-bg p-3 text-center">
							<p class="text-[11px] font-medium text-blue-400">CGC 10</p>
							<p class="mt-1 text-base font-bold text-white">{fmtMoney(indexRow.cgc10_price)}</p>
						</div>
						<div class="rounded-xl border border-vault-border bg-vault-bg p-3 text-center">
							<p class="text-[11px] font-medium text-purple-300">TAG 10</p>
							<p class="mt-1 text-base font-bold text-white">{fmtMoney(indexRow.tag10_price)}</p>
						</div>
					</div>

					<!-- Pop reports -->
					{#if indexRow.psa_pop_total != null || indexRow.cgc_pop_total != null}
						<div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
							{#if indexRow.psa_pop_total != null}
								{@const thin = (indexRow.psa_pop_total ?? 0) < GEM_RATE_MIN_SAMPLE}
								<div class="rounded-xl border border-vault-border bg-vault-bg p-3">
									<p class="text-[11px] font-medium text-vault-gold">PSA Population</p>
									<div class="mt-1 flex items-baseline justify-between">
										<p class="text-base font-bold text-white">{fmtInt(indexRow.psa_pop_total)} total</p>
										<p class="text-sm text-vault-text-muted">{fmtInt(indexRow.psa_pop_10)} at 10</p>
									</div>
									{#if indexRow.psa_gem_rate != null}
										<p class="mt-0.5 text-xs text-vault-text-muted">
											Gem rate <span class="text-vault-green">{indexRow.psa_gem_rate.toFixed(1)}%</span>
											{#if thin}
												<span class="ml-1 rounded bg-vault-red/15 px-1.5 py-0.5 text-[10px] font-medium text-vault-red" title="Under {GEM_RATE_MIN_SAMPLE} PSA-graded copies — gem rate is noisy and shouldn't anchor a grading decision on its own.">low sample (n={indexRow.psa_pop_total})</span>
											{/if}
										</p>
									{/if}
								</div>
							{/if}
							{#if indexRow.cgc_pop_total != null}
								{@const thin = (indexRow.cgc_pop_total ?? 0) < GEM_RATE_MIN_SAMPLE}
								<div class="rounded-xl border border-vault-border bg-vault-bg p-3">
									<p class="text-[11px] font-medium text-blue-400">CGC Population</p>
									<div class="mt-1 flex items-baseline justify-between">
										<p class="text-base font-bold text-white">{fmtInt(indexRow.cgc_pop_total)} total</p>
										<p class="text-sm text-vault-text-muted">{fmtInt(indexRow.cgc_pop_10)} at 10</p>
									</div>
									{#if indexRow.cgc_gem_rate != null}
										<p class="mt-0.5 text-xs text-vault-text-muted">
											Gem rate <span class="text-vault-green">{indexRow.cgc_gem_rate.toFixed(1)}%</span>
											{#if thin}
												<span class="ml-1 rounded bg-vault-red/15 px-1.5 py-0.5 text-[10px] font-medium text-vault-red" title="Under {GEM_RATE_MIN_SAMPLE} CGC-graded copies — gem rate is noisy.">low sample (n={indexRow.cgc_pop_total})</span>
											{/if}
										</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Undervalued-finder context -->
					{#if cardSignal}
						{@const dev = cardSignal.deviation_pct}
						{@const label = dev >= 20 ? 'PSA 10 is running hot' : dev <= -20 ? 'PSA 10 looks cheap' : 'PSA 10 is priced normally'}
						{@const color = dev >= 20 ? 'text-vault-gold' : dev <= -20 ? 'text-vault-green' : 'text-vault-text-muted'}
						<div class="mt-4 rounded-xl border border-vault-border bg-vault-bg p-3 sm:p-4">
							<div class="flex items-baseline justify-between gap-3">
								<p class="text-sm font-medium {color}">{label}</p>
								<p class="text-sm font-bold {color}">
									{dev >= 0 ? '+' : ''}{dev.toFixed(0)}%
								</p>
							</div>
							<p class="mt-1 text-xs text-vault-text-muted">
								This card's PSA 10 sells at <b>{cardSignal.actual_multiple.toFixed(1)}×</b> raw. Typical for <b>{cardSignal.rarity}</b> in <b>{cardSignal.era_label}</b> is <b>{cardSignal.median_multiple.toFixed(1)}×</b> (across {cardSignal.sample_size} indexed cards).
							</p>
						</div>
					{/if}

					<!-- Grading ROI — concrete profit math for a PSA submission -->
					{#if gradingROI && gradingROI.gradingCost > 0 && indexRow.raw_nm_price != null && indexRow.psa10_price != null}
						<div class="mt-4 rounded-xl border border-vault-border bg-vault-bg p-3 sm:p-4">
							<div class="flex items-center justify-between">
								<p class="text-sm font-medium text-white">Grading ROI (PSA)</p>
								<span class="text-[10px] text-vault-text-muted">
									{gradingROI.resolvedTier?.name} · ${gradingROI.gradingCost}
								</span>
							</div>
							<div class="mt-3 grid grid-cols-3 gap-2 text-center">
								<div>
									<p class="text-[10px] text-vault-text-muted">Realistic</p>
									<p class="mt-0.5 text-sm font-bold {gradingROI.realisticProfit != null && gradingROI.realisticProfit > 0 ? 'text-vault-green' : 'text-vault-red'}">
										{gradingROI.realisticProfit != null ? fmtMoney(gradingROI.realisticProfit) : '—'}
									</p>
									<p class="text-[10px] text-vault-text-muted">using gem rate</p>
								</div>
								<div>
									<p class="text-[10px] text-vault-text-muted">If it 10s</p>
									<p class="mt-0.5 text-sm font-bold {gradingROI.optimisticProfit != null && gradingROI.optimisticProfit > 0 ? 'text-vault-green' : 'text-vault-red'}">
										{gradingROI.optimisticProfit != null ? fmtMoney(gradingROI.optimisticProfit) : '—'}
									</p>
									<p class="text-[10px] text-vault-text-muted">upside cap</p>
								</div>
								<div>
									<p class="text-[10px] text-vault-text-muted">Break-even</p>
									<p class="mt-0.5 text-sm font-bold text-white">
										{gradingROI.breakEvenGemRate != null ? gradingROI.breakEvenGemRate.toFixed(0) + '%' : '—'}
									</p>
									<p class="text-[10px] text-vault-text-muted">gem rate needed</p>
								</div>
							</div>
							{#if !gradingROI.confident}
								<p class="mt-3 text-[10px] italic text-amber-400">
									Low PSA sample ({indexRow.psa_pop_total ?? 0} graded) — gem rate estimate is noisy.
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Price by Condition (Phase 1: per-condition raw pricing from TCGPlayer listings) -->
			{#if hasConditionPrices}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">Price by Condition</h2>
						{#if conditionPricesAsOf}
							<span class="text-[10px] text-vault-text-muted">as of {conditionPricesAsOf}</span>
						{/if}
					</div>
					<p class="mt-1 text-xs text-vault-text-muted">
						Median active-listing price on TCGPlayer by condition. <span class="italic">low sample</span> when n &lt; 10.
					</p>
					<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
						{#each conditionPrices as row}
							{@const isLowSample = row.sample_count < 10}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-3 text-center">
								<p class="text-[11px] font-medium text-vault-gold">{row.condition}</p>
								<p class="text-[10px] text-vault-text-muted">{CONDITION_LABEL[row.condition] ?? row.condition}</p>
								<p class="mt-1 text-base font-bold text-white">${(row.median_cents / 100).toFixed(2)}</p>
								<p class="text-[10px] text-vault-text-muted">
									n={row.sample_count}{#if isLowSample} <span class="italic text-amber-400">low</span>{/if}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Graded Prices -->
			{#if hasGradedPrices}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<h2 class="text-lg font-semibold text-white">Graded Prices</h2>
					<p class="mt-1 text-xs text-vault-text-muted">Recent sale prices by grade</p>
					<div class="mt-4 space-y-4">
						{#each Object.entries(gradedByService) as [service, prices]}
							<div>
								<p class="mb-2 text-sm font-medium text-vault-gold">{service}</p>
								<div class="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2 lg:grid-cols-10">
									{#each prices as gp}
										<div class="rounded-lg border border-vault-border bg-vault-bg p-2 text-center">
											<p class="text-xs text-vault-text-muted">{gp.grade}</p>
											<p class="text-sm font-bold text-white">${gp.price.toFixed(0)}</p>
											{#if gp.population != null}
												<p class="text-[10px] text-vault-text-muted">pop {gp.population}</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Price History Chart -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
				<h2 class="text-lg font-semibold text-white">Price History</h2>
				<PriceChart {priceHistory} height={280} />
			</div>

			<!-- eBay Sold Comps -->
			{#if ebaySold?.listings?.length > 0}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">eBay Sold Comps</h2>
						<span class="text-xs text-vault-text-muted">{ebaySold.totalSold} recent sales</span>
					</div>
					<!-- Stats summary -->
					<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
						<div class="rounded-xl bg-vault-bg p-3 text-center">
							<p class="text-[10px] text-vault-text-muted">Average</p>
							<p class="text-sm font-bold text-vault-gold">${ebaySold.averagePrice.toFixed(2)}</p>
						</div>
						<div class="rounded-xl bg-vault-bg p-3 text-center">
							<p class="text-[10px] text-vault-text-muted">Median</p>
							<p class="text-sm font-bold text-white">${ebaySold.medianPrice.toFixed(2)}</p>
						</div>
						<div class="rounded-xl bg-vault-bg p-3 text-center">
							<p class="text-[10px] text-vault-text-muted">Low</p>
							<p class="text-sm font-bold text-vault-green">${ebaySold.lowPrice.toFixed(2)}</p>
						</div>
						<div class="rounded-xl bg-vault-bg p-3 text-center">
							<p class="text-[10px] text-vault-text-muted">High</p>
							<p class="text-sm font-bold text-vault-accent">${ebaySold.highPrice.toFixed(2)}</p>
						</div>
					</div>
					<!-- Recent sales list -->
					<div class="mt-3 max-h-64 divide-y divide-vault-border overflow-y-auto rounded-xl border border-vault-border">
						{#each ebaySold.listings as listing}
							<div class="flex items-center gap-3 px-3 py-2">
								{#if listing.imageUrl}
									<img src={listing.imageUrl} alt="" class="h-10 w-10 rounded object-cover" loading="lazy" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-xs text-white">{listing.title}</p>
									{#if listing.soldDate}
										<p class="text-[10px] text-vault-text-muted">{listing.soldDate}</p>
									{/if}
								</div>
								<div class="text-right">
									<p class="text-sm font-bold text-vault-gold">${listing.soldPrice.toFixed(2)}</p>
									{#if listing.shippingCost !== null}
										<p class="text-[10px] text-vault-text-muted">
											{listing.shippingCost === 0 ? 'Free ship' : `+$${listing.shippingCost.toFixed(2)}`}
										</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- PSA Population Report -->
			{#if psaPop}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold text-white">PSA Population</h2>
						<span class="text-xs text-vault-text-muted">{psaPop.totalGraded} total graded</span>
					</div>
					<div class="mt-1 flex items-center gap-3 text-xs text-vault-text-muted">
						<span>{psaPop.setName}</span>
						<span>Gem Rate: <span class="font-medium text-vault-gold">{psaPop.gemRate.toFixed(1)}%</span></span>
					</div>
					<!-- Grade distribution -->
					<div class="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-10 sm:gap-2">
						{#each Array.from({ length: 10 }, (_, i) => i + 1) as grade}
							{@const count = psaPop.grades[String(grade)] ?? 0}
							{@const pct = psaPop.totalGraded > 0 ? (count / psaPop.totalGraded) * 100 : 0}
							<div class="rounded-lg border border-vault-border bg-vault-bg p-2 text-center {grade === 10 ? 'border-vault-gold/50' : ''}">
								<p class="text-xs font-bold {grade === 10 ? 'text-vault-gold' : 'text-vault-text-muted'}">PSA {grade}</p>
								<p class="mt-1 text-sm font-bold text-white">{count}</p>
								<div class="mx-auto mt-1 h-1 w-full overflow-hidden rounded-full bg-vault-surface">
									<div
										class="h-full rounded-full {grade >= 9 ? 'bg-vault-gold' : grade >= 7 ? 'bg-vault-green' : 'bg-vault-text-muted'}"
										style="width: {Math.min(100, pct * 2)}%"
									></div>
								</div>
								<p class="mt-0.5 text-[9px] text-vault-text-muted">{pct.toFixed(0)}%</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Attacks -->
			{#if card.attacks?.length}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<h2 class="text-lg font-semibold text-white">Attacks</h2>
					<div class="mt-4 space-y-4">
						{#each card.attacks as attack}
							<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="flex gap-0.5">
											{#each attack.cost as costType}
												<span class="inline-block h-5 w-5 rounded-full text-center text-[10px] font-bold leading-5 text-white {typeColor(costType)}">{costType[0]}</span>
											{/each}
										</div>
										<span class="font-semibold text-white">{attack.name}</span>
									</div>
									{#if attack.damage}
										<span class="text-xl font-bold text-vault-gold">{attack.damage}</span>
									{/if}
								</div>
								{#if attack.text}
									<p class="mt-2 text-sm text-vault-text-muted">{attack.text}</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Weaknesses / Resistances / Retreat -->
			{#if card.weaknesses?.length || card.resistances?.length || card.retreatCost?.length}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="grid grid-cols-3 gap-2 text-center sm:gap-4">
						<div>
							<h3 class="text-sm font-medium text-vault-text-muted">Weakness</h3>
							{#if card.weaknesses?.length}
								{#each card.weaknesses as w}
									<p class="mt-1"><span class="rounded-full px-2 py-0.5 text-xs font-bold text-white {typeColor(w.type)}">{w.type}</span> <span class="text-vault-red">{w.value}</span></p>
								{/each}
							{:else}<p class="mt-1 text-vault-text-muted">None</p>{/if}
						</div>
						<div>
							<h3 class="text-sm font-medium text-vault-text-muted">Resistance</h3>
							{#if card.resistances?.length}
								{#each card.resistances as r}
									<p class="mt-1"><span class="rounded-full px-2 py-0.5 text-xs font-bold text-white {typeColor(r.type)}">{r.type}</span> <span class="text-vault-green">{r.value}</span></p>
								{/each}
							{:else}<p class="mt-1 text-vault-text-muted">None</p>{/if}
						</div>
						<div>
							<h3 class="text-sm font-medium text-vault-text-muted">Retreat Cost</h3>
							{#if card.retreatCost?.length}
								<div class="mt-1 flex justify-center gap-0.5">
									{#each card.retreatCost as costType}
										<span class="inline-block h-5 w-5 rounded-full text-center text-[10px] font-bold leading-5 text-white {typeColor(costType)}">{costType[0]}</span>
									{/each}
								</div>
							{:else}<p class="mt-1 text-vault-text-muted">0</p>{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- PokéAPI Enrichment -->
			{#if pokedexData}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<h2 class="text-lg font-semibold text-white">Pokédex Data</h2>
					<div class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
						<div><span class="text-vault-text-muted">National Dex #</span><p class="font-medium text-white">#{pokedexData.id}</p></div>
						<div><span class="text-vault-text-muted">Species</span><p class="font-medium text-white">{pokedexData.genus}</p></div>
						<div><span class="text-vault-text-muted">Types</span><div class="mt-0.5 flex gap-1">{#each pokedexData.types as type}<span class="capitalize text-white">{type}</span>{/each}</div></div>
						<div><span class="text-vault-text-muted">Height</span><p class="font-medium text-white">{(pokedexData.height / 10).toFixed(1)}m</p></div>
						<div><span class="text-vault-text-muted">Weight</span><p class="font-medium text-white">{(pokedexData.weight / 10).toFixed(1)}kg</p></div>
					</div>
					{#if pokedexData.flavor_text}
						<div class="mt-4 rounded-xl border border-vault-border bg-vault-bg p-4">
							<p class="text-sm italic text-vault-text-muted">"{pokedexData.flavor_text}"</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Similar cards -->
			{#if similarCards.length > 0}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-start justify-between gap-3">
						<div>
							<h2 class="text-lg font-semibold text-white">Similar cards</h2>
							<p class="mt-0.5 text-xs text-vault-text-muted">
								Same rarity + era ({ERA_LABELS[similarCards[0].era]}) with a comparable PSA 10 price. Click through to compare.
							</p>
						</div>
					</div>
					<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each similarCards as sim}
							<a href="/card/{sim.card_id}" class="flex flex-col gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 transition hover:border-vault-accent/50 hover:bg-vault-surface-hover">
								{#if sim.image_small_url}
									<img src={sim.image_small_url} alt={sim.name} class="h-32 w-full rounded-lg object-contain" loading="lazy" />
								{/if}
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-white">{sim.name}</p>
									<p class="truncate text-[11px] text-vault-text-muted">
										{sim.set_name}{#if sim.card_number} · #{sim.card_number}{/if}
									</p>
									<div class="mt-1 flex items-baseline gap-2">
										<span class="text-sm font-bold text-vault-gold">{fmtMoney(sim.psa10_price)}</span>
										<span class="text-[10px] text-vault-text-muted">PSA 10</span>
									</div>
									{#if sim.psa_pop_total != null}
										<p class="text-[10px] text-vault-text-muted">pop {fmtInt(sim.psa_pop_total)}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Evolution Chain -->
			{#if evolutions.length > 1}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<h2 class="text-lg font-semibold text-white">Evolution Chain</h2>
					<div class="mt-4 flex flex-wrap items-center gap-3">
						{#each evolutions as evo, i}
							{#if i > 0}
								<svg class="h-5 w-5 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
							{/if}
							<div class="flex items-center gap-2 rounded-lg border border-vault-border bg-vault-bg px-3 py-2">
								<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{evo.id}.png" alt={evo.name} class="h-10 w-10" />
								<span class="text-sm font-medium capitalize text-white">{evo.name}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!--
				Actions — native <form method="POST"> that submits to the
				SvelteKit form actions in +page.server.ts. Works without JS.
				With JS, `use:enhance` upgrades it to an inline update (no full
				reload). "In Collection" / "Watching" state is persisted on the
				server and re-rendered on reload, so even in the no-JS path the
				user sees confirmation after the form submit.
			-->
			<div class="space-y-3">
				<div class="flex gap-3">
					<form method="POST" action="?/addToCollection" use:enhance class="contents">
						<button type="submit" disabled={inCollection} class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40 disabled:opacity-70">
							{inCollection ? 'In Collection' : 'Add to Collection'}
						</button>
					</form>
					<form method="POST" action="?/addToWatchlist" use:enhance class="contents">
						<button type="submit" disabled={onWatchlist} class="btn-press rounded-xl border border-vault-border px-6 py-2.5 text-sm font-medium text-vault-text transition-all hover:border-vault-purple/50 hover:bg-vault-surface-hover disabled:opacity-70">
							{onWatchlist ? 'Watching' : 'Add to Watchlist'}
						</button>
					</form>
				</div>
				{#if actionError}
					<div class="rounded-xl border border-vault-accent/40 bg-vault-accent/10 px-4 py-3 text-sm text-vault-accent" data-testid="action-error">
						<span class="font-semibold">Couldn't save:</span> {actionError}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
