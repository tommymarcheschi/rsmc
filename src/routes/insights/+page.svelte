<script lang="ts">
	import type { ArbitrageOpportunity, TrendingCard } from '$services/poketrace';

	let { data } = $props();

	let arbitrage = $derived(data.arbitrage as ArbitrageOpportunity[]);
	let trending = $derived(data.trending as TrendingCard[]);
	let moversUp = $derived(data.moversUp as TrendingCard[]);
	let moversDown = $derived(data.moversDown as TrendingCard[]);
	let portfolio = $derived(data.portfolio);

	let insightTab = $state<'trending' | 'arbitrage' | 'movers'>('trending');
</script>

<svelte:head>
	<title>Insights — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-white">Market Insights</h1>
		<p class="mt-1 text-vault-text-muted">Analytics, trends, and arbitrage opportunities</p>
	</div>

	<!-- Portfolio Summary -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Portfolio Invested</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">${portfolio.totalInvested.toFixed(2)}</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.totalCards}</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Unique Entries</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.uniqueCards}</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="flex gap-1 rounded-lg border border-vault-border bg-vault-surface p-1">
		<button
			onclick={() => (insightTab = 'trending')}
			class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {insightTab === 'trending' ? 'bg-vault-accent text-white' : 'text-vault-text-muted hover:text-white'}"
		>
			Trending Cards
		</button>
		<button
			onclick={() => (insightTab = 'arbitrage')}
			class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {insightTab === 'arbitrage' ? 'bg-vault-accent text-white' : 'text-vault-text-muted hover:text-white'}"
		>
			US vs EU Arbitrage
		</button>
		<button
			onclick={() => (insightTab = 'movers')}
			class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {insightTab === 'movers' ? 'bg-vault-accent text-white' : 'text-vault-text-muted hover:text-white'}"
		>
			Biggest Movers
		</button>
	</div>

	<!-- Trending Cards Tab -->
	{#if insightTab === 'trending'}
		<div class="rounded-xl border border-vault-border bg-vault-surface">
			{#if trending.length > 0}
				<div class="divide-y divide-vault-border">
					{#each trending as card, i}
						<div class="flex items-center gap-4 px-6 py-4">
							<span class="w-6 text-center text-sm font-bold text-vault-text-muted">#{i + 1}</span>
							{#if card.image_url}
								<img src={card.image_url} alt={card.card_name} class="h-14 w-10 rounded-lg object-cover" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-medium text-white">{card.card_name}</p>
								<p class="text-xs text-vault-text-muted">{card.set_name}</p>
							</div>
							<div class="text-right">
								<p class="font-bold text-white">${card.current_price.toFixed(2)}</p>
								<p class="text-sm {card.change_pct >= 0 ? 'text-vault-green' : 'text-vault-red'}">
									{card.change_pct >= 0 ? '+' : ''}{card.change_pct.toFixed(1)}%
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">Trending data not available</p>
						<p class="mt-1 text-sm">Connect your PokeTrace API key for live trending data</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Arbitrage Tab -->
	{#if insightTab === 'arbitrage'}
		<div class="rounded-xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-6 py-4">
				<p class="text-sm text-vault-text-muted">
					Cards where CardMarket (EUR) is significantly cheaper than TCGPlayer (USD) — potential savings on cross-market purchases.
				</p>
			</div>
			{#if arbitrage.length > 0}
				<div class="divide-y divide-vault-border">
					{#each arbitrage as opp}
						<div class="flex items-center gap-4 px-6 py-4">
							{#if opp.image_url}
								<img src={opp.image_url} alt={opp.card_name} class="h-14 w-10 rounded-lg object-cover" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-medium text-white">{opp.card_name}</p>
								<p class="text-xs text-vault-text-muted">{opp.set_name}</p>
							</div>
							<div class="grid grid-cols-3 gap-4 text-right text-sm">
								<div>
									<p class="text-vault-text-muted">TCGPlayer</p>
									<p class="font-semibold text-white">${opp.us_price.toFixed(2)}</p>
								</div>
								<div>
									<p class="text-vault-text-muted">CardMarket</p>
									<p class="font-semibold text-white">€{opp.eu_price.toFixed(2)}</p>
									<p class="text-xs text-vault-text-muted">(~${opp.eu_price_usd.toFixed(2)})</p>
								</div>
								<div>
									<p class="text-vault-text-muted">Savings</p>
									<p class="font-bold text-vault-green">{opp.savings_pct.toFixed(0)}%</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">No arbitrage opportunities found</p>
						<p class="mt-1 text-sm">Connect your PokeTrace API key to see cross-market pricing</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Biggest Movers Tab -->
	{#if insightTab === 'movers'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Biggest Gainers -->
			<div class="rounded-xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-green">Biggest Gainers</h3>
				</div>
				{#if moversUp.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversUp as card}
							<div class="flex items-center gap-4 px-6 py-3">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-white">{card.card_name}</p>
									<p class="text-xs text-vault-text-muted">{card.set_name}</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-bold text-white">${card.current_price.toFixed(2)}</p>
									<p class="text-xs text-vault-green">+{card.change_pct.toFixed(1)}%</p>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-vault-text-muted">No data available</div>
				{/if}
			</div>

			<!-- Biggest Losers -->
			<div class="rounded-xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-red">Biggest Losers</h3>
				</div>
				{#if moversDown.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversDown as card}
							<div class="flex items-center gap-4 px-6 py-3">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-white">{card.card_name}</p>
									<p class="text-xs text-vault-text-muted">{card.set_name}</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-bold text-white">${card.current_price.toFixed(2)}</p>
									<p class="text-xs text-vault-red">{card.change_pct.toFixed(1)}%</p>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-vault-text-muted">No data available</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
