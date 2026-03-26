<script lang="ts">
	import { goto } from '$app/navigation';
	import ComparisonChart from '$lib/components/ComparisonChart.svelte';
	import {
		analyzeComps,
		scoreCardValue,
		detectTrend,
		generateSimulatedHistory,
		getMarketPrice,
		type ValueScore,
		type CompAnalysis,
		type TrendSignal
	} from '$services/analytics';
	import type { PokemonCard } from '$types';

	let { data } = $props();

	let activeTab = $state<'scanner' | 'compare' | 'comps'>('scanner');

	// ─── Value Scanner state ─────────────────────────────
	let undervalued = $derived(data.undervalued as ValueScore[]);

	// ─── Comp Analysis state ─────────────────────────────
	let compSearch = $state(data.compName ?? '');
	let compCards = $derived(data.compCards as PokemonCard[]);
	let compAnalysis = $derived(analyzeComps(compCards));

	function searchComps(e: Event) {
		e.preventDefault();
		if (compSearch.trim()) {
			goto(`/analytics?comp=${encodeURIComponent(compSearch.trim())}`, { invalidateAll: true });
		}
	}

	// ─── Card Compare state ──────────────────────────────
	let compareSearch = $state('');
	let compareCards = $state<PokemonCard[]>([]);
	let compareSearchResults = $state<PokemonCard[]>([]);
	let searchLoading = $state(false);
	let chartNormalized = $state(false);

	let compareDatasets = $derived(
		compareCards.map((card, i) => {
			const history = generateSimulatedHistory(card, 90);
			const colors = ['#a78bfa', '#ff5757', '#34d399', '#fbbf24', '#22d3ee', '#f472b6', '#fb923c', '#60a5fa'];
			return {
				label: `${card.name} (${card.set?.name ?? 'Unknown'})`,
				prices: history.map((p) => p.price),
				dates: history.map((p) => p.date),
				color: colors[i % colors.length]
			};
		})
	);

	let compareTrends = $derived(
		compareCards.map((card) => {
			const history = generateSimulatedHistory(card, 90);
			return { card, trend: detectTrend(history) };
		})
	);

	async function searchCompareCards(e: Event) {
		e.preventDefault();
		if (!compareSearch.trim() || searchLoading) return;
		searchLoading = true;
		try {
			const res = await fetch(`/api/cards?q=${encodeURIComponent(`name:"${compareSearch.trim}"`)}&pageSize=12`);
			const json = await res.json();
			compareSearchResults = json.data ?? [];
		} catch {
			// Fallback: search via page navigation
			const res = await fetch(`/api/cards?q=${encodeURIComponent(compareSearch.trim())}&pageSize=12`);
			const json = await res.json();
			compareSearchResults = json.data ?? [];
		}
		searchLoading = false;
	}

	function addToCompare(card: PokemonCard) {
		if (compareCards.length >= 8) return;
		if (compareCards.some((c) => c.id === card.id)) return;
		compareCards = [...compareCards, card];
		compareSearchResults = [];
		compareSearch = '';
	}

	function removeFromCompare(cardId: string) {
		compareCards = compareCards.filter((c) => c.id !== cardId);
	}

	// Score color helper
	function scoreColor(score: number): string {
		if (score >= 70) return 'text-vault-green';
		if (score >= 50) return 'text-vault-gold';
		return 'text-vault-red';
	}

	function signalBadge(signal: string): string {
		if (signal === 'undervalued') return 'bg-vault-green/20 text-vault-green';
		if (signal === 'overvalued') return 'bg-vault-red/20 text-vault-red';
		return 'bg-vault-purple/20 text-vault-purple';
	}

	function trendIcon(direction: string): string {
		if (direction === 'rising') return '↗';
		if (direction === 'falling') return '↘';
		if (direction === 'volatile') return '↕';
		return '→';
	}

	function trendColor(direction: string): string {
		if (direction === 'rising') return 'text-vault-green';
		if (direction === 'falling') return 'text-vault-red';
		if (direction === 'volatile') return 'text-vault-gold';
		return 'text-vault-text-muted';
	}
</script>

