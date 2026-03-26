<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { CollectionEntry, PokemonCard, CardCondition } from '$types';

	let { data } = $props();

	let entries = $derived(data.entries as CollectionEntry[]);
	let loading = $state(false);
	let searchQuery = $state('');
	let showAddModal = $state(false);
	let editingEntry = $state<CollectionEntry | null>(null);

	// Card search for add modal
	let cardSearchQuery = $state('');
	let cardSearchResults = $state<PokemonCard[]>([]);
	let searchingCards = $state(false);
	let selectedCard = $state<PokemonCard | null>(null);

	// Add form state
	let addQuantity = $state(1);
	let addCondition = $state<CardCondition>('NM');
	let addPurchasePrice = $state('');
	let addPurchaseDate = $state('');
	let addNotes = $state('');

	// Filtered entries
	let filteredEntries = $derived(
		searchQuery
			? entries.filter((e) => e.card_id.toLowerCase().includes(searchQuery.toLowerCase()))
			: entries
	);

	// Stats
	let totalCards = $derived(entries.reduce((sum, e) => sum + e.quantity, 0));
	let totalInvested = $derived(
		entries.reduce((sum, e) => sum + (e.purchase_price ?? 0) * e.quantity, 0)
	);
	let uniqueCards = $derived(new Set(entries.map((e) => e.card_id)).size);

	// Card lookup cache — maps card_id to card data for display
	let cardCache = $state<Record<string, PokemonCard>>({});

	// Fetch card data for display
	async function lookupCard(cardId: string): Promise<PokemonCard | null> {
		if (cardCache[cardId]) return cardCache[cardId];
		try {
			const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
			if (!res.ok) return null;
			const json = await res.json();
			cardCache[cardId] = json.data;
			return json.data;
		} catch {
			return null;
		}
	}

	// Load card data for all entries on mount
	$effect(() => {
		for (const entry of entries) {
			if (!cardCache[entry.card_id]) {
				lookupCard(entry.card_id);
			}
		}
	});

	// Search for cards to add
	async function searchCards() {
		if (!cardSearchQuery.trim()) return;
		searchingCards = true;
		try {
			const res = await fetch(`/api/cards?q=name:"${cardSearchQuery}*"&pageSize=12`);
			const result = await res.json();
			cardSearchResults = result.data ?? [];
		} catch {
			cardSearchResults = [];
		} finally {
			searchingCards = false;
		}
	}

	function selectCard(card: PokemonCard) {
		selectedCard = card;
		cardSearchResults = [];
		cardSearchQuery = card.name;
	}

	async function addToCollection() {
		if (!selectedCard) return;
		loading = true;
		try {
			const res = await fetch('/api/collection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					card_id: selectedCard.id,
					quantity: addQuantity,
					condition: addCondition,
					purchase_price: addPurchasePrice ? parseFloat(addPurchasePrice) : null,
					purchase_date: addPurchaseDate || null,
					notes: addNotes || null
				})
			});
			if (res.ok) {
				// Cache the card data
				cardCache[selectedCard.id] = selectedCard;
				closeAddModal();
				await invalidateAll();
			}
		} finally {
			loading = false;
		}
	}

	async function removeEntry(id: string) {
		const res = await fetch(`/api/collection?id=${id}`, { method: 'DELETE' });
		if (res.ok) await invalidateAll();
	}

	async function updateQuantity(entry: CollectionEntry, delta: number) {
		const newQty = entry.quantity + delta;
		if (newQty <= 0) {
			removeEntry(entry.id);
			return;
		}
		await fetch('/api/collection', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: entry.id, quantity: newQty })
		});
		await invalidateAll();
	}

	function openAddModal() {
		showAddModal = true;
		selectedCard = null;
		cardSearchQuery = '';
		cardSearchResults = [];
		addQuantity = 1;
		addCondition = 'NM';
		addPurchasePrice = '';
		addPurchaseDate = '';
		addNotes = '';
	}

	function closeAddModal() {
		showAddModal = false;
		selectedCard = null;
	}

	const conditionLabels: Record<CardCondition, string> = {
		NM: 'Near Mint',
		LP: 'Lightly Played',
		MP: 'Moderately Played',
		HP: 'Heavily Played',
		DMG: 'Damaged'
	};
</script>

