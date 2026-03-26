<script lang="ts">
	// Watchlist — Cards you're tracking to buy
</script>

<svelte:head>
	<title>Watchlist — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-white">Watchlist</h1>
		<p class="mt-1 text-vault-text-muted">Track cards you want to buy and set price alerts</p>
	</div>

	<div class="rounded-xl border border-vault-border bg-vault-surface">
		<div class="flex items-center justify-center py-16 text-vault-text-muted">
			<div class="text-center">
				<p class="text-lg">Your watchlist is empty</p>
				<p class="mt-1 text-sm">Add cards from the browser to track their prices!</p>
				<a href="/browse" class="mt-4 inline-block rounded-lg bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover">
					Browse Cards
				</a>
			</div>
		</div>
	</div>
</div>
