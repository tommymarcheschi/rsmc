<script lang="ts">
	import { goto } from '$app/navigation';

	interface MarketSet {
		id: string;
		name: string;
		releaseYear: string;
		series: string;
		symbol: string;
		total: number;
		indexedCards: number;
		raw_basis: number;
		psa10_ceiling: number;
		avg_gem_rate: number | null;
		expected_roi: number;
		positive_roi_cards: number;
		confident_cards: number;
		owned: number;
	}

	let { data } = $props();

	let setProgress = $derived(data.setProgress as {
		id: string; name: string; series: string; total: number;
		owned: number; pct: number; releaseDate: string; logo: string; symbol: string;
	}[]);

	let marketSets = $derived(((data as Record<string, unknown>).marketSets ?? []) as MarketSet[]);

	let marketSortKey = $state<'roi' | 'ceiling' | 'release'>('roi');
	let marketSorted = $derived.by(() => {
		const arr = [...marketSets];
		if (marketSortKey === 'roi') arr.sort((a, b) => b.expected_roi - a.expected_roi);
		else if (marketSortKey === 'ceiling') arr.sort((a, b) => b.psa10_ceiling - a.psa10_ceiling);
		else if (marketSortKey === 'release') arr.sort((a, b) => b.releaseYear.localeCompare(a.releaseYear));
		return arr.slice(0, 12);
	});

	function fmtMoney(n: number): string {
		if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
		return `$${n.toFixed(2)}`;
	}

	let selectedSet = $derived(data.selectedSet as {
		name: string; total: number; owned: number;
		cards: { id: string; name: string; number: string; rarity: string; imageSmall: string; owned: boolean; quantity: number; marketPrice: number }[];
	} | null);

	let selectedSetId = $derived(data.selectedSetId as string);
	let sets = $derived(data.sets as { id: string; name: string; images: { logo: string; symbol: string } }[]);
	let showFilter = $state<'all' | 'owned' | 'missing'>('all');

	let filteredCards = $derived(() => {
		if (!selectedSet) return [];
		if (showFilter === 'owned') return selectedSet.cards.filter((c) => c.owned);
		if (showFilter === 'missing') return selectedSet.cards.filter((c) => !c.owned);
		return selectedSet.cards;
	});

	let costToComplete = $derived(() => {
		if (!selectedSet) return 0;
		return selectedSet.cards
			.filter((c) => !c.owned)
			.reduce((sum, c) => sum + c.marketPrice, 0);
	});

	function selectSet(setId: string) {
		goto(`/sets?set=${setId}`, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Set Tracker — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Set Completion</h1>
		<p class="mt-1 text-vault-text-muted">Track your progress across every set</p>
	</div>

	<!-- Set Selector -->
	<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
		<label class="block text-sm font-medium text-vault-text-muted" for="set-select">Select a set to view</label>
		<select
			id="set-select"
			onchange={(e) => selectSet((e.target as HTMLSelectElement).value)}
			value={selectedSetId}
			class="mt-2 w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none sm:w-auto sm:min-w-[300px]"
		>
			<option value="">Choose a set...</option>
			{#each sets as s}
				<option value={s.id}>{s.name}</option>
			{/each}
		</select>
	</div>

	<!-- Market ranking — per-set grading ROI + PSA 10 ceiling + completion -->
	{#if marketSorted.length > 0}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="flex flex-col gap-2 border-b border-vault-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
				<div>
					<h2 class="font-semibold text-white">Sets by market value</h2>
					<p class="mt-0.5 text-xs text-vault-text-muted">
						Every tracked set ranked by expected grading ROI (PSA Value tier, weighted by gem rate). Click a set to see completion.
					</p>
				</div>
				<div class="flex items-center gap-1 rounded-xl border border-vault-border bg-vault-bg p-1">
					{#each [ { id: 'roi', label: 'ROI' }, { id: 'ceiling', label: 'PSA 10 ceiling' }, { id: 'release', label: 'Newest' } ] as tab}
						<button
							type="button"
							onclick={() => (marketSortKey = tab.id as typeof marketSortKey)}
							class="shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition {marketSortKey === tab.id ? 'bg-brand-gradient text-white' : 'text-vault-text-muted hover:text-white'}"
						>
							{tab.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-3">
				{#each marketSorted as s}
					<button
						type="button"
						onclick={() => selectSet(s.id)}
						class="flex flex-col gap-2 rounded-xl border border-vault-border bg-vault-bg p-3 text-left transition hover:border-vault-purple/40 hover:bg-vault-surface-hover"
					>
						<div class="flex items-center gap-2">
							{#if s.symbol}
								<img src={s.symbol} alt="" class="h-6 w-6 flex-shrink-0 object-contain" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-white">{s.name}</p>
								<p class="truncate text-[10px] text-vault-text-muted">{s.series}{#if s.releaseYear} · {s.releaseYear}{/if}</p>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-1.5 text-[11px]">
							<div>
								<p class="text-vault-text-muted">Expected ROI</p>
								<p class="font-bold {s.expected_roi > 0 ? 'text-vault-green' : s.expected_roi < 0 ? 'text-vault-red' : 'text-vault-text-muted'}">
									{s.expected_roi >= 0 ? '+' : ''}{fmtMoney(s.expected_roi)}
								</p>
							</div>
							<div>
								<p class="text-vault-text-muted">PSA 10 ceiling</p>
								<p class="font-semibold text-vault-gold">{fmtMoney(s.psa10_ceiling)}</p>
							</div>
							<div>
								<p class="text-vault-text-muted">Gem rate</p>
								<p class="text-vault-text">
									{#if s.avg_gem_rate != null}{s.avg_gem_rate.toFixed(1)}%{:else}—{/if}
								</p>
							</div>
							<div>
								<p class="text-vault-text-muted">Profitable</p>
								<p class="text-vault-text">{s.positive_roi_cards}/{s.confident_cards}</p>
							</div>
						</div>
						{#if s.owned > 0}
							<p class="mt-1 border-t border-vault-border pt-2 text-[10px] text-vault-purple">
								{s.owned} owned · {Math.round((s.owned / s.total) * 100)}% complete
							</p>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Your Set Progress -->
	{#if setProgress.length > 0}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-4 py-3 sm:px-6">
				<h2 class="font-semibold text-white">Your Sets</h2>
			</div>
			<div class="divide-y divide-vault-border">
				{#each setProgress as sp}
					<button
						onclick={() => selectSet(sp.id)}
						class="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-vault-surface-hover sm:gap-4 sm:px-6 {sp.id === selectedSetId ? 'bg-vault-surface-hover' : ''}"
					>
						<img src={sp.symbol} alt="" class="h-6 w-6 object-contain" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-white">{sp.name}</p>
							<p class="text-xs text-vault-text-muted">{sp.series} &middot; {sp.releaseDate}</p>
						</div>
						<div class="flex items-center gap-3">
							<div class="hidden w-32 sm:block">
								<div class="h-2 overflow-hidden rounded-full bg-vault-bg">
									<div
										class="h-full rounded-full transition-all {sp.pct >= 100 ? 'bg-vault-gold' : sp.pct >= 50 ? 'bg-vault-green' : 'bg-vault-purple'}"
										style="width: {sp.pct}%"
									></div>
								</div>
							</div>
							<span class="min-w-[60px] text-right text-sm font-medium {sp.pct >= 100 ? 'text-vault-gold' : sp.pct >= 50 ? 'text-vault-green' : 'text-white'}">
								{sp.owned}/{sp.total}
							</span>
							<span class="min-w-[40px] text-right text-xs text-vault-text-muted">{sp.pct}%</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Selected Set Detail -->
	{#if selectedSet}
		<!-- Set Stats -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
				<p class="text-sm text-vault-text-muted">Total Cards</p>
				<p class="mt-1 text-2xl font-bold text-white">{selectedSet.total}</p>
			</div>
			<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
				<p class="text-sm text-vault-text-muted">Owned</p>
				<p class="mt-1 text-2xl font-bold text-vault-green">{selectedSet.owned}</p>
			</div>
			<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
				<p class="text-sm text-vault-text-muted">Missing</p>
				<p class="mt-1 text-2xl font-bold text-vault-red">{selectedSet.total - selectedSet.owned}</p>
			</div>
			<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
				<p class="text-sm text-vault-text-muted">Cost to Complete</p>
				<p class="mt-1 text-2xl font-bold text-vault-gold">${costToComplete().toFixed(2)}</p>
			</div>
		</div>

		<!-- Progress bar -->
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-4 sm:p-6">
			<div class="flex items-center justify-between text-sm">
				<span class="text-white font-medium">{selectedSet.name}</span>
				<span class="{selectedSet.owned === selectedSet.total ? 'text-vault-gold font-bold' : 'text-vault-text-muted'}">
					{Math.round((selectedSet.owned / selectedSet.total) * 100)}% complete
				</span>
			</div>
			<div class="mt-3 h-3 overflow-hidden rounded-full bg-vault-bg">
				<div
					class="h-full rounded-full transition-all duration-500 {selectedSet.owned === selectedSet.total ? 'bg-gradient-to-r from-vault-gold to-vault-accent' : 'bg-gradient-to-r from-vault-purple to-vault-accent'}"
					style="width: {(selectedSet.owned / selectedSet.total) * 100}%"
				></div>
			</div>
		</div>

		<!-- Filter tabs -->
		<div class="flex gap-1 rounded-2xl border border-vault-border bg-vault-surface p-1">
			<button
				onclick={() => (showFilter = 'all')}
				class="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:text-sm {showFilter === 'all' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
			>
				All ({selectedSet.total})
			</button>
			<button
				onclick={() => (showFilter = 'owned')}
				class="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:text-sm {showFilter === 'owned' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
			>
				Owned ({selectedSet.owned})
			</button>
			<button
				onclick={() => (showFilter = 'missing')}
				class="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all sm:text-sm {showFilter === 'missing' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
			>
				Missing ({selectedSet.total - selectedSet.owned})
			</button>
		</div>

		<!-- Card Grid -->
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
			{#each filteredCards() as card}
				<a
					href="/card/{card.id}"
					class="group relative overflow-hidden rounded-xl border transition-all hover:-translate-y-1
						{card.owned ? 'border-vault-green/30 bg-vault-surface' : 'border-vault-border bg-vault-surface opacity-50 grayscale hover:opacity-100 hover:grayscale-0'}"
				>
					<img
						src={card.imageSmall}
						alt={card.name}
						class="w-full rounded-xl transition-transform group-hover:scale-105"
						loading="lazy"
					/>
					<!-- Card number badge -->
					<div class="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
						#{card.number}
					</div>
					<!-- Owned indicator -->
					{#if card.owned}
						<div class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-vault-green">
							<svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						</div>
					{/if}
					<!-- Price -->
					{#if card.marketPrice > 0}
						<div class="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-vault-gold">
							${card.marketPrice.toFixed(2)}
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{:else if !selectedSetId && setProgress.length === 0}
		<div class="flex items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16">
			<div class="text-center text-vault-text-muted">
				<p class="text-lg">No sets tracked yet</p>
				<p class="mt-1 text-sm">Add cards to your collection to see set progress here</p>
				<a href="/browse" class="mt-4 inline-block rounded-xl bg-gradient-to-r from-vault-accent to-vault-purple px-4 py-2.5 text-sm font-medium text-white">
					Browse Cards
				</a>
			</div>
		</div>
	{/if}
</div>
