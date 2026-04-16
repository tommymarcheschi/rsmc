<script lang="ts">
	import type { ArbitrageOpportunity, TrendingCard } from '$services/poketrace';
	import type { UndervaluedResult } from '$services/insights';

	let { data } = $props();

	let arbitrage = $derived(data.arbitrage as ArbitrageOpportunity[]);
	let trending = $derived(data.trending as TrendingCard[]);
	let moversUp = $derived(data.moversUp as TrendingCard[]);
	let moversDown = $derived(data.moversDown as TrendingCard[]);
	let undervalued = $derived(data.undervalued as UndervaluedResult);
	let portfolio = $derived(data.portfolio);

	// "undervalued" is the default — it uses our own data (not PokeTrace).
	let insightTab = $state<'undervalued' | 'trending' | 'arbitrage' | 'movers'>('undervalued');
</script>

<svelte:head>
	<title>Insights — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Market Insights</h1>
		<p class="mt-1 text-vault-text-muted">Analytics, trends, and arbitrage opportunities</p>
	</div>

	<!-- Portfolio Summary -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Portfolio Invested</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">${portfolio.totalInvested.toFixed(2)}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.totalCards}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Unique Entries</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.uniqueCards}</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="flex gap-1 rounded-2xl border border-vault-border bg-vault-surface p-1">
		<button
			onclick={() => (insightTab = 'undervalued')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'undervalued' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Undervalued
		</button>
		<button
			onclick={() => (insightTab = 'trending')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'trending' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Trending Cards
		</button>
		<button
			onclick={() => (insightTab = 'arbitrage')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'arbitrage' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			US vs EU Arbitrage
		</button>
		<button
			onclick={() => (insightTab = 'movers')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'movers' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Biggest Movers
		</button>
	</div>

	<!-- Trending Cards Tab -->
	{#if insightTab === 'trending'}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			{#if trending.length > 0}
				<div class="divide-y divide-vault-border">
					{#each trending as card, i}
						<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
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
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-6 py-4">
				<p class="text-sm text-vault-text-muted">
					Cards where CardMarket (EUR) is significantly cheaper than TCGPlayer (USD) — potential savings on cross-market purchases.
				</p>
			</div>
			{#if arbitrage.length > 0}
				<div class="divide-y divide-vault-border">
					{#each arbitrage as opp}
						<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
							{#if opp.image_url}
								<img src={opp.image_url} alt={opp.card_name} class="h-14 w-10 rounded-lg object-cover" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-medium text-white">{opp.card_name}</p>
								<p class="text-xs text-vault-text-muted">{opp.set_name}</p>
							</div>
							<div class="grid grid-cols-3 gap-2 text-right text-xs sm:gap-4 sm:text-sm">
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

	<!-- Undervalued Tab -->
	{#if insightTab === 'undervalued'}
		<div class="space-y-6">
			<div class="rounded-2xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-vault-text-muted">
				<p class="text-white">How much more does a PSA 10 cost than a raw copy?</p>
				<p class="mt-1">
					For every card, we compare its raw → PSA 10 jump to what's typical for its rarity. The two lists below flag cards where the jump is way bigger or way smaller than normal — possible mispricings to investigate. Based on <b>{undervalued.cardsAnalyzed.toLocaleString()}</b> indexed cards across <b>{undervalued.raritiesSampled}</b> rarities.
				</p>
			</div>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Cheap PSA 10 -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface">
					<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
						<h3 class="font-semibold text-vault-green">PSA 10s selling cheap</h3>
						<p class="mt-0.5 text-xs text-vault-text-muted">
							The jump from raw to PSA 10 is smaller than usual for the rarity. A graded copy may be a bargain right now.
						</p>
					</div>
					{#if undervalued.cheapPsa10.length > 0}
						<div class="divide-y divide-vault-border">
							{#each undervalued.cheapPsa10 as row}
								<a href="/card/{row.card_id}" class="flex items-center gap-3 px-3 py-3 transition hover:bg-vault-bg/30 sm:gap-4 sm:px-6 sm:py-4">
									{#if row.image_small_url}
										<img src={row.image_small_url} alt={row.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-white">{row.name}</p>
										<p class="truncate text-xs text-vault-text-muted">{row.set_name} · {row.rarity}</p>
										<p class="mt-0.5 truncate text-xs text-vault-text-muted">
											Raw ${row.raw_nm_price.toFixed(0)} → PSA 10 ${row.psa10_price.toFixed(0)}
										</p>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-bold text-vault-green">
											{row.deviation_pct.toFixed(0)}%
										</p>
										<p class="text-xs text-vault-text-muted">below typical</p>
										<p class="mt-0.5 text-[10px] text-vault-text-muted">
											{row.actual_multiple.toFixed(1)}× vs {row.median_multiple.toFixed(1)}×
										</p>
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
							Not enough indexed cards yet — come back after more sets finish enriching.
						</div>
					{/if}
				</div>

				<!-- Hot PSA 10 -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface">
					<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
						<h3 class="font-semibold text-vault-gold">PSA 10s running hot</h3>
						<p class="mt-0.5 text-xs text-vault-text-muted">
							The jump from raw to PSA 10 is much bigger than usual. Either the graded market is hot, or the raw is still cheap — worth a closer look before grading or buying.
						</p>
					</div>
					{#if undervalued.hotPsa10.length > 0}
						<div class="divide-y divide-vault-border">
							{#each undervalued.hotPsa10 as row}
								<a href="/card/{row.card_id}" class="flex items-center gap-3 px-3 py-3 transition hover:bg-vault-bg/30 sm:gap-4 sm:px-6 sm:py-4">
									{#if row.image_small_url}
										<img src={row.image_small_url} alt={row.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-white">{row.name}</p>
										<p class="truncate text-xs text-vault-text-muted">{row.set_name} · {row.rarity}</p>
										<p class="mt-0.5 truncate text-xs text-vault-text-muted">
											Raw ${row.raw_nm_price.toFixed(0)} → PSA 10 ${row.psa10_price.toFixed(0)}
										</p>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-bold text-vault-gold">
											+{row.deviation_pct.toFixed(0)}%
										</p>
										<p class="text-xs text-vault-text-muted">above typical</p>
										<p class="mt-0.5 text-[10px] text-vault-text-muted">
											{row.actual_multiple.toFixed(1)}× vs {row.median_multiple.toFixed(1)}×
										</p>
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
							Not enough indexed cards yet — come back after more sets finish enriching.
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Biggest Movers Tab -->
	{#if insightTab === 'movers'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Biggest Gainers -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-green">Biggest Gainers</h3>
				</div>
				{#if moversUp.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversUp as card}
							<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6">
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
			<div class="rounded-2xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-red">Biggest Losers</h3>
				</div>
				{#if moversDown.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversDown as card}
							<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6">
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
