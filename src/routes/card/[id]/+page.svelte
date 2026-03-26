<script lang="ts">
	import { page } from '$app/stores';

	// Card Detail — Full card data, prices, history, PokéAPI enrichment
	const cardId = $derived($page.params.id);
</script>

<svelte:head>
	<title>Card Detail — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<a href="/browse" class="inline-flex items-center gap-2 text-sm text-vault-accent hover:underline">
		← Back to Browse
	</a>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<!-- Card Image -->
		<div class="flex items-start justify-center lg:col-span-1">
			<div class="w-full max-w-sm rounded-xl border border-vault-border bg-vault-surface p-4">
				<div class="flex aspect-[2.5/3.5] items-center justify-center rounded-lg bg-vault-bg text-vault-text-muted">
					Card image for: {cardId}
				</div>
			</div>
		</div>

		<!-- Card Details -->
		<div class="space-y-6 lg:col-span-2">
			<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
				<h1 class="text-2xl font-bold text-white">Card Name</h1>
				<p class="mt-1 text-vault-text-muted">Set Name · #000 · Rarity</p>
				<div class="mt-4 grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-vault-text-muted">HP:</span>
						<span class="ml-2 text-white">—</span>
					</div>
					<div>
						<span class="text-vault-text-muted">Type:</span>
						<span class="ml-2 text-white">—</span>
					</div>
					<div>
						<span class="text-vault-text-muted">Artist:</span>
						<span class="ml-2 text-white">—</span>
					</div>
					<div>
						<span class="text-vault-text-muted">Supertype:</span>
						<span class="ml-2 text-white">—</span>
					</div>
				</div>
			</div>

			<!-- Pricing Panel -->
			<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Market Prices</h2>
				<p class="mt-4 text-sm text-vault-text-muted">
					Live pricing will be connected in Phase 2A (PokeTrace integration).
				</p>
			</div>

			<!-- Actions -->
			<div class="flex gap-3">
				<button class="rounded-lg bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover">
					Add to Collection
				</button>
				<button class="rounded-lg border border-vault-border px-4 py-2 text-sm font-medium text-vault-text transition-colors hover:bg-vault-surface-hover">
					Add to Watchlist
				</button>
			</div>
		</div>
	</div>
</div>
