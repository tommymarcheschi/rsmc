<script lang="ts">
	import { enhance } from '$app/forms';
	import { Icon, WatchlistView } from '$components';
	import type { CollectionEntry, PokemonCard, CardCondition } from '$types';
	import type { WatchlistLoadResult } from '$services/watchlist-load';

	interface ValuationRow {
		nm_price: number | null;
		unit_value: number | null;
		line_value: number | null;
		is_estimate: boolean;
		discount: number;
		value_source: 'real_comp' | 'raw_nm' | 'estimate' | 'none';
		sample_count: number | null;
		as_of: string | null;
	}

	interface DiscoverySignals {
		value_rank: number | null;
		scarcity_rank: number | null;
		gem_rate: number | null;
		psa10_delta: number | null;
		psa10_multiple: number | null;
	}

	let { data } = $props();

	// Tab strip — Sprint 1D-i fold. /watchlist now redirects to
	// /collection?tab=watchlist so the two views share this shell.
	let tab = $derived((data as { tab?: 'collection' | 'watchlist' }).tab ?? 'collection');
	let watchlist = $derived(
		(data as { watchlist?: WatchlistLoadResult }).watchlist ?? {
			entries: [],
			cardCache: {},
			valuationByEntry: {},
			triggeredCount: 0
		}
	);

	let entries = $derived(data.entries as CollectionEntry[]);
	let cardCache = $derived(data.cardCache as Record<string, PokemonCard>);
	let valuationByEntry = $derived(
		((data as Record<string, unknown>).valuationByEntry ?? {}) as Record<string, ValuationRow>
	);
	let discoveryByCard = $derived(
		((data as Record<string, unknown>).discoveryByCard ?? {}) as Record<string, DiscoverySignals>
	);
	// Stats
	let totalCards = $derived(entries.reduce((sum, e) => sum + e.quantity, 0));
	let totalInvested = $derived(
		entries.reduce((sum, e) => sum + (e.purchase_price ?? 0) * e.quantity, 0)
	);
	let uniqueCards = $derived(new Set(entries.map((e) => e.card_id)).size);
	let currentValue = $derived(
		entries.reduce((sum, e) => sum + (valuationByEntry[e.id]?.line_value ?? 0), 0)
	);
	// Only count gain/loss against rows with a known purchase_price — otherwise
	// the "investment" side is fake and the delta is misleading.
	let pricedInvested = $derived(
		entries
			.filter((e) => e.purchase_price != null)
			.reduce((sum, e) => sum + (e.purchase_price ?? 0) * e.quantity, 0)
	);
	let pricedValue = $derived(
		entries
			.filter((e) => e.purchase_price != null)
			.reduce((sum, e) => sum + (valuationByEntry[e.id]?.line_value ?? 0), 0)
	);
	let gainLoss = $derived(pricedValue - pricedInvested);
	let gainLossPct = $derived(pricedInvested > 0 ? (gainLoss / pricedInvested) * 100 : 0);

	function fmtMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}

	// Client-side filter over the server-rendered list. The input is a plain
	// field (no form submission) — filtering is purely cosmetic, no data
	// changes, so it's fine to skip the server round-trip when JS is on. The
	// entire list is already server-rendered so without JS the user simply
	// sees every row.
	let searchQuery = $state('');
	let filteredEntries = $derived(
		searchQuery
			? entries.filter((e) => {
					const card = cardCache[e.card_id];
					const haystack = `${e.card_id} ${card?.name ?? ''} ${card?.set.name ?? ''}`.toLowerCase();
					return haystack.includes(searchQuery.toLowerCase());
				})
			: entries
	);

	// Unique owned cards that carry at least one honesty-gated signal.
	// Insight strip + sort answer "what should I act on?" instead of the
	// page just totalling money.
	interface OwnedSignal {
		id: string;
		card: PokemonCard;
		d: DiscoverySignals;
	}
	let ownedSignals = $derived(
		Array.from(new Set(entries.map((e) => e.card_id)))
			.map((id) => ({ id, card: cardCache[id], d: discoveryByCard[id] }))
			.filter((x): x is OwnedSignal => x.card != null && x.d != null)
	);

	function topBy(
		metric: (d: DiscoverySignals) => number | null,
		dir: 'desc' | 'asc'
	): OwnedSignal | null {
		const pool = ownedSignals.filter((x) => metric(x.d) != null);
		if (pool.length === 0) return null;
		return pool.reduce((best, x) =>
			dir === 'desc'
				? metric(x.d)! > metric(best.d)!
					? x
					: best
				: metric(x.d)! < metric(best.d)!
					? x
					: best
		);
	}

	interface Insight {
		key: string;
		label: string;
		detail: string;
		accent: string;
		o: OwnedSignal;
	}
	let insights = $derived(
		(
			[
				(() => {
					const o = topBy((d) => d.psa10_delta, 'desc');
					return o
						? {
								key: 'undervalued',
								label: 'Most undervalued you own',
								detail: `+${fmtMoney(o.d.psa10_delta)} raw → PSA 10${o.d.psa10_multiple != null ? ` (${o.d.psa10_multiple}×)` : ''}`,
								accent: 'text-vault-green',
								o
							}
						: null;
				})(),
				(() => {
					const o = topBy((d) => d.scarcity_rank, 'desc');
					return o
						? {
								key: 'scarcest',
								label: 'Scarcest you own',
								detail: `Scarcity rank ${o.d.scarcity_rank}/100`,
								accent: 'text-vault-purple',
								o
							}
						: null;
				})(),
				(() => {
					const o = topBy((d) => d.gem_rate, 'asc');
					return o
						? {
								key: 'hardest_gem',
								label: 'Hardest to gem you own',
								detail: `${o.d.gem_rate}% PSA gem rate (lower = harder pull)`,
								accent: 'text-vault-gold',
								o
							}
						: null;
				})(),
				(() => {
					const o = topBy((d) => d.value_rank, 'desc');
					return o
						? {
								key: 'top_value',
								label: 'Top Value rank you own',
								detail: `Value rank ${o.d.value_rank}/100`,
								accent: 'text-vault-purple',
								o
							}
						: null;
				})()
			] as (Insight | null)[]
		).filter((x): x is Insight => x != null)
	);

	// Client-side sort over the (already filtered) list. Cosmetic, no data
	// mutation — fine to skip the server round-trip. Cards lacking the
	// chosen signal sink to the bottom (shown, never hidden — rankings
	// doctrine), then fall back to the server's created_at order.
	type SortMode = 'recent' | 'undervalued' | 'scarcest' | 'hardest_gem' | 'top_value';
	let sortMode = $state<SortMode>('recent');
	const SORT_LABELS: Record<SortMode, string> = {
		recent: 'Recently added',
		undervalued: 'Most undervalued',
		scarcest: 'Scarcest',
		hardest_gem: 'Hardest to gem',
		top_value: 'Top Value rank'
	};
	function sortKey(cardId: string, mode: SortMode): number | null {
		const d = discoveryByCard[cardId];
		if (!d) return null;
		if (mode === 'undervalued') return d.psa10_delta;
		if (mode === 'scarcest') return d.scarcity_rank;
		if (mode === 'hardest_gem') return d.gem_rate;
		if (mode === 'top_value') return d.value_rank;
		return null;
	}
	let sortedEntries = $derived.by(() => {
		if (sortMode === 'recent') return filteredEntries;
		const asc = sortMode === 'hardest_gem';
		return [...filteredEntries].sort((a, b) => {
			const ka = sortKey(a.card_id, sortMode);
			const kb = sortKey(b.card_id, sortMode);
			if (ka == null && kb == null) return 0;
			if (ka == null) return 1; // nulls sink
			if (kb == null) return -1;
			return asc ? ka - kb : kb - ka;
		});
	});

	const conditionLabels: Record<CardCondition, string> = {
		NM: 'Near Mint',
		LP: 'Lightly Played',
		MP: 'Moderately Played',
		HP: 'Heavily Played',
		DMG: 'Damaged'
	};
