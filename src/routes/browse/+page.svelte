<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { CardThumbnail } from '$components';
	import { sortCards, getSortBadgeValue, SORT_OPTIONS, type SortMode } from '$services/card-sort';
	import type { PokemonCard } from '$types';

	let { data } = $props();

	// Card state — loaded client-side
	let cards = $state<PokemonCard[]>([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let loading = $state(false);
	let initialLoad = $state(true);

	// Filter inputs
	let searchInput = $state('');
	let selectedSet = $state('');
	let selectedType = $state('');
	let selectedRarity = $state('');
	let sortMode = $state<SortMode>('default');

	const DEFAULT_PAGE_SIZE = 24;
	// When a non-default sort is active we need the whole filter result set in
	// memory to reorder it client-side. 250 is the TCG API max page size and
	// fits a typical set in a single round trip.
	const SORT_PAGE_SIZE = 250;

	let sets = $derived(data.sets);
	let isSorting = $derived(sortMode !== 'default');
	let pageSize = $derived(isSorting ? SORT_PAGE_SIZE : DEFAULT_PAGE_SIZE);
	// Infinite scroll only makes sense for the unsorted, paginated default mode.
	let hasMore = $derived(!isSorting && cards.length < totalCount);

	// Apply current sort over already-fetched cards.
	let displayedCards = $derived(sortCards(cards, sortMode));

	// Build a TCG API query string from a filter snapshot. We accept the filter
	// values as arguments instead of reading reactive state directly so the
	// caller controls dependency tracking (the load effect builds from URL
	// state, not from the local bound inputs, to avoid a re-render feedback
	// loop where syncing local state retriggers the effect).
	function buildQuery(
		search: string,
		set: string,
		type: string,
		rarity: string
	): string {
		const parts: string[] = [];
		if (search) parts.push(`name:"${search}*"`);
		if (set) parts.push(`set.id:${set}`);
		if (type) parts.push(`types:${type}`);
		if (rarity) parts.push(`rarity:"${rarity}"`);
		if (parts.length > 0) return parts.join(' ');
		const latestSetId = sets[0]?.id;
		return latestSetId ? `set.id:${latestSetId}` : '';
	}

	// Fetch cards from client-side API
	async function fetchCards(query: string, pg: number, size: number, append = false) {
		loading = true;
		try {
			const params = new URLSearchParams({
				q: query,
				page: String(pg),
				pageSize: String(size)
			});
			const res = await fetch(`/api/cards?${params}`);
			if (!res.ok) throw new Error('Failed to load cards');
			const result = await res.json();

			if (append) {
				cards = [...cards, ...result.data];
			} else {
				cards = result.data;
			}
			totalCount = result.totalCount;
			currentPage = pg;
		} catch (err) {
			console.error('Error loading cards:', err);
			if (!append) {
				cards = [];
				totalCount = 0;
			}
		} finally {
			loading = false;
			initialLoad = false;
		}
	}

	// Load cards whenever the URL filter state changes. This effect intentionally
	// only depends on `data.filters.*` (the URL-driven state). Local bound input
	// state is updated via untrack() so re-syncing doesn't itself retrigger the
	// effect — without that guard, picking a set could fire the effect twice in
	// quick succession and the second pass would read stale `data.filters` and
	// wipe the user's selection.
	$effect(() => {
		const search = data.filters.search;
		const set = data.filters.set;
		const type = data.filters.type;
		const rarity = data.filters.rarity;
		const sort: SortMode = (data.filters.sort as SortMode) || 'default';

		untrack(() => {
			searchInput = search;
			selectedSet = set;
			selectedType = type;
			selectedRarity = rarity;
			sortMode = sort;
			initialLoad = true;
		});

		const query = buildQuery(search, set, type, rarity);
		fetchCards(query, 1, sort === 'default' ? DEFAULT_PAGE_SIZE : SORT_PAGE_SIZE);
	});

	// Apply filters via URL navigation (triggers server load → re-runs effect)
	function applyFilters() {
		const params = new URLSearchParams();
		if (searchInput) params.set('q', searchInput);
		if (selectedSet) params.set('set', selectedSet);
		if (selectedType) params.set('type', selectedType);
		if (selectedRarity) params.set('rarity', selectedRarity);
		if (sortMode !== 'default') params.set('sort', sortMode);
		const qs = params.toString();
		goto(`/browse${qs ? '?' + qs : ''}`, { keepFocus: true });
	}

	function handleSearch(e: Event) {
		e.preventDefault();
		applyFilters();
	}

	function handleFilterChange() {
		applyFilters();
	}

	function clearFilters() {
		searchInput = '';
		selectedSet = '';
		selectedType = '';
		selectedRarity = '';
		sortMode = 'default';
		goto('/browse');
	}

	// Infinite scroll — use the URL filters as the source of truth so pagination
	// stays consistent with what the user navigated to.
	async function loadMore() {
		if (loading || !hasMore) return;
		const query = buildQuery(
			data.filters.search,
			data.filters.set,
			data.filters.type,
			data.filters.rarity
		);
		await fetchCards(query, currentPage + 1, DEFAULT_PAGE_SIZE, true);
	}

	let sentinel = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loading) {
					loadMore();
				}
			},
			{ rootMargin: '400px' }
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	const hasActiveFilters = $derived(
		searchInput || selectedSet || selectedType || selectedRarity || sortMode !== 'default'
	);

	function badgeFor(card: PokemonCard): string | null {
		const v = getSortBadgeValue(card, sortMode);
		if (v == null) return null;
		return `Spread $${v.toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>Browse Cards — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Browse Cards</h1>
			<p class="mt-1 text-vault-text-muted">
				{#if initialLoad && loading}
					Searching...
				{:else}
					{totalCount.toLocaleString()} cards found
				{/if}
			</p>
		</div>
		{#if hasActiveFilters}
			<button
				onclick={clearFilters}
				class="btn-press rounded-xl border border-vault-border px-4 py-2 text-sm font-medium text-vault-text-muted transition-all hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
			>
				Clear Filters
			</button>
		{/if}
	</div>

	<!-- Search + Filters -->
	<div class="flex flex-wrap gap-2 sm:gap-3">
		<form onsubmit={handleSearch} class="flex-1" style="min-width: 200px;">
			<div class="relative">
				<input
					type="text"
					bind:value={searchInput}
					placeholder="Search by name..."
					class="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-2.5 pl-10 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
				/>
				<svg class="absolute left-3 top-3 h-4 w-4 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			</div>
		</form>

		<select
			bind:value={selectedSet}
			onchange={handleFilterChange}
			class="w-full rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
		>
			<option value="">All Sets</option>
			{#each sets as s}
				<option value={s.id}>{s.name}</option>
			{/each}
		</select>

		<select
			bind:value={selectedType}
			onchange={handleFilterChange}
			class="w-[calc(50%-4px)] rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
		>
			<option value="">All Types</option>
			<option value="Colorless">Colorless</option>
			<option value="Darkness">Darkness</option>
			<option value="Dragon">Dragon</option>
			<option value="Fairy">Fairy</option>
			<option value="Fighting">Fighting</option>
			<option value="Fire">Fire</option>
			<option value="Grass">Grass</option>
			<option value="Lightning">Lightning</option>
			<option value="Metal">Metal</option>
			<option value="Psychic">Psychic</option>
			<option value="Water">Water</option>
		</select>

		<select
			bind:value={selectedRarity}
			onchange={handleFilterChange}
			class="w-[calc(50%-4px)] rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
		>
			<option value="">All Rarities</option>
			<option value="Common">Common</option>
			<option value="Uncommon">Uncommon</option>
			<option value="Rare">Rare</option>
			<option value="Rare Holo">Rare Holo</option>
			<option value="Rare Holo EX">Rare Holo EX</option>
			<option value="Rare Holo GX">Rare Holo GX</option>
			<option value="Rare Holo V">Rare Holo V</option>
			<option value="Rare Holo VMAX">Rare Holo VMAX</option>
			<option value="Rare Ultra">Rare Ultra</option>
			<option value="Rare Rainbow">Rare Rainbow</option>
			<option value="Rare Secret">Rare Secret</option>
			<option value="Amazing Rare">Amazing Rare</option>
			<option value="Illustration Rare">Illustration Rare</option>
			<option value="Special Illustration Rare">Special Illustration Rare</option>
			<option value="Hyper Rare">Hyper Rare</option>
		</select>

		<select
			bind:value={sortMode}
			onchange={handleFilterChange}
			title={SORT_OPTIONS.find((o) => o.id === sortMode)?.hint ?? ''}
			class="w-full rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
		>
			{#each SORT_OPTIONS as opt}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
	</div>

	{#if isSorting}
		<div class="flex items-center gap-2 rounded-xl border border-vault-purple/30 bg-vault-purple/5 px-4 py-2 text-xs text-vault-text-muted">
			<svg class="h-4 w-4 text-vault-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
			</svg>
			<span>
				Sorted by <span class="font-semibold text-vault-text">{SORT_OPTIONS.find((o) => o.id === sortMode)?.label}</span>
				· {SORT_OPTIONS.find((o) => o.id === sortMode)?.hint}
				{#if totalCount > SORT_PAGE_SIZE}
					· showing first {SORT_PAGE_SIZE.toLocaleString()} of {totalCount.toLocaleString()}
				{/if}
			</span>
		</div>
	{/if}

	<!-- Loading state -->
	{#if initialLoad && loading}
		<div class="flex flex-col items-center justify-center py-24 text-vault-text-muted">
			<div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-vault-purple border-t-transparent"></div>
			<p class="text-lg font-medium">Loading cards...</p>
			<p class="mt-1 text-sm">This may take a few seconds</p>
		</div>
	{:else if displayedCards.length > 0}
		<!-- Card Grid -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each displayedCards as card (card.id)}
				<CardThumbnail {card} showPrice={true} badgeLabel={badgeFor(card)} />
			{/each}
		</div>

		<!-- Infinite scroll sentinel -->
		{#if hasMore}
			<div bind:this={sentinel} class="flex items-center justify-center py-8">
				{#if loading}
					<div class="flex items-center gap-3 text-vault-text-muted">
						<div class="h-5 w-5 animate-spin rounded-full border-2 border-vault-purple border-t-transparent"></div>
						<span class="text-sm">Loading more cards...</span>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex items-center justify-center py-8 text-sm text-vault-text-muted">
				Showing {displayedCards.length.toLocaleString()} card{displayedCards.length === 1 ? '' : 's'}
				{#if isSorting && displayedCards.length !== cards.length}
					· {(cards.length - displayedCards.length).toLocaleString()} hidden (no price data)
				{/if}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-vault-text-muted">
			<svg class="mb-4 h-16 w-16 text-vault-purple/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<p class="text-lg font-medium">No cards found</p>
			<p class="mt-1 text-sm">
				{#if isSorting && cards.length > 0}
					{cards.length.toLocaleString()} cards loaded, but none match the active sort
				{:else}
					Try adjusting your search or filters
				{/if}
			</p>
			{#if hasActiveFilters}
				<button
					onclick={clearFilters}
					class="btn-press mt-4 rounded-xl bg-vault-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
				>
					Clear All Filters
				</button>
			{/if}
		</div>
	{/if}
</div>
