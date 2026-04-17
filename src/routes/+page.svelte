<script lang="ts">
	interface TriggeredAlert { id: string; card_id: string; name: string; image: string | null; current: number; target: number; delta_pct: number; }
	interface RisingRow { card_id: string; name: string; set_name: string; image_small_url: string | null; recent_median: number; prior_median: number; delta_pct: number; }
	interface Attention { triggeredAlerts: TriggeredAlert[]; triggeredAlertsTotal: number; rising: RisingRow[]; }

	let { data } = $props();
	let stats = $derived(data.stats);
	let topHoldings = $derived(data.topHoldings as { card_id: string; name: string; quantity: number; marketPrice: number; totalValue: number; imageUrl: string; gainLoss: number }[]);
	let attention = $derived(((data as Record<string, unknown>).attention ?? { triggeredAlerts: [], triggeredAlertsTotal: 0, rising: [] }) as Attention);

	function fmtMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>Trove — Dashboard</title>
</svelte:head>

<div class="space-y-6 sm:space-y-8">
	<!-- Header with gradient -->
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Dashboard</h1>
		<p class="mt-1 text-sm text-vault-text-muted sm:text-base">Your Pokémon TCG portfolio at a glance</p>
	</div>

	<!-- Portfolio Value Banner -->
	{#if stats.portfolioValue > 0}
		<div class="rounded-2xl border border-vault-border bg-gradient-to-r from-vault-surface to-vault-bg p-4 sm:p-6">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-sm text-vault-text-muted">Portfolio Market Value</p>
					<p class="mt-1 text-3xl font-bold text-white sm:text-4xl">${stats.portfolioValue.toFixed(2)}</p>
					<div class="mt-1 flex items-center gap-3 text-sm">
						<span class="text-vault-text-muted">Cost basis: ${stats.totalInvested.toFixed(2)}</span>
						<span class="{stats.gainLoss >= 0 ? 'text-vault-green' : 'text-vault-red'} font-semibold">
							{stats.gainLoss >= 0 ? '+' : ''}{stats.gainLossPct.toFixed(1)}%
							({stats.gainLoss >= 0 ? '+' : ''}${stats.gainLoss.toFixed(2)})
						</span>
					</div>
				</div>
				<div class="flex gap-2">
					<a href="/analytics" class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-purple px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20">
						View Analytics
					</a>
				</div>
			</div>
		</div>
	{/if}

	<!-- Attention — daily check-in: triggered alerts + hot movers -->
	{#if attention.triggeredAlerts.length > 0 || attention.rising.length > 0}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{#if attention.triggeredAlerts.length > 0}
				<div class="rounded-2xl border border-vault-green/40 bg-vault-green/5 p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-lg font-semibold text-vault-green">🔔 Triggered alerts</h2>
							<p class="mt-0.5 text-xs text-vault-text-muted">Watched cards that hit your target</p>
						</div>
						{#if attention.triggeredAlertsTotal > 5}
							<a href="/watchlist" class="text-xs text-vault-green hover:underline">View all {attention.triggeredAlertsTotal}</a>
						{/if}
					</div>
					<div class="mt-3 divide-y divide-vault-green/10">
						{#each attention.triggeredAlerts as alert}
							<a href="/card/{alert.card_id}" class="flex items-center gap-3 py-2 transition hover:bg-vault-green/5">
								{#if alert.image}
									<img src={alert.image} alt={alert.name} class="h-12 w-9 rounded object-cover" loading="lazy" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-white">{alert.name}</p>
									<p class="text-[11px] text-vault-text-muted">
										{fmtMoney(alert.current)} · target {fmtMoney(alert.target)}
									</p>
								</div>
								<span class="text-sm font-bold text-vault-green">{alert.delta_pct >= 0 ? '+' : ''}{alert.delta_pct.toFixed(1)}%</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			{#if attention.rising.length > 0}
				<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-lg font-semibold text-white">📈 Rising PSA 10</h2>
							<p class="mt-0.5 text-xs text-vault-text-muted">Biggest PSA 10 median jumps — last 30d vs prior month</p>
						</div>
						<a href="/insights" class="text-xs text-vault-purple hover:underline">More →</a>
					</div>
					<div class="mt-3 divide-y divide-vault-border">
						{#each attention.rising as row}
							<a href="/card/{row.card_id}" class="flex items-center gap-3 py-2 transition hover:bg-vault-bg/50">
								{#if row.image_small_url}
									<img src={row.image_small_url} alt={row.name} class="h-12 w-9 rounded object-cover" loading="lazy" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-white">{row.name}</p>
									<p class="text-[11px] text-vault-text-muted">
										{fmtMoney(row.prior_median)} → {fmtMoney(row.recent_median)}
									</p>
								</div>
								<span class="text-sm font-bold text-vault-green">+{row.delta_pct.toFixed(0)}%</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Stats Grid -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<div class="flex items-center justify-between">
				<p class="text-sm text-vault-text-muted">Total Invested</p>
				<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-gold/10">
					<svg class="h-5 w-5 text-vault-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
			</div>
			<p class="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl text-vault-gold">${stats.totalInvested.toFixed(2)}</p>
			<p class="mt-1 text-sm text-vault-text-muted">purchase cost basis</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<div class="flex items-center justify-between">
				<p class="text-sm text-vault-text-muted">Total Cards</p>
				<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-purple/10">
					<svg class="h-5 w-5 text-vault-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
				</div>
			</div>
			<p class="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl text-white">{stats.totalCards}</p>
			<p class="mt-1 text-sm text-vault-text-muted">across {stats.uniqueSets} sets</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<div class="flex items-center justify-between">
				<p class="text-sm text-vault-text-muted">Watchlist</p>
				<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-cyan/10">
					<svg class="h-5 w-5 text-vault-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
					</svg>
				</div>
			</div>
			<p class="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl text-white">{stats.watchlistCount}</p>
			<p class="mt-1 text-sm text-vault-text-muted">cards tracked</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<div class="flex items-center justify-between">
				<p class="text-sm text-vault-text-muted">Grading Queue</p>
				<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-accent/10">
					<svg class="h-5 w-5 text-vault-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
					</svg>
				</div>
			</div>
			<p class="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl text-white">{stats.gradingPending}</p>
			<p class="mt-1 text-sm text-vault-gold">{stats.gradingPending} pending return</p>
		</div>
	</div>

	<!-- Top Holdings -->
	{#if topHoldings.length > 0}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="flex items-center justify-between border-b border-vault-border px-4 py-3 sm:px-6">
				<h2 class="font-semibold text-white">Top Holdings</h2>
				<a href="/collection" class="text-xs text-vault-purple hover:text-vault-purple-hover">View all</a>
			</div>
			<div class="divide-y divide-vault-border">
				{#each topHoldings as holding}
					<a href="/card/{holding.card_id}" class="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-vault-surface-hover sm:gap-4 sm:px-6">
						<img src={holding.imageUrl} alt={holding.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-white">{holding.name}</p>
							<p class="text-xs text-vault-text-muted">Qty: {holding.quantity} &middot; ${holding.marketPrice.toFixed(2)} each</p>
						</div>
						<div class="text-right">
							<p class="text-sm font-bold text-vault-gold">${holding.totalValue.toFixed(2)}</p>
							<p class="text-xs {holding.gainLoss >= 0 ? 'text-vault-green' : 'text-vault-red'}">
								{holding.gainLoss >= 0 ? '+' : ''}${holding.gainLoss.toFixed(2)}
							</p>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Quick Actions + Getting Started -->
	<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<h2 class="text-lg font-semibold text-white">Quick Actions</h2>
			<div class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
				<a
					href="/browse"
					class="btn-press group flex items-center gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 sm:gap-3 sm:p-4 transition-all hover:border-vault-purple/50 hover:bg-vault-surface-hover"
				>
					<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 bg-vault-purple/10 transition-colors group-hover:bg-vault-purple/20">
						<svg class="h-5 w-5 text-vault-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium text-white">Browse Cards</p>
						<p class="text-xs text-vault-text-muted">Search all sets</p>
					</div>
				</a>
				<a
					href="/collection"
					class="btn-press group flex items-center gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 sm:gap-3 sm:p-4 transition-all hover:border-vault-green/50 hover:bg-vault-surface-hover"
				>
					<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 bg-vault-green/10 transition-colors group-hover:bg-vault-green/20">
						<svg class="h-5 w-5 text-vault-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium text-white">My Collection</p>
						<p class="text-xs text-vault-text-muted">{stats.totalCards} cards</p>
					</div>
				</a>
				<a
					href="/watchlist"
					class="btn-press group flex items-center gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 sm:gap-3 sm:p-4 transition-all hover:border-vault-cyan/50 hover:bg-vault-surface-hover"
				>
					<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 bg-vault-cyan/10 transition-colors group-hover:bg-vault-cyan/20">
						<svg class="h-5 w-5 text-vault-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium text-white">Watchlist</p>
						<p class="text-xs text-vault-text-muted">{stats.watchlistCount} tracked</p>
					</div>
				</a>
				<a
					href="/grading"
					class="btn-press group flex items-center gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 sm:gap-3 sm:p-4 transition-all hover:border-vault-gold/50 hover:bg-vault-surface-hover"
				>
					<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 bg-vault-gold/10 transition-colors group-hover:bg-vault-gold/20">
						<svg class="h-5 w-5 text-vault-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium text-white">Grading</p>
						<p class="text-xs text-vault-text-muted">ROI calculator</p>
					</div>
				</a>
			</div>
		</div>
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<h2 class="text-lg font-semibold text-white">Getting Started</h2>
			<div class="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
				<div class="flex items-start gap-3 rounded-xl border border-vault-border bg-vault-bg p-3 sm:p-4">
					<span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full {stats.totalCards > 0 ? 'bg-vault-green/20 text-vault-green' : 'bg-vault-surface text-vault-text-muted'} text-xs font-bold">
						{#if stats.totalCards > 0}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
						{:else}1{/if}
					</span>
					<div>
						<p class="text-sm font-medium text-white">Add your first card</p>
						<p class="text-xs text-vault-text-muted">Browse cards and add them to your collection</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-xl border border-vault-border bg-vault-bg p-4">
					<span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full {stats.watchlistCount > 0 ? 'bg-vault-green/20 text-vault-green' : 'bg-vault-surface text-vault-text-muted'} text-xs font-bold">
						{#if stats.watchlistCount > 0}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
						{:else}2{/if}
					</span>
					<div>
						<p class="text-sm font-medium text-white">Watch a card</p>
						<p class="text-xs text-vault-text-muted">Track prices on cards you want to buy</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-xl border border-vault-border bg-vault-bg p-4">
					<span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-vault-surface text-xs font-bold text-vault-text-muted">
						3
					</span>
					<div>
						<p class="text-sm font-medium text-white">Check grading ROI</p>
						<p class="text-xs text-vault-text-muted">See if your cards are worth grading</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
