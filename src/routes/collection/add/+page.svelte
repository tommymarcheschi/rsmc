<!--
	Add-a-card page — a dedicated search-engine style flow that replaced the
	old in-page modal (which searched the flaky pokemontcg.io API and surfaced
	an error on mobile).

	Two-step flow:
	  1. Type → live autosuggest from /api/search (card_index, fast + reliable).
	  2. Pick a card → fill quantity/condition/price → "Add to Collection"
	     POSTs to ?/addEntry which redirects back to /collection.

	Works without JS too: the search box is a native GET form (?q=… runs the
	search server-side in +page.server.ts), each result is a real link
	(?card=…), and the add form is a native POST.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Icon } from '$components';
	import type { CardLite } from './+page.server';

	let { data, form } = $props();

	let mounted = $state(false);
	let query = $state(data.q ?? '');
	// Live (client) autosuggest results. Before mount / no-JS we fall back to
	// the server-rendered data.results so the page is never empty.
	let liveResults = $state<CardLite[]>([]);
	let loading = $state(false);
	let selected = $state<CardLite | null>(data.selected ?? null);
	let inputEl = $state<HTMLInputElement | null>(null);

	let results = $derived(mounted ? liveResults : (data.results as CardLite[]));
	// addEntry only returns a payload on failure (fail({ message })); success
	// throws a redirect, so a non-null form here always means an error.
	let saveError = $derived((form as { message?: string } | null)?.message ?? null);

	// Track the latest in-flight request so a slow earlier response can't
	// clobber a newer one when typing fast (mirrors CommandPalette).
	let requestSeq = 0;

	function fmtMoney(n: number | null): string {
		if (n == null) return '';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}

	async function runSearch(q: string) {
		if (q.trim().length < 2) {
			liveResults = [];
			loading = false;
			return;
		}
		const seq = ++requestSeq;
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (seq !== requestSeq) return; // a newer request superseded this one
			const json = await res.json();
			liveResults = (json.results ?? []) as CardLite[];
		} catch {
			if (seq === requestSeq) liveResults = [];
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	// Debounce keystrokes — 120ms feels instant but avoids a request per key.
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!mounted) return;
		const q = query;
		// Picking a card hides the list; typing again clears the selection so
		// the search results come back.
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => runSearch(q), 120);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	function pick(card: CardLite) {
		selected = card;
		liveResults = [];
	}

	function clearSelection() {
		selected = null;
		setTimeout(() => inputEl?.focus(), 0);
	}

	onMount(() => {
		mounted = true;
		// Seed live results from the server render so a no-JS → JS handoff
		// (e.g. landing here via ?q=) keeps the list visible.
		liveResults = (data.results as CardLite[]) ?? [];
		if (!selected) inputEl?.focus();
	});

	const conditionLabels: Array<[string, string]> = [
		['NM', 'Near Mint'],
		['LP', 'Lightly Played'],
		['MP', 'Moderately Played'],
		['HP', 'Heavily Played'],
		['DMG', 'Damaged']
	];
</script>

