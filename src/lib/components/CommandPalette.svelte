<!--
	⌘K command palette — global keyboard shortcut that opens an overlay
	with a text input, instant card search from card_index, and a
	static list of page shortcuts. Intended as the daily-use "where
	do I want to go / what card do I want to see" jumping-off point.

	Keyboard:
	  ⌘K / Ctrl+K  open
	  Esc          close
	  ↑ / ↓        move selection
	  Enter        activate
	  Type         refine filter (cards + commands rank together)

	The palette mounts once at the layout level and listens for the
	keydown globally, so any page can trigger it. Result clicks
	navigate with goto(), falling back to <a href> for no-JS users —
	they'll just never see the palette since it's gated on JS anyway.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Icon } from '$components';

	interface CardHit {
		card_id: string;
		name: string;
		set_name: string;
		card_number: string | null;
		rarity: string | null;
		image_small_url: string | null;
		raw_nm_price: number | null;
		psa10_price: number | null;
	}

	interface PageShortcut {
		label: string;
		description: string;
		href: string;
		keywords: string;
	}

	const PAGE_SHORTCUTS: PageShortcut[] = [
		{ label: 'Dashboard', description: 'Portfolio + triggered alerts', href: '/', keywords: 'home portfolio' },
		{ label: 'Browse', description: 'Live TCG API + hunt mode', href: '/browse', keywords: 'cards search' },
		{ label: 'Sleeper Hunter', description: 'Sleeper filters on card_index', href: '/browse?mode=hunt', keywords: 'hunt sleeper low pop' },
		{ label: 'Collection', description: 'Your cards + gain/loss', href: '/collection', keywords: 'my cards portfolio' },
		{ label: 'Watchlist', description: 'Triggered alerts + targets', href: '/watchlist', keywords: 'alerts targets' },
		{ label: 'Grading', description: 'ROI scorecard', href: '/grading', keywords: 'psa grade value' },
		{ label: 'Insights', description: 'Undervalued, heatmap, movers, sets', href: '/insights', keywords: 'market insights' },
		{ label: 'Analytics', description: 'Portfolio analytics', href: '/analytics', keywords: 'charts stats' },
		{ label: 'Sets', description: 'Set completion + releases', href: '/sets', keywords: 'set tracker releases' },
		{ label: 'Card Index', description: 'Admin: enrichment state', href: '/admin/index', keywords: 'admin enrichment' }
	];

	let open = $state(false);
	let query = $state('');
	let results = $state<CardHit[]>([]);
	let selectedIdx = $state(0);
	let loading = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	// Track the most recent in-flight request so stale responses don't
	// overwrite fresh ones when the user types fast.
	let requestSeq = 0;

	const filteredPages = $derived.by(() => {
		if (!query.trim()) return PAGE_SHORTCUTS;
		const q = query.toLowerCase();
		return PAGE_SHORTCUTS.filter(
			(p) =>
				p.label.toLowerCase().includes(q) ||
				p.description.toLowerCase().includes(q) ||
				p.keywords.toLowerCase().includes(q)
		);
	});

	const flatItems = $derived.by<Array<{ type: 'page' | 'card'; data: PageShortcut | CardHit }>>(
		() => [
			...filteredPages.map((p) => ({ type: 'page' as const, data: p })),
			...results.map((c) => ({ type: 'card' as const, data: c }))
		]
	);

	$effect(() => {
		// Clamp selection if results shrank
		if (selectedIdx >= flatItems.length) selectedIdx = Math.max(0, flatItems.length - 1);
	});

	function fmtMoney(n: number | null): string {
		if (n == null) return '';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}

	async function runSearch(q: string) {
		if (q.trim().length < 2) {
			results = [];
			return;
		}
		const seq = ++requestSeq;
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (seq !== requestSeq) return; // a newer request arrived
			const json = await res.json();
			results = (json.results ?? []) as CardHit[];
		} catch {
			if (seq === requestSeq) results = [];
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	// Debounce — 120ms feels responsive but avoids firing per keystroke.
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const q = query;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => runSearch(q), 120);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	function openPalette() {
		open = true;
		query = '';
		results = [];
		selectedIdx = 0;
		setTimeout(() => inputEl?.focus(), 0);
	}

	function closePalette() {
		open = false;
		query = '';
		results = [];
	}

	function activate(item: { type: 'page' | 'card'; data: PageShortcut | CardHit }) {
		if (item.type === 'page') {
			goto((item.data as PageShortcut).href);
		} else {
			goto(`/card/${(item.data as CardHit).card_id}`);
		}
		closePalette();
	}

	function onKeydown(e: KeyboardEvent) {
		// Global open shortcut
		const isMetaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
		if (isMetaK) {
			e.preventDefault();
			if (open) closePalette();
			else openPalette();
			return;
		}
		if (!open) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			closePalette();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIdx = Math.min(flatItems.length - 1, selectedIdx + 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIdx = Math.max(0, selectedIdx - 1);
			return;
		}
		if (e.key === 'Enter') {
			const item = flatItems[selectedIdx];
			if (item) {
				e.preventDefault();
				activate(item);
			}
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<div class="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[15vh]" role="dialog" aria-modal="true" aria-label="Command palette">
		<button
			type="button"
			aria-label="Close command palette"
			class="fixed inset-0 bg-black/60 backdrop-blur-sm"
			onclick={closePalette}
		></button>
		<div class="relative w-full max-w-xl rounded-2xl border border-vault-border bg-vault-surface shadow-2xl">
			<div class="flex items-center gap-3 border-b border-vault-border px-4 py-3">
				<Icon name="search" class="h-5 w-5 text-vault-text-muted" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Search cards, jump to a page… (⌘K)"
					class="flex-1 bg-transparent text-sm text-white placeholder-vault-text-muted focus:outline-none"
				/>
				<kbd class="rounded border border-vault-border px-1.5 py-0.5 text-[10px] text-vault-text-muted">esc</kbd>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-2">
				{#if filteredPages.length > 0}
					<p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-vault-text-muted">Jump to</p>
					{#each filteredPages as page, i}
						{@const idx = i}
						<button
							type="button"
							onclick={() => activate({ type: 'page', data: page })}
							onmouseenter={() => (selectedIdx = idx)}
							class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition {selectedIdx === idx ? 'bg-vault-purple/20' : 'hover:bg-vault-surface-hover'}"
						>
							<Icon name="chevron-right" class="h-4 w-4 text-vault-purple" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-white">{page.label}</p>
								<p class="truncate text-[11px] text-vault-text-muted">{page.description}</p>
							</div>
						</button>
					{/each}
				{/if}

				{#if query.trim().length >= 2}
					<p class="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-vault-text-muted">
						Cards{#if loading}<span class="ml-2 text-vault-purple">searching…</span>{/if}
					</p>
					{#if results.length === 0 && !loading}
						<p class="px-2 py-2 text-xs text-vault-text-muted">No cards match "{query}" in the index.</p>
					{/if}
					{#each results as card, i}
						{@const idx = filteredPages.length + i}
						<button
							type="button"
							onclick={() => activate({ type: 'card', data: card })}
							onmouseenter={() => (selectedIdx = idx)}
							class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition {selectedIdx === idx ? 'bg-vault-purple/20' : 'hover:bg-vault-surface-hover'}"
						>
							{#if card.image_small_url}
								<img src={card.image_small_url} alt={card.name} class="h-12 w-9 rounded object-cover" loading="lazy" />
							{:else}
								<div class="h-12 w-9 rounded bg-vault-bg"></div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-white">{card.name}</p>
								<p class="truncate text-[11px] text-vault-text-muted">
									{card.set_name}{#if card.card_number} · #{card.card_number}{/if}{#if card.rarity} · {card.rarity}{/if}
								</p>
							</div>
							{#if card.raw_nm_price != null}
								<span class="text-xs font-semibold text-vault-gold">{fmtMoney(card.raw_nm_price)}</span>
							{/if}
						</button>
					{/each}
				{:else if query.trim().length === 1}
					<p class="mt-2 px-2 py-2 text-xs text-vault-text-muted">Keep typing — at least 2 characters.</p>
				{/if}
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-vault-border px-4 py-2 text-[10px] text-vault-text-muted">
				<span><kbd class="rounded border border-vault-border px-1">↑</kbd> <kbd class="rounded border border-vault-border px-1">↓</kbd> to navigate</span>
				<span><kbd class="rounded border border-vault-border px-1">↵</kbd> to open</span>
			</div>
		</div>
	</div>
{/if}
