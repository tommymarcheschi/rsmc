<script lang="ts">
	// Insights — Market analytics, arbitrage, trends
</script>

<svelte:head>
	<title>Insights — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-white">Market Insights</h1>
		<p class="mt-1 text-vault-text-muted">Analytics, trends, and arbitrage opportunities</p>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Trending Cards</h2>
			<p class="mt-2 text-sm text-vault-text-muted">Biggest price movers this week</p>
			<div class="mt-4 flex items-center justify-center py-8 text-vault-text-muted">
				<p class="text-sm">Coming in Phase 4</p>
			</div>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">US vs EU Arbitrage</h2>
			<p class="mt-2 text-sm text-vault-text-muted">Cards cheaper on CardMarket vs TCGPlayer</p>
			<div class="mt-4 flex items-center justify-center py-8 text-vault-text-muted">
				<p class="text-sm">Coming in Phase 2C</p>
			</div>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Portfolio Performance</h2>
			<p class="mt-2 text-sm text-vault-text-muted">Your collection value over time</p>
			<div class="mt-4 flex items-center justify-center py-8 text-vault-text-muted">
				<p class="text-sm">Coming in Phase 2B</p>
			</div>
		</div>
	</div>
</div>
