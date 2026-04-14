<script lang="ts">
	import { CardThumbnail } from '$components';
	import type { PokemonCard } from '$types';

	let { data } = $props();

	// Derive card state directly from server-loaded data. The server renders
	// the first page; JS enhancement loads more via infinite scroll. This page
	// works entirely without JS: the filter form is a plain GET to /browse,
	// and every link is a real <a href>. JS enhancement is additive.
	let serverCards = $derived(data.initialCards);
	let serverTotal = $derived(data.initialTotalCount);

	// Extra pages loaded client-side via infinite scroll, beyond what the
	// server rendered. This is additive — the server cards always come first.
	let extraCards = $state<PokemonCard[]>([]);
	let currentPage = $state(1);
	let loadingMore = $state(false);

	// Reset extras whenever the server data changes (e.g. filters changed
	// via form submit → full navigation → new server load).
	$effect(() => {
		// Depend on serverCards identity so this re-runs on navigation.
		void serverCards;
		extraCards = [];
		currentPage = 1;
	});

	let allCards = $derived([...serverCards, ...extraCards]);
	let totalCount = $derived(serverTotal);
	let hasMore = $derived(allCards.length < totalCount);

	// Rebuild the TCG API query from the current filters — same logic as the
	// server. Only used for client-side "load more" fetches.
	function buildQuery(): string {
		const parts: string[] = [];
		if (data.filters.search) parts.push(`name:"${data.filters.search}*"`);
		if (data.filters.set) parts.push(`set.id:${data.filters.set}`);
		if (data.filters.type) parts.push(`types:${data.filters.type}`);
		if (data.filters.rarity) parts.push(`rarity:"${data.filters.rarity}"`);
		if (parts.length > 0) return parts.join(' ');
		const latestSetId = data.sets[0]?.id;
		return latestSetId ? `set.id:${latestSetId}` : '';
	}

	const PAGE_SIZE = 24;

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const params = new URLSearchParams({
				q: buildQuery(),
				page: String(currentPage + 1),
				pageSize: String(PAGE_SIZE)
			});
			const res = await fetch(`/api/cards?${params}`);
			if (!res.ok) throw new Error('Failed to load more cards');
			const result = await res.json();
			extraCards = [...extraCards, ...result.data];
			currentPage += 1;
		} catch (err) {
			console.error('Error loading more cards:', err);
		} finally {
			loadingMore = false;
		}
	}

	// Infinite-scroll sentinel — only matters when JS is running.
	let sentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
			},
			{ rootMargin: '400px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// JS enhancement: auto-submit the filter form when a select changes
	// instead of making the user click "Apply". Without JS, the Apply button
	// is always there as a fallback.
	function autoSubmit(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		select.form?.submit();
	}

	let hasActiveFilters = $derived(
		!!(data.filters.search || data.filters.set || data.filters.type || data.filters.rarity)
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
				{totalCount.toLocaleString()} cards found
			</p>
		</div>
		{#if hasActiveFilters}
			<a
				href="/browse"
				class="btn-press rounded-xl border border-vault-border px-4 py-2 text-sm font-medium text-vault-text-muted transition-all hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
			>
				Clear Filters
			</a>
		{/if}
	</div>

	<!--
		The filter form is a real <form method="GET" action="/browse">.
		Submitting it navigates to /browse?q=...&set=... — the server re-renders
		the page with the new filters applied. This works with zero JS. On
		clients with JS, the selects also auto-submit on change via `autoSubmit`.
	-->
	<form method="GET" action="/browse" class="flex flex-wrap gap-2 sm:gap-3">
		<div class="relative flex-1" style="min-width: 200px;">
			<input
				type="text"
				name="q"
				value={data.filters.search}
				placeholder="Search by name..."
				class="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-2.5 pl-10 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
			/>
			<svg class="absolute left-3 top-3 h-4 w-4 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
		</div>

		<select
			name="set"
			value={data.filters.set}
			onchange={autoSubmit}
			class="w-full rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
		>
			<option value="">All Sets</option>
			{#each data.sets as s}
				<option value={s.id}>{s.name}</option>
			{/each}
		</select>

		<select
			name="type"
			value={data.filters.type}
			onchange={autoSubmit}
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
			name="rarity"
			value={data.filters.rarity}
			onchange={autoSubmit}
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

		<!--
			Apply button — always visible so users without JS (or whose JS
			hasn't hydrated yet) can still submit the form. With JS, the selects
			auto-submit on change and typing in the search input + Enter also
			submits, so this button is a backup / explicit trigger for search.
		-->
		<button
			type="submit"
			class="btn-press rounded-xl bg-vault-accent px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
		>
			Apply
		</button>
	</form>

	{#if allCards.length > 0}
		<!-- Card grid -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each allCards as card (card.id)}
				<CardThumbnail {card} showPrice={true} />
			{/each}
		</div>

		{#if hasMore}
			<div bind:this={sentinel} class="flex items-center justify-center py-8">
				{#if loadingMore}
					<div class="flex items-center gap-3 text-vault-text-muted">
						<div class="h-5 w-5 animate-spin rounded-full border-2 border-vault-purple border-t-transparent"></div>
						<span class="text-sm">Loading more cards...</span>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex items-center justify-center py-8 text-sm text-vault-text-muted">
				Showing all {allCards.length.toLocaleString()} cards
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
				<a
					href="/browse"
					class="btn-press mt-4 rounded-xl bg-vault-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
				>
					Clear All Filters
				</a>
			{/if}
		</div>
	{/if}
</div>
