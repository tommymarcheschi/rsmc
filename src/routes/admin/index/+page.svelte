<script lang="ts">
	let { data } = $props();

	function autoSubmit(e: Event) {
		const el = e.currentTarget as HTMLElement;
		el.closest('form')?.submit();
	}

	let filterYear = $state('');
	let filteredSets = $derived(
		filterYear
			? data.sets.filter((s) => {
					const year = parseInt(s.releaseDate?.split('/')[0] ?? s.releaseDate?.split('-')[0] ?? '9999');
					return year < parseInt(filterYear);
				})
			: data.sets
	);

	let trackedCount = $derived(filteredSets.filter((s) => s.tracked && s.enabled).length);
</script>

<svelte:head>
	<title>Card Index — Trove Admin</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Card Index</h1>
			<p class="mt-1 text-vault-text-muted">
				{data.totalIndexed.toLocaleString()} cards indexed across {data.totalTracked} sets
			</p>
		</div>
		<a
			href="/browse?mode=hunt"
			class="btn-press rounded-xl bg-vault-purple px-4 py-2 text-sm font-medium text-white transition-all hover:bg-vault-purple/80"
		>
			Open Hunt Mode
		</a>
	</div>

	<!-- Bulk add by year -->
	<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
		<h2 class="text-sm font-medium text-white">Quick Setup</h2>
		<p class="mt-1 text-xs text-vault-text-muted">
			Add all sets before a given year to the index, then run the enrichment script locally.
		</p>
		<form method="POST" action="?/bulkAdd" class="mt-3 flex items-end gap-3">
			<div>
				<label for="before_year" class="block text-xs text-vault-text-muted">Before year</label>
				<input
					type="number"
					id="before_year"
					name="before_year"
					value="2017"
					min="1999"
					max="2026"
					class="mt-1 w-24 rounded-lg border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				class="btn-press rounded-lg bg-vault-accent px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
			>
				Add All Pre-Year Sets
			</button>
		</form>

		<div class="mt-4 rounded-lg bg-vault-bg/50 p-3">
			<p class="text-xs font-medium text-vault-text-muted">Run the enrichment script:</p>
			<code class="mt-1 block text-xs text-vault-purple">
				tsx scripts/refresh-index.ts --all
			</code>
			<p class="mt-1 text-[10px] text-vault-text-muted">
				Or target specific sets: <code class="text-vault-purple">tsx scripts/refresh-index.ts --set base1,jungle</code>
			</p>
		</div>
	</div>

	<!-- Filter -->
	<div class="flex items-center gap-3">
		<label for="filter_year" class="text-sm text-vault-text-muted">Show sets before</label>
		<input
			type="number"
			id="filter_year"
			bind:value={filterYear}
			placeholder="All"
			min="1999"
			max="2026"
			class="w-24 rounded-lg border border-vault-border bg-vault-surface px-3 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
		/>
		<span class="text-sm text-vault-text-muted">
			{filteredSets.length} sets shown, {trackedCount} tracked
		</span>
	</div>

	<!-- Sets table -->
	<div class="overflow-x-auto rounded-xl border border-vault-border">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-vault-border bg-vault-surface text-left text-xs text-vault-text-muted">
					<th class="px-4 py-3">Tracked</th>
					<th class="px-4 py-3">Set</th>
					<th class="px-4 py-3">Series</th>
					<th class="px-4 py-3">Release</th>
					<th class="px-4 py-3">Cards</th>
					<th class="px-4 py-3">Last Indexed</th>
					<th class="px-4 py-3">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredSets as s (s.id)}
					<tr class="border-b border-vault-border/50 transition-colors hover:bg-vault-surface-hover/50">
						<td class="px-4 py-2.5">
							<form method="POST" action="?/toggle">
								<input type="hidden" name="set_id" value={s.id} />
								<input type="hidden" name="set_name" value={s.name} />
								<input type="hidden" name="series" value={s.series} />
								<input type="hidden" name="release_date" value={s.releaseDate} />
								<input type="hidden" name="total_cards" value={s.totalCards} />
								<input type="hidden" name="enable" value={s.tracked && s.enabled ? '0' : '1'} />
								<button
									type="submit"
									class="flex h-5 w-5 items-center justify-center rounded border transition-colors {s.tracked && s.enabled
										? 'border-vault-purple bg-vault-purple text-white'
										: 'border-vault-border bg-vault-bg text-transparent hover:border-vault-purple/50'}"
								>
									{#if s.tracked && s.enabled}
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
								</button>
							</form>
						</td>
						<td class="px-4 py-2.5 font-medium text-white">{s.name}</td>
						<td class="px-4 py-2.5 text-vault-text-muted">{s.series}</td>
						<td class="px-4 py-2.5 text-vault-text-muted">{s.releaseDate}</td>
						<td class="px-4 py-2.5 text-vault-text-muted">{s.totalCards}</td>
						<td class="px-4 py-2.5 text-vault-text-muted">
							{#if s.lastIndexedAt}
								{new Date(s.lastIndexedAt).toLocaleDateString()}
								{#if s.lastIndexDuration}
									<span class="text-[10px]">({(s.lastIndexDuration / 1000).toFixed(0)}s)</span>
								{/if}
							{:else}
								<span class="text-vault-text-muted/50">—</span>
							{/if}
						</td>
						<td class="px-4 py-2.5">
							{#if s.lastIndexError}
								<span class="text-red-400 text-xs">{s.lastIndexError}</span>
							{:else if s.lastIndexedAt}
								<span class="text-vault-green text-xs">Indexed</span>
							{:else if s.tracked && s.enabled}
								<span class="text-vault-gold text-xs">Pending</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
