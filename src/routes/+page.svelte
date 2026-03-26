<script lang="ts">
	// Dashboard — Portfolio overview, alerts, quick stats
</script>

<svelte:head>
	<title>PokéVault — Dashboard</title>
</svelte:head>

<div class="space-y-8">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold text-white">Dashboard</h1>
		<p class="mt-1 text-vault-text-muted">Your Pokémon TCG portfolio at a glance</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Collection Value</p>
			<p class="mt-2 text-3xl font-bold text-white">$0.00</p>
			<p class="mt-1 text-sm text-vault-green">+0.0% today</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-2 text-3xl font-bold text-white">0</p>
			<p class="mt-1 text-sm text-vault-text-muted">across 0 sets</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Watchlist</p>
			<p class="mt-2 text-3xl font-bold text-white">0</p>
			<p class="mt-1 text-sm text-vault-text-muted">cards tracked</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Grading Queue</p>
			<p class="mt-2 text-3xl font-bold text-white">0</p>
			<p class="mt-1 text-sm text-vault-gold">0 pending return</p>
		</div>
	</div>

	<!-- Recent Activity + Price Movers -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Recent Activity</h2>
			<div class="mt-4 flex items-center justify-center py-12 text-vault-text-muted">
				<p>No activity yet. Start by browsing cards!</p>
			</div>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Top Movers</h2>
			<div class="mt-4 flex items-center justify-center py-12 text-vault-text-muted">
				<p>Price data will appear once APIs are connected.</p>
			</div>
		</div>
	</div>
</div>
