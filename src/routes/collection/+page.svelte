<script lang="ts">
	// Collection Manager — Owned cards, quantities, conditions
</script>

<svelte:head>
	<title>My Collection — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-white">My Collection</h1>
			<p class="mt-1 text-vault-text-muted">Track every card you own</p>
		</div>
		<button class="rounded-lg bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover">
			+ Add Card
		</button>
	</div>

	<!-- Summary -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">0</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Estimated Value</p>
			<p class="mt-1 text-2xl font-bold text-vault-green">$0.00</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Invested</p>
			<p class="mt-1 text-2xl font-bold text-white">$0.00</p>
		</div>
	</div>

	<!-- Collection Table -->
	<div class="rounded-xl border border-vault-border bg-vault-surface">
		<div class="border-b border-vault-border px-6 py-4">
			<input
				type="text"
				placeholder="Search your collection..."
				class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-accent focus:outline-none"
			/>
		</div>
		<div class="flex items-center justify-center py-16 text-vault-text-muted">
			<div class="text-center">
				<p class="text-lg">No cards in your collection yet</p>
				<p class="mt-1 text-sm">Browse cards and add them to start tracking!</p>
				<a href="/browse" class="mt-4 inline-block rounded-lg bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover">
					Browse Cards
				</a>
			</div>
		</div>
	</div>
</div>
