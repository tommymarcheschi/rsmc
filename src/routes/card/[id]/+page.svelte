<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { PriceChart } from '$components';
	import type { PokedexData, EvolutionNode } from '$types';
	import type { PokeTracePrice } from '$services/poketrace';
	import type { GradedPrice } from '$services/price-tracker';
	import type { PriceHistory } from '$services/price-tracker';
	import type { EbaySoldResult } from '$services/ebay-scraper';
	import type { PSAPopData } from '$services/psa-scraper';

	let { data } = $props();

	let card = $derived(data.card);
	let pokedexData = $derived(data.pokedexData as PokedexData | null);
	let evolutionChain = $derived(data.evolutionChain as EvolutionNode[] | null);
	let poketracePrice = $derived(data.poketracePrice as PokeTracePrice | null);
	let gradedPrices = $derived(data.gradedPrices as GradedPrice[]);
	let priceHistory = $derived(data.priceHistory as PriceHistory | null);
	let ebaySold = $derived(data.ebaySold as EbaySoldResult);
	let psaPop = $derived(data.psaPop as PSAPopData | null);

	let addedToCollection = $state(false);
	let addedToWatchlist = $state(false);
	let actionLoading = $state('');
	let priceTab = $state<'raw' | 'graded'>('raw');

	async function addToCollection() {
		actionLoading = 'collection';
		try {
			const res = await fetch('/api/collection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ card_id: card.id, quantity: 1, condition: 'NM' })
			});
			if (res.ok) addedToCollection = true;
		} finally {
			actionLoading = '';
		}
	}

	async function addToWatchlist() {
		actionLoading = 'watchlist';
		try {
			const res = await fetch('/api/watchlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ card_id: card.id })
			});
			if (res.ok) addedToWatchlist = true;
		} finally {
			actionLoading = '';
		}
	}

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

			<!-- Actions -->
			<div class="flex gap-3">
				<button onclick={addToCollection} disabled={actionLoading === 'collection'} class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40 disabled:opacity-50">
					{#if addedToCollection}Added!{:else if actionLoading === 'collection'}Adding...{:else}Add to Collection{/if}
				</button>
				<button onclick={addToWatchlist} disabled={actionLoading === 'watchlist'} class="btn-press rounded-xl border border-vault-border px-6 py-2.5 text-sm font-medium text-vault-text transition-all hover:border-vault-purple/50 hover:bg-vault-surface-hover disabled:opacity-50">
					{#if addedToWatchlist}Watching!{:else if actionLoading === 'watchlist'}Adding...{:else}Add to Watchlist{/if}
				</button>
			</div>
		</div>
	</div>
</div>
