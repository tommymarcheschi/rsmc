<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { CardThumbnail } from '$components';
	import type { PokemonCard, CardSet } from '$types';

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

	const PAGE_SIZE = 24;

	let sets = $derived(data.sets);
	let hasMore = $derived(cards.length < totalCount);

	// Build query string from current filters. Default to the latest set (first in
	// the server-loaded list, which is sorted by -releaseDate).
	function buildQuery(): string {
		const parts: string[] = [];
		if (searchInput) parts.push(`name:"${searchInput}*"`);
		if (selectedSet) parts.push(`set.id:${selectedSet}`);
		if (selectedType) parts.push(`types:${selectedType}`);
		if (selectedRarity) parts.push(`rarity:"${selectedRarity}"`);
		if (parts.length > 0) return parts.join(' ');
		const latestSetId = sets[0]?.id;
		return latestSetId ? `set.id:${latestSetId}` : '';
	}

	// Fetch cards from client-side API
	async function fetchCards(query: string, pg: number, append = false) {
		loading = true;
		try {
			const params = new URLSearchParams({
				q: query,
				page: String(pg),
				pageSize: String(PAGE_SIZE)
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

	// Load initial cards + react to filter changes from URL
	$effect(() => {
		// Sync filter inputs from server data
		searchInput = data.filters.search;
		selectedSet = data.filters.set;
		selectedType = data.filters.type;
		selectedRarity = data.filters.rarity;

		// Fetch cards client-side
		initialLoad = true;
		const query = buildQuery();
		fetchCards(query, 1);
	});

	// Apply filters via URL navigation (triggers server load → re-runs effect)
	function applyFilters() {
		const params = new URLSearchParams();
		if (searchInput) params.set('q', searchInput);
		if (selectedSet) params.set('set', selectedSet);
		if (selectedType) params.set('type', selectedType);
		if (selectedRarity) params.set('rarity', selectedRarity);
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
		goto('/browse');
	}

	// Infinite scroll
	async function loadMore() {
		if (loading || !hasMore) return;
		const query = buildQuery();
		await fetchCards(query, currentPage + 1, true);
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
		searchInput || selectedSet || selectedType || selectedRarity
	);
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
	</div>

	<!-- Loading state -->
	{#if initialLoad && loading}
		<div class="flex flex-col items-center justify-center py-24 text-vault-text-muted">
			<div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-vault-purple border-t-transparent"></div>
			<p class="text-lg font-medium">Loading cards...</p>
			<p class="mt-1 text-sm">This may take a few seconds</p>
		</div>
	{:else if cards.length > 0}
		<!-- Card Grid -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each cards as card (card.id)}
				<CardThumbnail {card} showPrice={true} />
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
				Showing all {cards.length.toLocaleString()} cards
			</div>
		{/if}
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-vault-text-muted">
			<svg class="mb-4 h-16 w-16 text-vault-purple/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<p class="text-lg font-medium">No cards found</p>
			<p class="mt-1 text-sm">Try adjusting your search or filters</p>
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