<svelte:head>
	<title>My Collection — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gradient">My Collection</h1>
			<p class="mt-1 text-vault-text-muted">Track every card you own</p>
		</div>
		<button
			onclick={openAddModal}
			class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40"
		>
			+ Add Card
		</button>
	</div>

	<!-- Summary -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{totalCards}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Unique Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{uniqueCards}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Invested</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">${totalInvested.toFixed(2)}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Entries</p>
			<p class="mt-1 text-2xl font-bold text-white">{entries.length}</p>
		</div>
	</div>

	<!-- Collection Table -->
	<div class="rounded-2xl border border-vault-border bg-vault-surface">
		<div class="border-b border-vault-border px-6 py-4">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search your collection..."
				class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
			/>
		</div>

		{#if filteredEntries.length > 0}
			<div class="divide-y divide-vault-border">
				{#each filteredEntries as entry (entry.id)}
					{@const card = cardCache[entry.card_id]}
					<div class="flex items-center gap-4 px-6 py-4">
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
										${entry.purchase_price} ea
									</span>
								{/if}
								{#if entry.notes}
									<span class="rounded bg-vault-bg px-2 py-0.5 text-xs text-vault-text-muted">
										{entry.notes}
									</span>
								{/if}
							</div>
						</div>

						<!-- Quantity controls -->
						<div class="flex items-center gap-2">
							<button
								onclick={() => updateQuantity(entry, -1)}
								class="flex h-8 w-8 items-center justify-center rounded-lg border border-vault-border text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
							>
								-
							</button>
							<span class="w-8 text-center text-sm font-bold text-white">{entry.quantity}</span>
							<button
								onclick={() => updateQuantity(entry, 1)}
								class="flex h-8 w-8 items-center justify-center rounded-lg border border-vault-border text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
							>
								+
							</button>
						</div>

						<!-- Delete -->
						<button
							onclick={() => removeEntry(entry.id)}
							class="flex-shrink-0 rounded-lg p-2 text-vault-text-muted transition-colors hover:bg-vault-red/10 hover:text-vault-red"
							aria-label="Remove from collection"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
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
						<a href="/browse" class="mt-4 inline-block btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40">
							Browse Cards
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Add Card Modal -->
{#if showAddModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button aria-label="Close modal" class="fixed inset-0 bg-black/60" onclick={closeAddModal}></button>
		<div class="relative w-full max-w-lg rounded-2xl border border-vault-border bg-vault-surface p-6 shadow-2xl">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Add Card to Collection</h2>
				<button onclick={closeAddModal} class="text-vault-text-muted hover:text-white" aria-label="Close">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="mt-4 space-y-4">
				<!-- Card search -->
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="card-search">Search Card</label>
					<div class="relative mt-1">
						<input
							id="card-search"
							type="text"
							bind:value={cardSearchQuery}
							oninput={() => { if (cardSearchQuery.length >= 2) searchCards(); }}
							placeholder="Type a card name..."
							class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
						/>
						{#if searchingCards}
							<div class="absolute right-3 top-2.5">
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-vault-accent border-t-transparent"></div>
							</div>
						{/if}
					</div>

					<!-- Search results dropdown -->
					{#if cardSearchResults.length > 0}
						<div class="mt-1 max-h-48 overflow-y-auto rounded-lg border border-vault-border bg-vault-bg">
							{#each cardSearchResults as result}
								<button
									onclick={() => selectCard(result)}
									class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-vault-surface-hover"
								>
									<img src={result.images.small} alt={result.name} class="h-10 w-7 rounded object-cover" />
									<div>
										<p class="text-sm text-white">{result.name}</p>
										<p class="text-xs text-vault-text-muted">{result.set.name} · #{result.number}</p>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Selected card preview -->
				{#if selectedCard}
					<div class="flex items-center gap-3 rounded-lg border border-vault-purple/30 bg-vault-purple/5 p-3">
						<img src={selectedCard.images.small} alt={selectedCard.name} class="h-16 w-11 rounded object-cover" />
						<div>
							<p class="font-medium text-white">{selectedCard.name}</p>
							<p class="text-xs text-vault-text-muted">{selectedCard.set.name} · {selectedCard.rarity ?? 'Unknown'}</p>
						</div>
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="quantity">Quantity</label>
						<input
							id="quantity"
							type="number"
							min="1"
							bind:value={addQuantity}
							class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="condition">Condition</label>
						<select
							id="condition"
							bind:value={addCondition}
							class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
						>
							<option value="NM">Near Mint</option>
							<option value="LP">Lightly Played</option>
							<option value="MP">Moderately Played</option>
							<option value="HP">Heavily Played</option>
							<option value="DMG">Damaged</option>
						</select>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="purchase-price">Purchase Price ($)</label>
						<input
							id="purchase-price"
							type="number"
							step="0.01"
							min="0"
							bind:value={addPurchasePrice}
							placeholder="0.00"
							class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="purchase-date">Purchase Date</label>
						<input
							id="purchase-date"
							type="date"
							bind:value={addPurchaseDate}
							class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="notes">Notes</label>
					<input
						id="notes"
						type="text"
						bind:value={addNotes}
						placeholder="Optional notes..."
						class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
					/>
				</div>

				<button
					onclick={addToCollection}
					disabled={!selectedCard || loading}
					class="w-full rounded-lg bg-vault-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover disabled:opacity-50"
				>
					{loading ? 'Adding...' : 'Add to Collection'}
				</button>
			</div>
		</div>
	</div>
{/if}
