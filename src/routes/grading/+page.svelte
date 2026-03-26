<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { GradingEntry, GradingService, PokemonCard } from '$types';
	import type { GradingFees } from '$services/price-tracker';

	let { data } = $props();

	let submissions = $derived(data.submissions as GradingEntry[]);
	let gradingFees = $derived(data.gradingFees as GradingFees[]);

	// ROI Calculator state
	let roiSearchQuery = $state('');
	let roiSearchResults = $state<PokemonCard[]>([]);
	let roiSelectedCard = $state<PokemonCard | null>(null);
	let roiService = $state<GradingService>('PSA');
	let roiRawValue = $state('');
	let roiExpectedGrade = $state('9');
	let searchingROI = $state(false);

	// New submission state
	let showSubmitModal = $state(false);
	let subSearchQuery = $state('');
	let subSearchResults = $state<PokemonCard[]>([]);
	let subSelectedCard = $state<PokemonCard | null>(null);
	let subService = $state<GradingService>('PSA');
	let subTier = $state('regular');
	let subDate = $state('');
	let subCost = $state('');
	let searchingSub = $state(false);
	let submitting = $state(false);

	// Card cache for display
	let cardCache = $state<Record<string, PokemonCard>>({});

	$effect(() => {
		for (const sub of submissions) {
			if (!cardCache[sub.card_id]) lookupCard(sub.card_id);
		}
	});

	async function lookupCard(cardId: string) {
		if (cardCache[cardId]) return;
		try {
			const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
			if (!res.ok) return;
			const json = await res.json();
			cardCache[cardId] = json.data;
		} catch {}
	}

	async function searchCards(query: string, target: 'roi' | 'sub') {
		if (query.length < 2) return;
		const setSearching = target === 'roi' ? (v: boolean) => (searchingROI = v) : (v: boolean) => (searchingSub = v);
		const setResults = target === 'roi' ? (r: PokemonCard[]) => (roiSearchResults = r) : (r: PokemonCard[]) => (subSearchResults = r);

		setSearching(true);
		try {
			const res = await fetch(`/api/cards?q=name:"${query}*"&pageSize=8`);
			const result = await res.json();
			setResults(result.data ?? []);
		} catch {
			setResults([]);
		} finally {
			setSearching(false);
		}
	}

	// ROI calculation
	let selectedFees = $derived(gradingFees.find((f) => f.service === roiService));
	let gradingCost = $derived(selectedFees?.tiers.find((t) => t.name.toLowerCase().includes('regular'))?.cost ?? 50);
	let rawValue = $derived(parseFloat(roiRawValue) || 0);
	let expectedGrade = $derived(parseFloat(roiExpectedGrade) || 9);

	// Rough grade multipliers (PSA-style)
	const gradeMultipliers: Record<string, number> = {
		'10': 8, '9.5': 4, '9': 2.5, '8.5': 1.8, '8': 1.4,
		'7': 1.1, '6': 0.9, '5': 0.7, '4': 0.5
	};

	let estimatedGradedValue = $derived.by(() => {
		const mult = gradeMultipliers[roiExpectedGrade] ?? 1;
		return rawValue * mult;
	});

	let estimatedProfit = $derived(estimatedGradedValue - rawValue - gradingCost);
	let isWorthGrading = $derived(estimatedProfit > 0);

	// Submission CRUD
	async function addSubmission() {
		if (!subSelectedCard) return;
		submitting = true;
		try {
			const res = await fetch('/api/grading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					card_id: subSelectedCard.id,
					service: subService,
					tier: subTier,
					submitted_date: subDate || null,
					cost: subCost ? parseFloat(subCost) : null
				})
			});
			if (res.ok) {
				cardCache[subSelectedCard.id] = subSelectedCard;
				closeSubmitModal();
				await invalidateAll();
			}
		} finally {
			submitting = false;
		}
	}

	async function updateStatus(id: string, status: string) {
		await fetch('/api/grading', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, status })
		});
		await invalidateAll();
	}

	async function updateGrade(id: string, grade: string) {
		if (!grade) return;
		await fetch('/api/grading', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, grade: parseFloat(grade), status: 'complete', returned_date: new Date().toISOString().split('T')[0] })
		});
		await invalidateAll();
	}

	async function deleteSubmission(id: string) {
		await fetch(`/api/grading?id=${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function closeSubmitModal() {
		showSubmitModal = false;
		subSelectedCard = null;
		subSearchQuery = '';
		subSearchResults = [];
		subService = 'PSA';
		subTier = 'regular';
		subDate = '';
		subCost = '';
	}

	const statusColors: Record<string, string> = {
		pending: 'bg-yellow-500/15 text-yellow-400',
		submitted: 'bg-blue-500/15 text-blue-400',
		received: 'bg-purple-500/15 text-purple-400',
		grading: 'bg-orange-500/15 text-orange-400',
		shipped: 'bg-cyan-500/15 text-cyan-400',
		complete: 'bg-green-500/15 text-green-400'
	};

	let pendingCount = $derived(submissions.filter((s) => s.status !== 'complete').length);
	let completedCount = $derived(submissions.filter((s) => s.status === 'complete').length);
	let totalGradingCost = $derived(submissions.reduce((sum, s) => sum + (s.cost ?? 0), 0));
</script>

<svelte:head>
	<title>Grading — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Grading Center</h1>
			<p class="mt-1 text-vault-text-muted">Calculate ROI and track your grading submissions</p>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Submissions</p>
			<p class="mt-1 text-2xl font-bold text-white">{submissions.length}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">In Progress</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">{pendingCount}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Completed</p>
			<p class="mt-1 text-2xl font-bold text-vault-green">{completedCount}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Grading Cost</p>
			<p class="mt-1 text-2xl font-bold text-white">${totalGradingCost.toFixed(2)}</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
		<!-- ROI Calculator -->
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Grading ROI Calculator</h2>
			<p class="mt-1 text-sm text-vault-text-muted">See if a card is worth grading</p>
			<div class="mt-4 space-y-4">
				<!-- Card search -->
				<div class="relative">
					<input
						type="text"
						bind:value={roiSearchQuery}
						oninput={() => searchCards(roiSearchQuery, 'roi')}
						placeholder="Search for a card..."
						class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
					/>
					{#if roiSearchResults.length > 0}
						<div class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-vault-border bg-vault-bg shadow-xl">
							{#each roiSearchResults as result}
								<button
									onclick={() => {
										roiSelectedCard = result;
										roiSearchQuery = result.name;
										roiSearchResults = [];
										// Auto-fill raw value from TCGPlayer
										const firstPrice = result.tcgplayer?.prices ? Object.values(result.tcgplayer.prices)[0] : null;
										if (firstPrice?.market) roiRawValue = firstPrice.market.toFixed(2);
									}}
									class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-vault-surface-hover"
								>
									<img src={result.images.small} alt={result.name} class="h-10 w-7 rounded object-cover" />
									<div>
										<p class="text-sm text-white">{result.name}</p>
										<p class="text-xs text-vault-text-muted">{result.set.name}</p>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#if roiSelectedCard}
					<div class="flex items-center gap-3 rounded-lg border border-vault-purple/30 bg-vault-purple/5 p-3">
						<img src={roiSelectedCard.images.small} alt={roiSelectedCard.name} class="h-14 w-10 rounded object-cover" />
						<div>
							<p class="font-medium text-white">{roiSelectedCard.name}</p>
							<p class="text-xs text-vault-text-muted">{roiSelectedCard.set.name} · {roiSelectedCard.rarity ?? ''}</p>
						</div>
					</div>
				{/if}

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div>
						<label class="block text-xs text-vault-text-muted" for="roi-service">Service</label>
						<select id="roi-service" bind:value={roiService} class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none">
							<option value="PSA">PSA</option>
							<option value="CGC">CGC</option>
							<option value="BGS">BGS</option>
							<option value="SGC">SGC</option>
						</select>
					</div>
					<div>
						<label class="block text-xs text-vault-text-muted" for="roi-raw">Raw Value ($)</label>
						<input id="roi-raw" type="number" step="0.01" bind:value={roiRawValue} placeholder="0.00" class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-vault-text-muted" for="roi-grade">Expected Grade</label>
						<select id="roi-grade" bind:value={roiExpectedGrade} class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none">
							<option value="10">PSA 10 / Gem Mint</option>
							<option value="9.5">PSA 9.5</option>
							<option value="9">PSA 9 / Mint</option>
							<option value="8.5">PSA 8.5</option>
							<option value="8">PSA 8 / NM-MT</option>
							<option value="7">PSA 7 / NM</option>
							<option value="6">PSA 6 / EX-MT</option>
						</select>
					</div>
				</div>

				<!-- ROI Result -->
				{#if rawValue > 0}
					<div class="rounded-lg border {isWorthGrading ? 'border-vault-green/30 bg-vault-green/5' : 'border-vault-red/30 bg-vault-red/5'} p-4">
						<div class="flex items-center justify-between">
							<span class="text-sm font-bold {isWorthGrading ? 'text-vault-green' : 'text-vault-red'}">
								{isWorthGrading ? 'WORTH GRADING' : 'SELL RAW'}
							</span>
							<span class="rounded-full px-2.5 py-0.5 text-xs font-bold {isWorthGrading ? 'bg-vault-green/20 text-vault-green' : 'bg-vault-red/20 text-vault-red'}">
								{estimatedProfit >= 0 ? '+' : ''}${estimatedProfit.toFixed(2)}
							</span>
						</div>
						<div class="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
							<div>
								<p class="text-vault-text-muted">Raw Value</p>
								<p class="mt-0.5 font-bold text-white">${rawValue.toFixed(2)}</p>
							</div>
							<div>
								<p class="text-vault-text-muted">{roiService} Fee</p>
								<p class="mt-0.5 font-bold text-white">${gradingCost.toFixed(0)}</p>
							</div>
							<div>
								<p class="text-vault-text-muted">Est. Graded</p>
								<p class="mt-0.5 font-bold text-vault-gold">${estimatedGradedValue.toFixed(2)}</p>
							</div>
							<div>
								<p class="text-vault-text-muted">Profit</p>
								<p class="mt-0.5 font-bold {isWorthGrading ? 'text-vault-green' : 'text-vault-red'}">
									{estimatedProfit >= 0 ? '+' : ''}${estimatedProfit.toFixed(2)}
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Grading Fee Reference -->
				{#if selectedFees}
					<div>
						<p class="text-xs font-medium text-vault-text-muted">{roiService} Pricing Tiers</p>
						<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
							{#each selectedFees.tiers as tier}
								<div class="rounded-lg border border-vault-border bg-vault-bg p-2 text-center text-xs">
									<p class="font-medium text-white">{tier.name}</p>
									<p class="text-vault-gold">${tier.cost}</p>
									<p class="text-vault-text-muted">~{tier.turnaround_days}d</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Submission Tracker -->
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Submission Tracker</h2>
				<button onclick={() => (showSubmitModal = true)} class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40">
					+ New Submission
				</button>
			</div>

			{#if submissions.length > 0}
				<div class="mt-4 space-y-3">
					{#each submissions as sub (sub.id)}
						{@const card = cardCache[sub.card_id]}
						<div class="rounded-lg border border-vault-border bg-vault-bg p-4">
							<div class="flex items-start gap-3">
								{#if card}
									<img src={card.images.small} alt={card.name} class="h-16 w-11 rounded object-cover" />
								{/if}
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between">
										<div>
											<p class="font-medium text-white">{card?.name ?? sub.card_id}</p>
											<p class="text-xs text-vault-text-muted">{sub.service} · {sub.tier}</p>
										</div>
										<span class="rounded-full px-2 py-0.5 text-xs font-medium {statusColors[sub.status] ?? 'bg-vault-surface text-vault-text-muted'}">
											{sub.status}
										</span>
									</div>
									<div class="mt-2 flex flex-wrap gap-3 text-xs text-vault-text-muted">
										{#if sub.submitted_date}
											<span>Submitted: {sub.submitted_date}</span>
										{/if}
										{#if sub.cost}
											<span>Cost: ${sub.cost}</span>
										{/if}
										{#if sub.grade}
											<span class="font-bold text-vault-gold">Grade: {sub.grade}</span>
										{/if}
										{#if sub.final_value}
											<span class="text-vault-green">Value: ${sub.final_value}</span>
										{/if}
									</div>
									<div class="mt-2 flex gap-2">
										{#if sub.status !== 'complete'}
											<select
												onchange={(e) => updateStatus(sub.id, (e.target as HTMLSelectElement).value)}
												class="rounded border border-vault-border bg-vault-surface px-2 py-1 text-xs text-vault-text"
											>
												<option value="" disabled selected>Update status</option>
												<option value="submitted">Submitted</option>
												<option value="received">Received</option>
												<option value="grading">Grading</option>
												<option value="shipped">Shipped</option>
												<option value="complete">Complete</option>
											</select>
										{/if}
										{#if sub.status === 'complete' && !sub.grade}
											<input
												type="number"
												step="0.5"
												min="1"
												max="10"
												placeholder="Grade"
												onchange={(e) => updateGrade(sub.id, (e.target as HTMLInputElement).value)}
												class="w-20 rounded border border-vault-border bg-vault-surface px-2 py-1 text-xs text-vault-text"
											/>
										{/if}
										<button
											onclick={() => deleteSubmission(sub.id)}
											class="rounded px-2 py-1 text-xs text-vault-text-muted hover:text-vault-red"
										>
											Delete
										</button>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="mt-4 flex items-center justify-center py-12 text-vault-text-muted">
					<p>No grading submissions yet. Click "+ New Submission" to start tracking.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- New Submission Modal -->
{#if showSubmitModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button aria-label="Close modal" class="fixed inset-0 bg-black/60" onclick={closeSubmitModal}></button>
		<div class="relative w-full max-w-sm rounded-2xl border border-vault-border bg-vault-surface p-4 shadow-2xl sm:max-w-md sm:p-6">
			<h2 class="text-lg font-semibold text-white">New Grading Submission</h2>
			<div class="mt-4 space-y-4">
				<div class="relative">
					<input
						type="text"
						bind:value={subSearchQuery}
						oninput={() => searchCards(subSearchQuery, 'sub')}
						placeholder="Search for a card..."
						class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
					/>
					{#if subSearchResults.length > 0}
						<div class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-vault-border bg-vault-bg shadow-xl">
							{#each subSearchResults as result}
								<button
									onclick={() => { subSelectedCard = result; subSearchQuery = result.name; subSearchResults = []; }}
									class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-vault-surface-hover"
								>
									<img src={result.images.small} alt={result.name} class="h-10 w-7 rounded object-cover" />
									<div>
										<p class="text-sm text-white">{result.name}</p>
										<p class="text-xs text-vault-text-muted">{result.set.name}</p>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#if subSelectedCard}
					<div class="flex items-center gap-3 rounded-lg border border-vault-purple/30 bg-vault-purple/5 p-3">
						<img src={subSelectedCard.images.small} alt={subSelectedCard.name} class="h-14 w-10 rounded object-cover" />
						<div>
							<p class="font-medium text-white">{subSelectedCard.name}</p>
							<p class="text-xs text-vault-text-muted">{subSelectedCard.set.name}</p>
						</div>
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-vault-text-muted" for="sub-service">Service</label>
						<select id="sub-service" bind:value={subService} class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none">
							<option value="PSA">PSA</option>
							<option value="CGC">CGC</option>
							<option value="BGS">BGS</option>
							<option value="SGC">SGC</option>
						</select>
					</div>
					<div>
						<label class="block text-xs text-vault-text-muted" for="sub-tier">Tier</label>
						<select id="sub-tier" bind:value={subTier} class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none">
							<option value="economy">Economy</option>
							<option value="regular">Regular</option>
							<option value="express">Express</option>
							<option value="super_express">Super Express</option>
						</select>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-vault-text-muted" for="sub-date">Submit Date</label>
						<input id="sub-date" type="date" bind:value={subDate} class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-vault-text-muted" for="sub-cost">Cost ($)</label>
						<input id="sub-cost" type="number" step="0.01" bind:value={subCost} placeholder="0.00" class="mt-1 w-full rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none" />
					</div>
				</div>

				<button
					onclick={addSubmission}
					disabled={!subSelectedCard || submitting}
					class="btn-press w-full rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40 disabled:opacity-50"
				>
					{submitting ? 'Submitting...' : 'Add Submission'}
				</button>
			</div>
		</div>
	</div>
{/if}