</script>

<svelte:head>
	<title>{tab === 'watchlist' ? 'Watchlist' : 'My Collection'} — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">
				{tab === 'watchlist' ? 'My Watchlist' : 'My Collection'}
			</h1>
			<p class="mt-1 text-vault-text-muted">
				{tab === 'watchlist'
					? 'Cards you’re tracking — alerts fire when prices hit your targets'
					: 'Track every card you own'}
			</p>
		</div>
		{#if tab === 'collection'}
			<!--
				"+ Add Card" navigates to the dedicated /collection/add page — a
				search-engine style flow with live autosuggest (card_index) that
				redirects back here once a card is added. Replaced the old in-page
				modal, which searched the flaky pokemontcg.io API and errored on
				mobile.
			-->
			<a
				href="/collection/add"
				data-testid="open-add-modal"
				class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2 text-sm font-medium text-vault-bg shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40"
			>
				+ Add Card
			</a>
		{/if}
	</div>

	<!-- Tab strip — Sprint 1D-i fold. Watchlist used to be its own page;
	     it's now a tab here so collection + watchlist share the page shell.
	     Plain <a> tags so the tabs work without JS (each click is a fresh
	     SSR load that picks up ?tab=). -->
	<div class="flex border-b border-vault-border" role="tablist" aria-label="Collection views">
		<a
			href="/collection"
			role="tab"
			aria-selected={tab === 'collection'}
			data-testid="tab-collection"
			class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors {tab ===
			'collection'
				? 'border-vault-accent text-white'
				: 'border-transparent text-vault-text-muted hover:text-white'}"
		>
			Collection
			<span class="rounded-full bg-vault-bg px-2 py-0.5 text-[10px] text-vault-text-muted">
				{entries.length}
			</span>
		</a>
		<a
			href="/collection?tab=watchlist"
			role="tab"
			aria-selected={tab === 'watchlist'}
			data-testid="tab-watchlist"
			class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors {tab ===
			'watchlist'
				? 'border-vault-accent text-white'
				: 'border-transparent text-vault-text-muted hover:text-white'}"
		>
			Watchlist
			<span class="rounded-full bg-vault-bg px-2 py-0.5 text-[10px] text-vault-text-muted">
				{watchlist.entries.length}
			</span>
			{#if watchlist.triggeredCount > 0}
				<span
					class="rounded-full bg-vault-green/20 px-2 py-0.5 text-[10px] font-bold text-vault-green"
					title="{watchlist.triggeredCount} alert{watchlist.triggeredCount === 1 ? '' : 's'} triggered"
				>
					{watchlist.triggeredCount}
				</span>
			{/if}
		</a>
	</div>

	{#if tab === 'watchlist'}
		<WatchlistView
			entries={watchlist.entries}
			cardCache={watchlist.cardCache}
			valuationByEntry={watchlist.valuationByEntry}
			triggeredCount={watchlist.triggeredCount}
		/>
	{:else}

	<!-- Summary -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{totalCards}</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">{uniqueCards} unique · {entries.length} entries</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Current Value</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">{fmtMoney(currentValue)}</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">NM raw × condition discount</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Invested</p>
			<p class="mt-1 text-2xl font-bold text-white">{fmtMoney(totalInvested)}</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">
				{#if pricedInvested < totalInvested || pricedInvested === 0}
					Only rows with a recorded price
				{:else}
					All {entries.length} entries priced
				{/if}
			</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Gain / Loss</p>
			{#if pricedInvested > 0}
				<p class="mt-1 text-2xl font-bold {gainLoss >= 0 ? 'text-vault-green' : 'text-vault-red'}">
					{gainLoss >= 0 ? '+' : ''}{fmtMoney(gainLoss)}
				</p>
				<p class="mt-0.5 text-[11px] {gainLoss >= 0 ? 'text-vault-green/80' : 'text-vault-red/80'}">
					{gainLoss >= 0 ? '+' : ''}{gainLossPct.toFixed(1)}% vs invested
				</p>
			{:else}
				<p class="mt-1 text-2xl font-bold text-vault-text-muted">—</p>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">Add purchase prices to track</p>
			{/if}
		</div>
	</div>

	<!-- Insight strip — "what should I act on?" Surfaces the discovery
	     signals every owned card already carries. Each card shown only when
	     its signal is real/eligible (server-gated; null ⇒ omitted entirely).
	     Modeled ranks render purple ("rank", not money). -->
	{#if insights.length > 0}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="insight-strip">
			{#each insights as ins (ins.key)}
				<a
					href="/card/{ins.o.id}"
					data-testid="insight-{ins.key}"
					class="stat-card group flex items-center gap-3 rounded-2xl border border-vault-border bg-vault-surface p-3 transition-all hover:border-vault-purple/40"
				>
					<img
						src={ins.o.card.images.small}
						alt={ins.o.card.name}
						loading="lazy"
						class="h-16 w-11 flex-shrink-0 rounded-lg object-cover"
					/>
					<div class="min-w-0">
						<p class="text-[11px] uppercase tracking-wide text-vault-text-muted">{ins.label}</p>
						<p class="truncate text-sm font-medium text-white group-hover:text-vault-purple">{ins.o.card.name}</p>
						<p class="mt-0.5 text-xs font-semibold {ins.accent}">{ins.detail}</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}

	<!-- Collection Table -->
	<div class="rounded-2xl border border-vault-border bg-vault-surface">
		<div class="flex flex-col gap-2 border-b border-vault-border px-3 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search your collection..."
				class="w-full flex-1 rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
			/>
			<select
				bind:value={sortMode}
				data-testid="collection-sort"
				aria-label="Sort collection"
				class="rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
			>
				{#each Object.entries(SORT_LABELS) as [val, lbl]}
					<option value={val}>{lbl}</option>
				{/each}
			</select>
		</div>

		{#if filteredEntries.length > 0}
			<div class="divide-y divide-vault-border" data-testid="collection-list">
				{#each sortedEntries as entry (entry.id)}
					{@const card = cardCache[entry.card_id]}
					<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4" data-testid="collection-row" data-card-id={entry.card_id}>
						<!-- Card thumbnail -->
						{#if card}
							<a href="/card/{card.id}" class="flex-shrink-0">
								<img
									src={card.images.small}
									alt={card.name}
									class="h-20 w-14 rounded-lg object-cover"
								/>
							</a>
						{:else}
							<div class="flex h-20 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-vault-bg text-xs text-vault-text-muted">
								...
							</div>
						{/if}

						<!-- Card info -->
						<div class="min-w-0 flex-1">
							{#if card}
								<a href="/card/{card.id}" class="font-medium text-white hover:text-vault-purple">
									{card.name}
								</a>
								<p class="text-xs text-vault-text-muted">{card.set.name} · #{card.number}</p>
							{:else}
								<p class="font-medium text-white">{entry.card_id}</p>
							{/if}
							<div class="mt-1 flex flex-wrap gap-2">
								<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-text-muted">
									{conditionLabels[entry.condition as CardCondition] ?? entry.condition}
								</span>
								{#if entry.purchase_price}
									<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-gold">
										${entry.purchase_price} ea · cost
									</span>
								{/if}
								{#if valuationByEntry[entry.id]?.unit_value != null}
									{@const val = valuationByEntry[entry.id]}
									{@const valTitle =
										val.value_source === 'real_comp'
											? `Real ${entry.condition} median · TCGPlayer active comps (n=${val.sample_count ?? 0}, as of ${val.as_of})`
											: val.value_source === 'raw_nm'
												? 'PriceCharting Ungraded NM (canonical raw price)'
												: val.value_source === 'estimate'
													? `Estimated: NM ${fmtMoney(val.nm_price)} × ${Math.round(val.discount * 100)}% ${entry.condition} discount — no real ${entry.condition} comp available`
													: 'No price data'}
									<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-green" title={valTitle}>
										{fmtMoney(val.unit_value)} ea · value{val.is_estimate ? ' (est.)' : ''}{#if val.value_source === 'real_comp' && (val.sample_count ?? 0) < 10}<span class="ml-1 italic text-amber-400">low n</span>{/if}
									</span>
									{#if entry.purchase_price != null}
										{@const delta = (val.unit_value ?? 0) - entry.purchase_price}
										<span class="rounded bg-vault-bg px-2 py-0.5 text-xs {delta >= 0 ? 'text-vault-green' : 'text-vault-red'}">
											{delta >= 0 ? '+' : ''}{fmtMoney(delta)} ea
										</span>
									{/if}
								{/if}
								{#if entry.notes}
									<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-text-muted">
										{entry.notes}
									</span>
								{/if}
								<!-- Discovery signals — server-gated to real/eligible
								     values (null ⇒ not rendered). Purple = modeled
								     rank, gold/green = real acquired data. -->
								{#if discoveryByCard[entry.card_id]}
									{@const disc = discoveryByCard[entry.card_id]}
									{#if disc.value_rank != null}
										<span class="rounded border border-vault-purple/40 bg-vault-bg px-2 py-0.5 text-xs font-semibold text-vault-purple" title="Value rank {disc.value_rank}/100 — PSA 10 price percentile across the catalog (high/medium confidence only)">
											Val {disc.value_rank}
										</span>
									{/if}
									{#if disc.scarcity_rank != null}
										<span class="rounded border border-vault-purple/40 bg-vault-bg px-2 py-0.5 text-xs font-semibold text-vault-purple" title="Scarcity rank {disc.scarcity_rank}/100 — inverse graded population (high/medium confidence only)">
											Scarce {disc.scarcity_rank}
										</span>
									{/if}
									{#if disc.gem_rate != null}
										<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-gold" title="Real PSA gem rate — {disc.gem_rate}% of graded copies are a 10 (lower = harder pull)">
											{disc.gem_rate}% gem
										</span>
									{/if}
									{#if disc.psa10_delta != null}
										<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-green" title="Real raw → PSA 10 uplift on this card{disc.psa10_multiple != null ? ` (${disc.psa10_multiple}× multiple)` : ''}">
											+{fmtMoney(disc.psa10_delta)} → PSA 10{#if disc.psa10_multiple != null}<span class="ml-1 text-vault-text-muted">({disc.psa10_multiple}×)</span>{/if}
										</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Quantity controls (tiny forms) -->
						<div class="flex items-center gap-2">
							<form method="POST" action="?/decrement" use:enhance class="contents">
								<input type="hidden" name="id" value={entry.id} />
								<button
									type="submit"
									data-testid="qty-decrement"
									class="flex h-10 w-10 items-center justify-center rounded-xl border border-vault-border text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
									aria-label="Decrease quantity"
								>
									-
								</button>
							</form>
							<span class="w-8 text-center text-sm font-bold text-white" data-testid="qty">{entry.quantity}</span>
							<form method="POST" action="?/increment" use:enhance class="contents">
								<input type="hidden" name="id" value={entry.id} />
								<button
									type="submit"
									data-testid="qty-increment"
									class="flex h-10 w-10 items-center justify-center rounded-xl border border-vault-border text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
									aria-label="Increase quantity"
								>
									+
								</button>
							</form>
						</div>

						<!-- Delete -->
						<form method="POST" action="?/remove" use:enhance class="contents">
							<input type="hidden" name="id" value={entry.id} />
							<button
								type="submit"
								data-testid="remove-entry"
								class="flex-shrink-0 rounded-lg p-2 text-vault-text-muted transition-colors hover:bg-vault-red/10 hover:text-vault-red"
								aria-label="Remove from collection"
							>
								<Icon name="trash" class="h-4 w-4" />
							</button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex items-center justify-center py-16 text-vault-text-muted">
				<div class="text-center">
					{#if searchQuery}
						<p class="text-lg">No matching cards</p>
						<p class="mt-1 text-sm">Try a different search term</p>
					{:else}
						<p class="text-lg">No cards in your collection yet</p>
						<p class="mt-1 text-sm">Browse cards and add them to start tracking!</p>
						<a href="/browse" class="mt-4 inline-block btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2 text-sm font-medium text-vault-bg shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40">
							Browse Cards
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	{/if}
</div>
