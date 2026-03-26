<script lang="ts">
	let { data } = $props();
	let stats = $derived(data.stats);
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
			<p class="text-sm text-vault-text-muted">Total Invested</p>
			<p class="mt-2 text-3xl font-bold text-vault-gold">${stats.totalInvested.toFixed(2)}</p>
			<p class="mt-1 text-sm text-vault-text-muted">purchase cost basis</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-2 text-3xl font-bold text-white">{stats.totalCards}</p>
			<p class="mt-1 text-sm text-vault-text-muted">across {stats.uniqueSets} sets</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Watchlist</p>
			<p class="mt-2 text-3xl font-bold text-white">{stats.watchlistCount}</p>
			<p class="mt-1 text-sm text-vault-text-muted">cards tracked</p>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<p class="text-sm text-vault-text-muted">Grading Queue</p>
			<p class="mt-2 text-3xl font-bold text-white">{stats.gradingPending}</p>
			<p class="mt-1 text-sm text-vault-gold">{stats.gradingPending} pending return</p>
		</div>
	</div>

	<!-- Quick Actions + Recent -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Quick Actions</h2>
			<div class="mt-4 grid grid-cols-2 gap-3">
				<a
					href="/browse"
					class="flex items-center gap-3 rounded-lg border border-vault-border bg-vault-bg p-4 transition-colors hover:border-vault-accent hover:bg-vault-surface-hover"
				>
					<span class="text-2xl">🔍</span>
					<div>
						<p class="text-sm font-medium text-white">Browse Cards</p>
						<p class="text-xs text-vault-text-muted">Search all sets</p>
					</div>
				</a>
				<a
					href="/collection"
					class="flex items-center gap-3 rounded-lg border border-vault-border bg-vault-bg p-4 transition-colors hover:border-vault-accent hover:bg-vault-surface-hover"
				>
					<span class="text-2xl">📦</span>
					<div>
						<p class="text-sm font-medium text-white">My Collection</p>
						<p class="text-xs text-vault-text-muted">{stats.totalCards} cards</p>
					</div>
				</a>
				<a
					href="/watchlist"
					class="flex items-center gap-3 rounded-lg border border-vault-border bg-vault-bg p-4 transition-colors hover:border-vault-accent hover:bg-vault-surface-hover"
				>
					<span class="text-2xl">👁</span>
					<div>
						<p class="text-sm font-medium text-white">Watchlist</p>
						<p class="text-xs text-vault-text-muted">{stats.watchlistCount} tracked</p>
					</div>
				</a>
				<a
					href="/grading"
					class="flex items-center gap-3 rounded-lg border border-vault-border bg-vault-bg p-4 transition-colors hover:border-vault-accent hover:bg-vault-surface-hover"
				>
					<span class="text-2xl">⭐</span>
					<div>
						<p class="text-sm font-medium text-white">Grading</p>
						<p class="text-xs text-vault-text-muted">ROI calculator</p>
					</div>
				</a>
			</div>
		</div>
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Getting Started</h2>
			<div class="mt-4 space-y-3">
				<div class="flex items-start gap-3 rounded-lg border border-vault-border bg-vault-bg p-3">
					<span class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full {stats.totalCards > 0 ? 'bg-vault-green/20 text-vault-green' : 'bg-vault-surface text-vault-text-muted'} text-xs font-bold">
						{stats.totalCards > 0 ? '✓' : '1'}
					</span>
					<div>
						<p class="text-sm font-medium text-white">Add your first card</p>
						<p class="text-xs text-vault-text-muted">Browse cards and add them to your collection</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-lg border border-vault-border bg-vault-bg p-3">
					<span class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full {stats.watchlistCount > 0 ? 'bg-vault-green/20 text-vault-green' : 'bg-vault-surface text-vault-text-muted'} text-xs font-bold">
						{stats.watchlistCount > 0 ? '✓' : '2'}
					</span>
					<div>
						<p class="text-sm font-medium text-white">Watch a card</p>
						<p class="text-xs text-vault-text-muted">Track prices on cards you want to buy</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-lg border border-vault-border bg-vault-bg p-3">
					<span class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-vault-surface text-xs font-bold text-vault-text-muted">
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