<svelte:head>
	<title>Analytics — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Analytics</h1>
		<p class="mt-1 text-vault-text-muted">Spot undervalued cards, compare prices, and analyze trends</p>
	</div>

	<!-- Tab Navigation -->
	<div class="flex gap-1 rounded-2xl border border-vault-border bg-vault-surface p-1">
		<button
			onclick={() => (activeTab = 'scanner')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {activeTab === 'scanner' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Value Scanner
		</button>
		<button
			onclick={() => (activeTab = 'compare')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {activeTab === 'compare' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Card Compare
		</button>
		<button
			onclick={() => (activeTab = 'comps')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {activeTab === 'comps' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Comp Analysis
		</button>
	</div>

	<!-- ═══ VALUE SCANNER TAB ═══ -->
	{#if activeTab === 'scanner'}
		<div class="space-y-4">
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-lg font-semibold text-white">Undervalued Cards</h2>
						<p class="text-sm text-vault-text-muted">Cards scored by rarity, set age, price spread, and collector demand</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-vault-text-muted">Score Legend:</span>
						<span class="rounded-full bg-vault-green/20 px-2 py-0.5 text-xs text-vault-green">70+ Undervalued</span>
						<span class="rounded-full bg-vault-gold/20 px-2 py-0.5 text-xs text-vault-gold">50-69 Fair</span>
					</div>
				</div>
			</div>

			{#if undervalued.length > 0}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each undervalued as vs}
						<a
							href="/card/{vs.card.id}"
							class="card-glow group rounded-2xl border border-vault-border bg-vault-surface p-4 transition-all hover:-translate-y-1 hover:border-vault-purple/40"
						>
							<div class="flex gap-3">
								<img
									src={vs.card.images.small}
									alt={vs.card.name}
									class="h-24 w-[68px] rounded-lg object-cover transition-transform group-hover:scale-105"
									loading="lazy"
								/>
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="truncate font-medium text-white">{vs.card.name}</p>
											<p class="truncate text-xs text-vault-text-muted">{vs.card.set?.name}</p>
										</div>
										<div class="flex flex-col items-end gap-1">
											<span class="text-lg font-bold {scoreColor(vs.score)}">{vs.score}</span>
											<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {signalBadge(vs.signal)}">{vs.signal}</span>
										</div>
									</div>
									<div class="mt-2 flex items-baseline gap-2">
										<span class="text-sm font-bold text-vault-gold">${vs.marketPrice.toFixed(2)}</span>
										{#if vs.card.rarity}
											<span class="text-xs text-vault-text-muted">{vs.card.rarity}</span>
										{/if}
									</div>
								</div>
							</div>

							<!-- Value factors -->
							{#if vs.factors.length > 0}
								<div class="mt-3 space-y-1 border-t border-vault-border pt-3">
									{#each vs.factors.slice(0, 2) as factor}
										<div class="flex items-center gap-2 text-xs">
											<span class="font-mono {factor.impact > 0 ? 'text-vault-green' : 'text-vault-red'}">
												{factor.impact > 0 ? '+' : ''}{factor.impact}
											</span>
											<span class="text-vault-text-muted">{factor.name}</span>
										</div>
									{/each}
								</div>
							{/if}
						</a>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16">
					<div class="text-center text-vault-text-muted">
						<p class="text-lg">No cards to analyze</p>
						<p class="mt-1 text-sm">Try browsing cards first to populate data</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ═══ CARD COMPARE TAB ═══ -->
	{#if activeTab === 'compare'}
		<div class="space-y-4">
			<!-- Search to add cards -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
				<h2 class="text-lg font-semibold text-white">Compare Cards</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Overlay price trends for up to 8 cards to spot patterns and divergences</p>

				<form onsubmit={searchCompareCards} class="mt-4 flex gap-2">
					<input
						type="text"
						bind:value={compareSearch}
						placeholder="Search for a card to add..."
						class="flex-1 rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
					/>
					<button
						type="submit"
						disabled={searchLoading}
						class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-xl disabled:opacity-50"
					>
						{searchLoading ? 'Searching...' : 'Search'}
					</button>
				</form>

				<!-- Search results -->
				{#if compareSearchResults.length > 0}
					<div class="mt-3 max-h-60 divide-y divide-vault-border overflow-y-auto rounded-xl border border-vault-border bg-vault-bg">
						{#each compareSearchResults as card}
							{@const price = getMarketPrice(card)}
							<button
								onclick={() => addToCompare(card)}
								disabled={compareCards.some((c) => c.id === card.id) || compareCards.length >= 8}
								class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-vault-surface-hover disabled:opacity-40"
							>
								<img src={card.images.small} alt={card.name} class="h-12 w-9 rounded object-cover" loading="lazy" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-white">{card.name}</p>
									<p class="truncate text-xs text-vault-text-muted">{card.set?.name} &middot; {card.rarity ?? 'Unknown'}</p>
								</div>
								{#if price > 0}
									<span class="text-sm font-bold text-vault-gold">${price.toFixed(2)}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Selected cards -->
			{#if compareCards.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each compareCards as card, i}
						{@const colors = ['bg-purple-500/20 text-purple-300', 'bg-red-500/20 text-red-300', 'bg-green-500/20 text-green-300', 'bg-yellow-500/20 text-yellow-300', 'bg-cyan-500/20 text-cyan-300', 'bg-pink-500/20 text-pink-300', 'bg-orange-500/20 text-orange-300', 'bg-blue-500/20 text-blue-300']}
						<span class="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium {colors[i % colors.length]}">
							{card.name}
							<button onclick={() => removeFromCompare(card.id)} class="hover:text-white">&times;</button>
						</span>
					{/each}
				</div>

				<!-- Chart controls -->
				<div class="flex items-center gap-3">
					<label class="flex cursor-pointer items-center gap-2 text-sm text-vault-text-muted">
						<input
							type="checkbox"
							bind:checked={chartNormalized}
							class="h-4 w-4 rounded border-vault-border bg-vault-bg accent-vault-purple"
						/>
						Normalize (% change)
					</label>
					<span class="text-xs text-vault-text-muted">
						{chartNormalized ? 'Showing relative performance from first data point' : 'Showing absolute prices'}
					</span>
				</div>

				<!-- Comparison chart -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					{#key `${compareCards.map(c => c.id).join('-')}-${chartNormalized}`}
						<ComparisonChart
							datasets={compareDatasets}
							height={350}
							normalized={chartNormalized}
						/>
					{/key}
				</div>

				<!-- Trend signals -->
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each compareTrends as { card, trend }}
						<div class="rounded-2xl border border-vault-border bg-vault-surface p-4">
							<p class="truncate text-sm font-medium text-white">{card.name}</p>
							<p class="truncate text-xs text-vault-text-muted">{card.set?.name}</p>
							<div class="mt-3 flex items-center gap-2">
								<span class="text-2xl {trendColor(trend.direction)}">{trendIcon(trend.direction)}</span>
								<div>
									<p class="text-sm font-semibold {trendColor(trend.direction)} capitalize">{trend.direction}</p>
									<p class="text-xs text-vault-text-muted">Strength: {trend.strength}%</p>
								</div>
							</div>
							<div class="mt-2 grid grid-cols-2 gap-2 text-xs">
								<div>
									<p class="text-vault-text-muted">7d Avg</p>
									<p class="font-medium text-white">${trend.movingAvg7d.toFixed(2)}</p>
								</div>
								<div>
									<p class="text-vault-text-muted">30d Avg</p>
									<p class="font-medium text-white">${trend.movingAvg30d.toFixed(2)}</p>
								</div>
							</div>
							<p class="mt-2 text-[10px] text-vault-text-muted">{trend.description}</p>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16">
					<div class="text-center text-vault-text-muted">
						<p class="text-lg">No cards selected</p>
						<p class="mt-1 text-sm">Search and add cards above to overlay their price charts</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ═══ COMP ANALYSIS TAB ═══ -->
	{#if activeTab === 'comps'}
		<div class="space-y-4">
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
				<h2 class="text-lg font-semibold text-white">Comp Analysis</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Compare all printings of a Pokémon across sets — find the cheapest version or spot pricing anomalies</p>

				<form onsubmit={searchComps} class="mt-4 flex gap-2">
					<input
						type="text"
						bind:value={compSearch}
						placeholder="Enter Pokémon name (e.g. Charizard, Pikachu)..."
						class="flex-1 rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
					/>
					<button
						type="submit"
						class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-xl"
					>
						Analyze
					</button>
				</form>
			</div>

			{#if compAnalysis}
				<!-- Comp summary stats -->
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
						<p class="text-sm text-vault-text-muted">Printings Found</p>
						<p class="mt-1 text-2xl font-bold text-white">{compAnalysis.printings.length}</p>
					</div>
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
						<p class="text-sm text-vault-text-muted">Average Price</p>
						<p class="mt-1 text-2xl font-bold text-vault-gold">${compAnalysis.averagePrice.toFixed(2)}</p>
					</div>
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
						<p class="text-sm text-vault-text-muted">Cheapest</p>
						<p class="mt-1 text-2xl font-bold text-vault-green">${compAnalysis.cheapest?.marketPrice.toFixed(2) ?? '—'}</p>
					</div>
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
						<p class="text-sm text-vault-text-muted">Most Expensive</p>
						<p class="mt-1 text-2xl font-bold text-vault-accent">${compAnalysis.mostExpensive?.marketPrice.toFixed(2) ?? '—'}</p>
					</div>
				</div>

				<!-- Price overlay chart for all printings -->
				{@const compDatasets = compAnalysis.printings.slice(0, 8).map((p, i) => {
					const history = generateSimulatedHistory(p.card, 90);
					const colors = ['#a78bfa', '#ff5757', '#34d399', '#fbbf24', '#22d3ee', '#f472b6', '#fb923c', '#60a5fa'];
					return {
						label: `${p.set} (${p.rarity})`,
						prices: history.map((h) => h.price),
						dates: history.map((h) => h.date),
						color: colors[i % colors.length]
					};
				})}
				{#if compDatasets.length > 1}
					<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
						<h3 class="mb-4 text-sm font-semibold text-vault-text-muted">Price Trends Overlay — Top {compDatasets.length} Printings</h3>
						{#key compAnalysis.pokemonName}
							<ComparisonChart datasets={compDatasets} height={300} />
						{/key}
					</div>
				{/if}

				<!-- All printings list -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface">
					<div class="border-b border-vault-border px-4 py-3 sm:px-6">
						<h3 class="font-semibold text-white">All Printings</h3>
					</div>
					<div class="divide-y divide-vault-border">
						{#each compAnalysis.printings as printing}
							<a
								href="/card/{printing.card.id}"
								class="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-vault-surface-hover sm:gap-4 sm:px-6"
							>
								<img
									src={printing.card.images.small}
									alt={printing.card.name}
									class="h-16 w-[46px] rounded-lg object-cover"
									loading="lazy"
								/>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium text-white">{printing.card.name}</p>
									<p class="text-xs text-vault-text-muted">
										{printing.set} &middot; {printing.rarity}
										{#if printing.releaseDate}
											&middot; {new Date(printing.releaseDate).getFullYear()}
										{/if}
									</p>
								</div>
								<div class="text-right">
									<p class="font-bold text-vault-gold">${printing.marketPrice.toFixed(2)}</p>
									<p class="text-xs {printing.vsAverage < 0 ? 'text-vault-green' : printing.vsAverage > 0 ? 'text-vault-red' : 'text-vault-text-muted'}">
										{printing.vsAverage > 0 ? '+' : ''}{printing.vsAverage.toFixed(0)}% vs avg
									</p>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{:else if data.compName}
				<div class="flex items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16">
					<div class="text-center text-vault-text-muted">
						<p class="text-lg">No printings found with prices</p>
						<p class="mt-1 text-sm">Try a different Pokémon name</p>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16">
					<div class="text-center text-vault-text-muted">
						<p class="text-lg">Enter a Pokémon name above</p>
						<p class="mt-1 text-sm">See all printings, average prices, and price comparison across sets</p>
						<div class="mt-4 flex flex-wrap justify-center gap-2">
							{#each ['Charizard', 'Pikachu', 'Mewtwo', 'Umbreon', 'Rayquaza', 'Gengar'] as suggestion}
								<button
									onclick={() => { compSearch = suggestion; goto(`/analytics?comp=${suggestion}`, { invalidateAll: true }); }}
									class="btn-press rounded-full border border-vault-border bg-vault-bg px-3 py-1.5 text-xs text-vault-text-muted transition-colors hover:border-vault-purple hover:text-white"
								>
									{suggestion}
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