<svelte:head>
	<title>Add a Card — Trove</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6">
	<!-- Header + back link -->
	<div class="flex items-center gap-3">
		<a
			href="/collection"
			data-testid="add-back"
			class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-vault-border text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
			aria-label="Back to collection"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gradient">Add a Card</h1>
			<p class="text-sm text-vault-text-muted">Search for a card to add to your collection</p>
		</div>
	</div>

	{#if !selected}
		<!-- Search box — native GET form for no-JS; typeahead enhances it. -->
		<form method="GET" action="/collection/add" class="relative" onsubmit={(e) => mounted && e.preventDefault()}>
			<input
				bind:this={inputEl}
				bind:value={query}
				name="q"
				type="text"
				autocomplete="off"
				placeholder="Type a card name…"
				data-testid="add-search-input"
				class="w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-3 pl-11 text-base text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
			/>
			<Icon name="search" class="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-vault-text-muted" />
			{#if loading}
				<span class="absolute right-4 top-3.5 text-xs text-vault-purple">searching…</span>
			{/if}
			<!-- Visible only to no-JS users; the typeahead replaces it otherwise. -->
			<noscript>
				<button type="submit" class="mt-2 w-full rounded-xl bg-vault-accent px-4 py-2 text-sm font-medium text-vault-bg">
					Search
				</button>
			</noscript>
		</form>

		<!-- Results -->
		{#if results.length > 0}
			<div class="overflow-hidden rounded-2xl border border-vault-border bg-vault-surface" data-testid="add-results">
				{#each results as card (card.card_id)}
					<a
						href="/collection/add?card={encodeURIComponent(card.card_id)}"
						data-testid="add-result"
						data-card-id={card.card_id}
						onclick={(e) => {
							if (!mounted) return;
							e.preventDefault();
							pick(card);
						}}
						class="flex w-full items-center gap-3 border-b border-vault-border px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-vault-surface-hover"
					>
						{#if card.image_small_url}
							<img src={card.image_small_url} alt={card.name} loading="lazy" class="h-14 w-10 flex-shrink-0 rounded object-cover" />
						{:else}
							<div class="h-14 w-10 flex-shrink-0 rounded bg-vault-bg"></div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-white">{card.name}</p>
							<p class="truncate text-xs text-vault-text-muted">
								{card.set_name}{#if card.card_number} · #{card.card_number}{/if}{#if card.rarity} · {card.rarity}{/if}
							</p>
						</div>
						{#if card.raw_nm_price != null}
							<span class="flex-shrink-0 text-sm font-semibold text-vault-gold">{fmtMoney(card.raw_nm_price)}</span>
						{/if}
					</a>
				{/each}
			</div>
		{:else if query.trim().length >= 2 && !loading}
			<p class="rounded-xl border border-vault-border bg-vault-surface px-4 py-6 text-center text-sm text-vault-text-muted">
				No cards match “{query}”.
			</p>
		{:else if query.trim().length < 2}
			<p class="px-1 text-sm text-vault-text-muted">Keep typing — at least 2 characters.</p>
		{/if}
	{:else}
		<!-- Selected card + add form -->
		<div class="flex items-center gap-3 rounded-2xl border border-vault-purple/30 bg-vault-purple/5 p-3" data-testid="add-selected">
			{#if selected.image_small_url}
				<img src={selected.image_small_url} alt={selected.name} class="h-20 w-14 flex-shrink-0 rounded object-cover" />
			{:else}
				<div class="h-20 w-14 flex-shrink-0 rounded bg-vault-bg"></div>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium text-white">{selected.name}</p>
				<p class="truncate text-xs text-vault-text-muted">
					{selected.set_name}{#if selected.card_number} · #{selected.card_number}{/if}
				</p>
				{#if selected.rarity}
					<p class="truncate text-xs text-vault-text-muted">{selected.rarity}</p>
				{/if}
			</div>
			<!-- Change pick: client clears state; no-JS falls back to the bare page. -->
			<a
				href="/collection/add"
				data-testid="add-change"
				onclick={(e) => {
					if (!mounted) return;
					e.preventDefault();
					clearSelection();
				}}
				class="flex-shrink-0 rounded-lg border border-vault-border px-3 py-1.5 text-xs text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
			>
				Change
			</a>
		</div>

		<form
			method="POST"
			action="?/addEntry"
			data-testid="add-form"
			class="space-y-4 rounded-2xl border border-vault-border bg-vault-surface p-4"
			use:enhance={() => {
				return async ({ result, update }) => {
					// addEntry throws a 303 redirect on success → enhance follows
					// it back to /collection. On failure we re-render with the error.
					if (result.type === 'redirect') {
						goto(result.location);
					} else {
						await update();
					}
				};
			}}
		>
			<input type="hidden" name="card_id" value={selected.card_id} />

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="quantity">Quantity</label>
					<input
						id="quantity"
						name="quantity"
						type="number"
						inputmode="numeric"
						min="1"
						value="1"
						class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="condition">Condition</label>
					<select
						id="condition"
						name="condition"
						class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					>
						{#each conditionLabels as [val, lbl]}
							<option value={val}>{lbl}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="purchase-price">Purchase Price ($)</label>
					<input
						id="purchase-price"
						name="purchase_price"
						type="number"
						inputmode="decimal"
						step="0.01"
						min="0"
						placeholder="0.00"
						class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="purchase-date">Purchase Date</label>
					<input
						id="purchase-date"
						name="purchase_date"
						type="date"
						class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<label class="block text-sm font-medium text-vault-text-muted" for="notes">Notes</label>
				<input
					id="notes"
					name="notes"
					type="text"
					placeholder="Optional notes…"
					class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				data-testid="add-submit"
				class="btn-press w-full rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-3 text-sm font-medium text-vault-bg shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40"
			>
				Add to Collection
			</button>
		</form>
	{/if}

	{#if saveError}
		<div class="rounded-xl border border-vault-accent/40 bg-vault-accent/10 px-4 py-3 text-sm text-vault-accent" data-testid="add-error">
			<span class="font-semibold">Couldn't save:</span> {saveError}
		</div>
	{/if}
</div>
