<script lang="ts">
	import { CardThumbnail, Icon } from '$components';
	import { getSortOptionsForMode } from '$services/sort';
	import { parseHuntDSL } from '$services/hunt-dsl';
	import type { PokemonCard } from '$types';

	interface FilterPill { label: string; removeHref: string; }
	interface SavedSearchRow { id: string; name: string; url_search: string; }

	let { data, form } = $props();

	let activeFilters = $derived(((data as Record<string, unknown>).activeFilters ?? []) as FilterPill[]);
	let savedSearches = $derived(((data as Record<string, unknown>).savedSearches ?? []) as SavedSearchRow[]);

	// Multi-select state. Off by default so the normal click-to-navigate
	// grid keeps working. When on, clicking a card toggles its selection
	// instead of navigating; the action bar at the bottom of the viewport
	// commits "add all" actions via the existing single-item APIs.
	let selectionMode = $state(false);
	let selectedIds = $state<Set<string>>(new Set());
	let bulkStatus = $state<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
	let bulkBusy = $state(false);

	function toggleSelection(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	function exitSelectionMode() {
		selectionMode = false;
		selectedIds = new Set();
		bulkStatus = null;
	}

	async function bulkAdd(kind: 'collection' | 'watchlist') {
		if (selectedIds.size === 0 || bulkBusy) return;
		bulkBusy = true;
		bulkStatus = { tone: 'info', text: `Adding ${selectedIds.size} card${selectedIds.size === 1 ? '' : 's'}…` };
		const ids = [...selectedIds];
		const endpoint = kind === 'collection' ? '/api/collection' : '/api/watchlist';
		let ok = 0;
		let failed = 0;
		const limit = 5; // concurrency cap — don't hammer the API
		let cursor = 0;
		async function worker() {
			while (cursor < ids.length) {
				const idx = cursor++;
				const id = ids[idx];
				try {
					const res = await fetch(endpoint, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ card_id: id })
					});
					if (res.ok || res.status === 409) ok++;
					else failed++;
				} catch {
					failed++;
				}
			}
		}
		await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, () => worker()));
		bulkBusy = false;
		if (failed === 0) {
			bulkStatus = { tone: 'success', text: `Added ${ok} to ${kind === 'collection' ? 'Collection' : 'Watchlist'}.` };
			selectedIds = new Set();
		} else {
			bulkStatus = { tone: 'error', text: `Added ${ok}, ${failed} failed.` };
		}
	}
	let saveName = $state('');
	let savePromptOpen = $state(false);
	let saveMessage = $derived(
		form && (form as { action?: string }).action === 'saveSearch'
			? form && !(form as { success?: boolean }).success
				? ((form as { message?: string }).message ?? 'Failed to save')
				: `Saved "${(form as { name?: string }).name}"`
			: null
	);
	let dslInput = $state('');
	let dslErrors = $state<string[]>([]);

	function applyDsl(e: Event) {
		e.preventDefault();
		const text = dslInput.trim();
		if (!text) return;
		const { params, errors } = parseHuntDSL(text);
		dslErrors = errors;
		const search = new URLSearchParams({ mode: 'hunt', ...params });
		window.location.href = `/browse?${search.toString()}`;
	}

	let isHuntMode = $derived(data.mode === 'hunt');
	let sortOptions = $derived(getSortOptionsForMode(data.mode ?? 'default'));

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
			const params = new URLSearchParams({ page: String(currentPage + 1), pageSize: String(PAGE_SIZE) });
			if (isHuntMode) {
				params.set('mode', 'hunt');
				// Forward all hunt filters
				const f = data.filters as Record<string, string>;
				for (const key of ['q', 'set', 'sort', 'pop_lt', 'before', 'after', 'variants', 'raw_lt', 'raw_gt', 'require_psa10']) {
					const alias = key === 'q' ? 'search' : key;
					const val = f[alias] ?? f[key] ?? '';
					if (val) params.set(key, val);
				}
			} else {
				params.set('q', buildQuery());
				if (data.filters.sort) params.set('sort', data.filters.sort);
			}
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

	// Before hunt form submits, collect variant checkboxes into a single
	// comma-separated hidden input. Without JS the checkboxes send multiple
	// params which the server also handles, but this keeps the URL cleaner.
	function handleHuntSubmit(e: Event) {
		const form = e.currentTarget as HTMLFormElement;
		const cbs = form.querySelectorAll<HTMLInputElement>('.hunt-variant-cb:checked');
		const variants = Array.from(cbs).map((cb) => cb.value).join(',');
		const hidden = form.querySelector<HTMLInputElement>('#hunt-variants-hidden');
		if (hidden) hidden.value = variants;
	}

	let hasActiveFilters = $derived(
		!!(
			data.filters.search ||
			data.filters.set ||
			(data.filters as Record<string, string>).type ||
			(data.filters as Record<string, string>).rarity ||
			data.filters.sort ||
			(data.filters as Record<string, string>).popLt ||
			(data.filters as Record<string, string>).before ||
			(data.filters as Record<string, string>).variants
		)
	);
