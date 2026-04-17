<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Icon } from '$components';
	import type { WatchlistEntry, PokemonCard } from '$types';

	interface Valuation {
		current_nm: number | null;
		current_source: 'pricecharting' | 'tcgplayer' | null;
		triggered: boolean;
		distance_pct: number | null;
	}

	let { data } = $props();

	let entries = $derived(data.entries as WatchlistEntry[]);
	let cardCache = $derived(data.cardCache as Record<string, PokemonCard>);
	let valuationByEntry = $derived(
		((data as Record<string, unknown>).valuationByEntry ?? {}) as Record<string, Valuation>
	);
	let triggeredCount = $derived(((data as Record<string, unknown>).triggeredCount ?? 0) as number);

	// Sort so triggered entries rise to the top. Within each group, keep
	// the server's created_at order (newest-first).
	let sortedEntries = $derived(
		[...entries].sort((a, b) => {
			const aTrig = valuationByEntry[a.id]?.triggered ? 1 : 0;
			const bTrig = valuationByEntry[b.id]?.triggered ? 1 : 0;
			return bTrig - aTrig;
		})
	);

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
		await invalidateAll();
	}

	async function toggleAlert(id: string, enabled: boolean) {
		await fetch('/api/watchlist', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, alert_enabled: !enabled })
		});
		await invalidateAll();
	}

	function fmtMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>Watchlist — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Watchlist</h1>
			<p class="mt-1 text-vault-text-muted">
				{entries.length} card{entries.length !== 1 ? 's' : ''} tracked · triggered alerts rise to the top
			</p>
		</div>
		{#if triggeredCount > 0}
			<span class="rounded-xl border border-vault-green/40 bg-vault-green/10 px-3 py-2 text-sm font-medium text-vault-green">
				🔔 {triggeredCount} triggered
			</span>
		{/if}
	</div>

	{#if sortedEntries.length > 0}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="divide-y divide-vault-border">
				{#each sortedEntries as entry (entry.id)}
					{@const card = cardCache[entry.card_id]}
					{@const val = valuationByEntry[entry.id]}
					<div class="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-4 {val?.triggered ? 'bg-vault-green/5' : ''}">
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
							<div class="flex items-center gap-2">
								{#if card}
									<a href="/card/{card.id}" class="font-medium text-white hover:text-vault-purple">{card.name}</a>
								{:else}
									<p class="font-medium text-white">{entry.card_id}</p>
								{/if}
								{#if val?.triggered}
									<span class="rounded-full bg-vault-green/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-vault-green">Triggered</span>
								{/if}
							</div>
							{#if card}
								<p class="text-xs text-vault-text-muted">{card.set.name} · #{card.number}</p>
							{/if}
							<div class="mt-1 flex flex-wrap items-baseline gap-3 text-sm">
								{#if val?.current_nm != null}
									<span class="font-semibold {val.triggered ? 'text-vault-green' : 'text-white'}">
										{fmtMoney(val.current_nm)}
									</span>
									<span class="text-[11px] text-vault-text-muted">
										{val.current_source === 'pricecharting' ? 'PriceCharting NM' : 'TCGPlayer market'}
									</span>
								{:else}
									<span class="text-[11px] text-vault-text-muted">No current price yet</span>
								{/if}
								{#if entry.target_price != null && val?.distance_pct != null}
									<span class="text-[11px] {val.triggered ? 'text-vault-green' : 'text-vault-text-muted'}">
										{val.distance_pct >= 0 ? '+' : ''}{val.distance_pct.toFixed(1)}% vs target
									</span>
								{/if}
							</div>
						</div>

						<div class="flex flex-shrink-0 items-center gap-2 sm:gap-3">
							<div class="flex items-center gap-1">
								<label for="target-{entry.id}" class="text-[10px] uppercase text-vault-text-muted">Target</label>
								<input
									id="target-{entry.id}"
									type="number"
									step="0.01"
									min="0"
									value={entry.target_price ?? ''}
									placeholder="—"
									onchange={(e) => updateTargetPrice(entry.id, (e.currentTarget as HTMLInputElement).value)}
									class="w-20 rounded-lg border border-vault-border bg-vault-bg px-2 py-1 text-sm text-vault-gold focus:border-vault-purple focus:outline-none"
								/>
							</div>

							<button
								onclick={() => toggleAlert(entry.id, entry.alert_enabled)}
								class="rounded-xl p-2.5 transition-colors {entry.alert_enabled ? 'text-vault-gold hover:text-vault-gold/70' : 'text-vault-text-muted hover:text-white'}"
								aria-label="Toggle alert"
								title={entry.alert_enabled ? 'Alert enabled' : 'Alert disabled'}
							>
								<Icon name="bell" class="h-5 w-5" solid={entry.alert_enabled} />
							</button>

							<button
								onclick={() => removeFromWatchlist(entry.id)}
								class="rounded-xl p-2.5 text-vault-text-muted transition-colors hover:bg-vault-red/10 hover:text-vault-red"
								aria-label="Remove from watchlist"
							>
								<Icon name="close" class="h-4 w-4" />
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
