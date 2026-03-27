<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { WatchlistEntry, PokemonCard } from '$types';

	let { data } = $props();

	let entries = $derived(data.entries as WatchlistEntry[]);

	// Card lookup cache
	let cardCache = $state<Record<string, PokemonCard>>({});

	async function lookupCard(cardId: string) {
		if (cardCache[cardId]) return;
		try {
			const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
			if (!res.ok) return;
			const json = await res.json();
			cardCache[cardId] = json.data;
		} catch {
			// silently fail
		}
	}

	$effect(() => {
		for (const entry of entries) {
			if (!cardCache[entry.card_id]) {
				lookupCard(entry.card_id);
			}
		}
	});

	async function removeFromWatchlist(id: string) {
		const res = await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
		if (res.ok) await invalidateAll();
	}

	async function updateTargetPrice(id: string, price: string) {
		const target = price ? parseFloat(price) : null;
		await fetch('/api/watchlist', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, target_price: target })
		});
	}

	async function toggleAlert(id: string, enabled: boolean) {
		await fetch('/api/watchlist', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, alert_enabled: !enabled })
		});
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Watchlist — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Watchlist</h1>
		<p class="mt-1 text-vault-text-muted">
			{entries.length} card{entries.length !== 1 ? 's' : ''} tracked
		</p>
	</div>

	{#if entries.length > 0}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="divide-y divide-vault-border">
				{#each entries as entry (entry.id)}
					{@const card = cardCache[entry.card_id]}
					<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
						{#if card}
							<a href="/card/{card.id}" class="flex-shrink-0">
								<img src={card.images.small} alt={card.name} class="h-20 w-14 rounded-lg object-cover" />
							</a>
						{:else}
							<div class="flex h-20 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-vault-bg text-xs text-vault-text-muted">
								...
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							{#if card}
								<a href="/card/{card.id}" class="font-medium text-white hover:text-vault-purple">{card.name}</a>
								<p class="text-xs text-vault-text-muted">{card.set.name} · #{card.number}</p>
								{#if card.tcgplayer?.prices}
									{@const firstPrice = Object.values(card.tcgplayer.prices)[0]}
									{#if firstPrice?.market}
										<p class="mt-1 text-sm font-semibold text-vault-green">
											Market: ${firstPrice.market.toFixed(2)}
										</p>
									{/if}
								{/if}
							{:else}
								<p class="font-medium text-white">{entry.card_id}</p>
							{/if}
						</div>

						<div class="flex flex-shrink-0 items-center gap-2 sm:gap-3">
							{#if entry.target_price}
								<span class="rounded-lg bg-vault-bg px-3 py-1 text-sm text-vault-gold">
									Target: ${entry.target_price}
								</span>
							{/if}

							<button
								onclick={() => toggleAlert(entry.id, entry.alert_enabled)}
								class="rounded-xl p-2.5 transition-colors {entry.alert_enabled ? 'text-vault-gold hover:text-vault-gold/70' : 'text-vault-text-muted hover:text-white'}"
								aria-label="Toggle alert"
								title={entry.alert_enabled ? 'Alert enabled' : 'Alert disabled'}
							>
								<svg class="h-5 w-5" fill={entry.alert_enabled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
								</svg>
							</button>

							<button
								onclick={() => removeFromWatchlist(entry.id)}
								class="rounded-xl p-2.5 text-vault-text-muted transition-colors hover:bg-vault-red/10 hover:text-vault-red"
								aria-label="Remove from watchlist"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="flex items-center justify-center py-16 text-vault-text-muted">
				<div class="text-center">
					<p class="text-lg">Your watchlist is empty</p>
					<p class="mt-1 text-sm">Add cards from the browser to track their prices!</p>
					<a href="/browse" class="mt-4 inline-block btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40">
						Browse Cards
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