</script>

<svelte:head>
	<title>{isHuntMode ? 'Sleeper Hunter' : 'Browse Cards'} — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">
				{isHuntMode ? 'Sleeper Hunter' : 'Browse Cards'}
			</h1>
			<p class="mt-1 text-vault-text-muted">
				{totalCount.toLocaleString()} cards found
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={() => { if (selectionMode) exitSelectionMode(); else selectionMode = true; }}
				class="btn-press rounded-xl border px-4 py-2 text-sm font-medium transition-all {selectionMode ? 'border-vault-purple bg-vault-purple/10 text-vault-purple' : 'border-vault-border text-vault-text-muted hover:border-vault-accent/50 hover:text-white'}"
				aria-pressed={selectionMode}
			>
				{selectionMode ? 'Exit select' : 'Select'}
			</button>
			{#if hasActiveFilters}
				<button
					type="button"
					onclick={() => (savePromptOpen = !savePromptOpen)}
					class="btn-press rounded-xl border border-vault-purple/40 px-4 py-2 text-sm font-medium text-vault-purple transition-all hover:bg-vault-purple/10"
					aria-expanded={savePromptOpen}
				>
					⭐ Save
				</button>
				<a
					href={isHuntMode ? '/browse?mode=hunt' : '/browse'}
					class="btn-press rounded-xl border border-vault-border px-4 py-2 text-sm font-medium text-vault-text-muted transition-all hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
				>
					Clear Filters
				</a>
			{/if}
			<!-- Mode toggle -->
			<a
				href={isHuntMode ? '/browse' : '/browse?mode=hunt'}
				class="btn-press rounded-xl px-4 py-2 text-sm font-medium transition-all {isHuntMode
					? 'bg-vault-purple text-white hover:bg-vault-purple/80'
					: 'border border-vault-purple/50 text-vault-purple hover:bg-vault-purple/10'}"
			>
				{isHuntMode ? 'Browse Mode' : 'Hunt Mode'}
			</a>
		</div>
	</div>

	{#if activeFilters.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs uppercase tracking-wide text-vault-text-muted">Active:</span>
			{#each activeFilters as pill}
				<a
					href={pill.removeHref}
					class="inline-flex items-center gap-1.5 rounded-full border border-vault-purple/30 bg-vault-purple/10 px-3 py-1 text-xs font-medium text-vault-purple transition hover:border-vault-purple/60 hover:bg-vault-purple/20"
					aria-label="Remove filter: {pill.label}"
				>
					<span>{pill.label}</span>
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</a>
			{/each}
		</div>
	{/if}

	{#if savePromptOpen && hasActiveFilters}
		<form method="POST" action="?/saveSearch" use:enhance class="flex flex-wrap items-center gap-2 rounded-xl border border-vault-purple/30 bg-vault-purple/5 px-3 py-2">
			<label for="saved-search-name" class="text-xs text-vault-text-muted">Name this search:</label>
			<input
				id="saved-search-name"
				type="text"
				name="name"
				bind:value={saveName}
				placeholder="Pre-2017 sleepers"
				class="flex-1 rounded-lg border border-vault-border bg-vault-surface px-3 py-1.5 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
				required
				minlength="1"
				maxlength="60"
			/>
			<button type="submit" class="btn-press rounded-lg bg-vault-purple px-3 py-1.5 text-xs font-medium text-white hover:bg-vault-purple/80">
				Save
			</button>
			<button type="button" onclick={() => (savePromptOpen = false)} class="text-xs text-vault-text-muted hover:text-white">
				Cancel
			</button>
		</form>
	{/if}

	{#if saveMessage}
		<p class="text-xs {form && (form as Record<string, unknown>).success ? 'text-vault-green' : 'text-vault-red'}">
			{saveMessage}
		</p>
	{/if}

	{#if savedSearches.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs uppercase tracking-wide text-vault-text-muted">Saved:</span>
			{#each savedSearches as sv}
				<div class="group inline-flex items-center gap-1 rounded-full border border-vault-border bg-vault-surface py-1 pl-3 pr-1 text-xs text-vault-text transition hover:border-vault-purple/40">
					<a href="/browse?{sv.url_search}" class="font-medium hover:text-vault-purple">
						⭐ {sv.name}
					</a>
					<form method="POST" action="?/deleteSearch" use:enhance class="contents">
						<input type="hidden" name="id" value={sv.id} />
						<button type="submit" class="rounded-full p-1 text-vault-text-muted opacity-70 transition hover:bg-vault-red/20 hover:text-vault-red" aria-label="Delete saved search {sv.name}">
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}

	{#if isHuntMode}
		<!-- ─── Hunt Mode Filter Form ──────────────────────────────────── -->
		{@const f = data.filters as Record<string, string>}

		<!--
			DSL search bar: power-user single-line query. With JS, parsing is
			client-side and the page navigates immediately. Without JS, the
			text submits as a plain name search (q=...), so the feature
			degrades to a simple search box instead of breaking.
		-->
		<form method="GET" action="/browse" class="space-y-1" onsubmit={applyDsl}>
			<input type="hidden" name="mode" value="hunt" />
			<div class="flex gap-2">
				<input
					type="text"
					name="q"
					bind:value={dslInput}
					placeholder={'pop:<100 year:2010-2016 rarity:holo price:10-50 psa10'}
					aria-label="Query language search"
					class="flex-1 rounded-xl border border-vault-purple/40 bg-vault-surface px-4 py-2.5 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
				/>
				<button type="submit" class="btn-press rounded-xl bg-vault-purple px-4 py-2 text-sm font-medium text-white transition-all hover:bg-vault-purple/80">
					Go
				</button>
			</div>
			<p class="text-[11px] text-vault-text-muted">
				Fields: <code>pop:</code> <code>year:</code> <code>price:</code> <code>raw:</code> <code>rarity:</code> <code>set:</code> · operators <code>&lt;N</code> <code>&gt;N</code> <code>A-B</code> · flags <code>psa10</code> <code>holo</code> <code>reverse</code>. Without JavaScript, the text becomes a name search.
			</p>
			{#if dslErrors.length > 0}
				<p class="text-[11px] text-vault-red">
					Didn't understand: <code>{dslErrors.join(' ')}</code> — went with what I could parse.
				</p>
			{/if}
		</form>

		<!-- Preset buttons -->
		<div class="flex flex-wrap gap-2">
			<a
				href="/browse?mode=hunt&pop_lt=100&before=2017&variants=holo,reverse&sort=delta_desc&require_psa10=1"
				class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
			>
				Sleeper Holos (pre-2017, pop &lt;100, by delta)
			</a>
			<a
				href="/browse?mode=hunt&pop_lt=50&sort=pop_asc&require_psa10=1"
				class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
			>
				Lowest Pop (with PSA 10 comp)
			</a>
			<a
				href="/browse?mode=hunt&sort=delta_multiple&require_psa10=1&raw_lt=20"
				class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
			>
				Best ROI (raw under $20, highest multiple)
			</a>
		</div>

		<form method="GET" action="/browse" class="space-y-3" onsubmit={handleHuntSubmit}>
			<input type="hidden" name="mode" value="hunt" />
			<!-- Hidden input for comma-joined variants — JS populates from checkboxes -->
			<input type="hidden" name="variants" id="hunt-variants-hidden" value={f.variants ?? ''} />

			<div class="flex flex-wrap gap-2 sm:gap-3">
				<div class="relative flex-1" style="min-width: 200px;">
					<input
						type="text"
						name="q"
						value={f.search ?? ''}
						placeholder="Search by name..."
						class="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-2.5 pl-10 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
					/>
					<svg class="absolute left-3 top-3 h-4 w-4 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</div>

				<select
					name="set"
					value={f.set ?? ''}
					onchange={autoSubmit}
					class="w-full rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
				>
					<option value="">All Indexed Sets</option>
					{#each data.sets as s}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>

				<select
					name="sort"
					value={f.sort ?? ''}
					onchange={autoSubmit}
					class="w-full rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
					aria-label="Sort cards"
				>
					{#each sortOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="flex flex-wrap gap-2 sm:gap-3">
				<div class="flex items-center gap-1.5">
					<label for="pop_lt" class="text-xs text-vault-text-muted">Max Pop</label>
					<input
						type="number"
						id="pop_lt"
						name="pop_lt"
						value={f.popLt ?? f.pop_lt ?? ''}
						placeholder="100"
						class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-1.5">
					<label for="before" class="text-xs text-vault-text-muted">Before year</label>
					<input
						type="number"
						id="before"
						name="before"
						value={f.before ?? ''}
						placeholder="2017"
						min="1999"
						max="2026"
						class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-1.5">
					<label for="after" class="text-xs text-vault-text-muted">After year</label>
					<input
						type="number"
						id="after"
						name="after"
						value={f.after ?? ''}
						placeholder=""
						min="1999"
						max="2026"
						class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-1.5">
					<label for="raw_gt" class="text-xs text-vault-text-muted">Raw min $</label>
					<input
						type="number"
						id="raw_gt"
						name="raw_gt"
						value={f.rawGt ?? f.raw_gt ?? ''}
						placeholder=""
						step="0.01"
						class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-1.5">
					<label for="raw_lt" class="text-xs text-vault-text-muted">Raw max $</label>
					<input
						type="number"
						id="raw_lt"
						name="raw_lt"
						value={f.rawLt ?? f.raw_lt ?? ''}
						placeholder=""
						step="0.01"
						class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<fieldset class="flex items-center gap-2">
					<legend class="sr-only">Printing variants</legend>
					<label class="flex items-center gap-1.5 text-sm text-vault-text">
						<input
							type="checkbox"
							class="hunt-variant-cb rounded border-vault-border bg-vault-surface text-vault-purple focus:ring-vault-purple/50"
							value="holo"
							checked={(f.variants ?? '').includes('holo')}
						/>
						Holo
					</label>
					<label class="flex items-center gap-1.5 text-sm text-vault-text">
						<input
							type="checkbox"
							class="hunt-variant-cb rounded border-vault-border bg-vault-surface text-vault-purple focus:ring-vault-purple/50"
							value="reverse"
							checked={(f.variants ?? '').includes('reverse')}
						/>
						Reverse Holo
					</label>
				</fieldset>

				<label class="flex items-center gap-1.5 text-sm text-vault-text">
					<input
						type="checkbox"
						name="require_psa10"
						value="1"
						checked={(f.requirePsa10 ?? f.require_psa10) === '1'}
						class="rounded border-vault-border bg-vault-surface text-vault-purple focus:ring-vault-purple/50"
					/>
					Has PSA 10 comp
				</label>

				<button
					type="submit"
					class="btn-press rounded-xl bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
				>
					Hunt
				</button>
			</div>
		</form>
	{:else}
		<!-- ─── Default Mode Filter Form ───────────────────────────────── -->
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
				value={(data.filters as Record<string, string>).type ?? ''}
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
				value={(data.filters as Record<string, string>).rarity ?? ''}
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

			<select
				name="sort"
				value={data.filters.sort}
				onchange={autoSubmit}
				class="w-[calc(50%-4px)] rounded-xl border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none sm:w-auto sm:px-4"
				aria-label="Sort cards"
			>
				{#each sortOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>

			<button
				type="submit"
				class="btn-press rounded-xl bg-vault-accent px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
			>
				Apply
			</button>
		</form>
	{/if}

	{#if allCards.length > 0}
		<!-- Card grid -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each allCards as card (card.id)}
				{#if selectionMode}
					{@const isSelected = selectedIds.has(card.id)}
					<button
						type="button"
						onclick={() => toggleSelection(card.id)}
						class="relative block overflow-hidden rounded-xl text-left transition-all {isSelected ? 'ring-2 ring-vault-purple ring-offset-2 ring-offset-vault-bg' : 'ring-1 ring-vault-border/40 hover:ring-vault-purple/40'}"
						aria-pressed={isSelected}
						aria-label={isSelected ? `Deselect ${card.name}` : `Select ${card.name}`}
					>
						<div class="pointer-events-none">
							<CardThumbnail {card} showPrice={true} />
						</div>
						<span class="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 {isSelected ? 'border-vault-purple bg-vault-purple text-white' : 'border-white/70 bg-black/40 text-transparent'}" aria-hidden="true">
							<Icon name="check" class="h-4 w-4" strokeWidth={3} />
						</span>
					</button>
				{:else}
					<CardThumbnail {card} showPrice={true} />
				{/if}
			{/each}
		</div>

		{#if selectionMode && selectedIds.size > 0}
			<div class="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
				<div class="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-vault-border bg-vault-surface/95 px-3 py-2 shadow-2xl backdrop-blur sm:px-4 sm:py-3">
					<span class="text-sm font-medium text-white">
						{selectedIds.size} selected
					</span>
					<button type="button" onclick={clearSelection} class="text-xs text-vault-text-muted hover:text-white">Clear</button>
					<button
						type="button"
						onclick={() => bulkAdd('watchlist')}
						disabled={bulkBusy}
						class="btn-press rounded-xl border border-vault-purple/40 px-3 py-1.5 text-sm font-medium text-vault-purple transition-all hover:bg-vault-purple/10 disabled:opacity-50"
					>
						+ Watchlist
					</button>
					<button
						type="button"
						onclick={() => bulkAdd('collection')}
						disabled={bulkBusy}
						class="btn-press rounded-xl bg-brand-gradient px-3 py-1.5 text-sm font-medium text-white transition-all disabled:opacity-50"
					>
						+ Collection
					</button>
					{#if bulkStatus}
						<span class="w-full text-center text-xs sm:w-auto sm:text-left {bulkStatus.tone === 'success' ? 'text-vault-green' : bulkStatus.tone === 'error' ? 'text-vault-red' : 'text-vault-text-muted'}">
							{bulkStatus.text}
						</span>
					{/if}
				</div>
			</div>
		{/if}

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
				{#if data.clientSort && data.hiddenByClientSort > 0}
					<span class="ml-2">({data.hiddenByClientSort.toLocaleString()} hidden — missing price data)</span>
				{/if}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-vault-text-muted">
			<svg class="mb-4 h-16 w-16 text-vault-purple/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			{#if isHuntMode}
				<p class="text-lg font-medium">No indexed cards found</p>
				<p class="mt-1 max-w-md text-center text-sm">
					Hunt mode searches the card index. If it's empty, you need to run the enrichment script first.
				</p>
				<div class="mt-4 rounded-xl bg-vault-surface p-4 text-left">
					<p class="text-xs font-medium text-vault-text-muted">1. Track sets to index:</p>
					<a href="/admin/index" class="mt-1 inline-block text-xs text-vault-purple hover:underline">Open Card Index admin</a>
					<p class="mt-3 text-xs font-medium text-vault-text-muted">2. Run the enrichment:</p>
					<code class="mt-1 block text-xs text-vault-purple">npx tsx scripts/refresh-index.ts --all</code>
				</div>
			{:else}
				<p class="text-lg font-medium">No cards found</p>
				<p class="mt-1 text-sm">Try adjusting your search or filters</p>
			{/if}
			{#if hasActiveFilters}
				<a
					href={isHuntMode ? '/browse?mode=hunt' : '/browse'}
					class="btn-press mt-4 rounded-xl bg-vault-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
				>
					Clear All Filters
				</a>
			{/if}
		</div>
	{/if}
</div>
