<script lang="ts">
	import { enhance } from '$app/forms';
	import { Icon } from '$components';

	interface SetRow {
		id: string;
		name: string;
		series: string;
		releaseDate: string;
		totalCards: number;
		tracked: boolean;
		enabled: boolean;
		lastIndexedAt: string | null;
		lastIndexDuration: number | null;
		lastIndexError: string | null;
		tcgplayerSlug: string | null;
		tcgplayerLastBackfilledAt: string | null;
		indexed: number;
		priced: number;
		stale: number;
		coveragePct: number;
		pricedPct: number;
	}

	interface Stats {
		totalTracked: number;
		totalIndexed: number;
		totalPriced: number;
		totalStale: number;
		pricedPct: number;
		stalePct: number;
		trackedWithGap: number;
		trackedWithSlug: number;
	}

	interface Coverage {
		cards: number;
		psa10: number;
		psaPop: number;
		cgcPop: number;
		psa10Pct: number;
		psaPopPct: number;
		cgcPopPct: number;
	}

	let { data, form } = $props();

	interface TrendPoint {
		date: string;
		cards: number;
		psa10Pct: number;
		psaPopPct: number;
		cgcPopPct: number;
		stalePct: number;
	}

	let sets = $derived(data.sets as SetRow[]);
	let stats = $derived(data.stats as Stats);
	let coverageTrend = $derived(
		((data as Record<string, unknown>).coverageTrend ?? []) as TrendPoint[]
	);
	let coverage = $derived(data.coverage as Coverage);

	function kpiColor(pct: number): string {
		if (pct >= 90) return 'text-vault-green';
		if (pct >= 50) return 'text-vault-gold';
		return 'text-vault-red';
	}

	let filterYear = $state('');
	let filterMode = $state<'all' | 'tracked' | 'gaps' | 'stale' | 'no-slug'>('tracked');

	let filteredSets = $derived.by(() => {
		let out = sets;
		if (filterYear) {
			const year = parseInt(filterYear);
			out = out.filter((s) => {
				const y = parseInt(s.releaseDate?.split('/')[0] ?? s.releaseDate?.split('-')[0] ?? '9999');
				return y < year;
			});
		}
		if (filterMode === 'tracked') out = out.filter((s) => s.enabled);
		else if (filterMode === 'gaps')
			out = out.filter((s) => s.enabled && s.indexed < s.totalCards);
		else if (filterMode === 'stale') out = out.filter((s) => s.enabled && s.stale > 0);
		else if (filterMode === 'no-slug')
			out = out.filter((s) => s.enabled && !s.tcgplayerSlug && s.indexed > 0);
		return out;
	});

	// Which set's heal button is in-flight. Svelte actions don't give us
	// per-row state out of the box, so we track it manually and clear on
	// form result.
	let healingSetId = $state<string | null>(null);

	function daysAgo(iso: string | null | undefined): string {
		if (!iso) return '—';
		const ms = Date.now() - new Date(iso).getTime();
		const days = Math.floor(ms / (24 * 60 * 60 * 1000));
		if (days === 0) return 'today';
		if (days === 1) return '1 day ago';
		if (days < 60) return `${days} days ago`;
		return `${Math.floor(days / 30)} months ago`;
	}

	function coverageColor(pct: number, enabled: boolean): string {
		if (!enabled) return 'text-vault-text-muted/50';
		if (pct >= 100) return 'text-vault-green';
		if (pct >= 90) return 'text-vault-gold';
		return 'text-vault-red';
	}

	const lastHealReport = $derived(
		form && (form as Record<string, unknown>).action === 'heal' ? form : null
	);
</script>

<svelte:head>
	<title>Card Index — Trove Admin</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Card Index</h1>
			<p class="mt-1 text-vault-text-muted">
				Enrichment health across {stats.totalTracked} tracked sets. Auto-heal runs per-row.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a
				href="/browse?mode=hunt"
				class="btn-press rounded-xl border border-vault-purple/40 px-4 py-2 text-sm font-medium text-vault-purple transition-all hover:bg-vault-purple/10"
			>
				Open Hunt Mode
			</a>
		</div>
	</div>

	<!-- Health summary -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		<div class="card-panel">
			<p class="text-sm text-vault-text-muted">Indexed cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{stats.totalIndexed.toLocaleString()}</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">across {stats.totalTracked} tracked sets</p>
		</div>
		<div class="card-panel">
			<p class="text-sm text-vault-text-muted">Priced</p>
			<p class="mt-1 text-2xl font-bold text-vault-green">{stats.pricedPct}%</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">
				{stats.totalPriced.toLocaleString()} of {stats.totalIndexed.toLocaleString()} rows have a raw price
			</p>
		</div>
		<div class="card-panel">
			<p class="text-sm text-vault-text-muted">Stale (&gt;7d)</p>
			<p class="mt-1 text-2xl font-bold {stats.stalePct > 30 ? 'text-vault-red' : stats.stalePct > 10 ? 'text-vault-gold' : 'text-vault-green'}">
				{stats.stalePct}%
			</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">
				{stats.totalStale.toLocaleString()} rows not refreshed in the last week
			</p>
		</div>
		<div class="card-panel">
			<p class="text-sm text-vault-text-muted">Coverage gaps</p>
			<p class="mt-1 text-2xl font-bold {stats.trackedWithGap > 0 ? 'text-vault-gold' : 'text-vault-green'}">
				{stats.trackedWithGap}
			</p>
			<p class="mt-0.5 text-[11px] text-vault-text-muted">
				tracked sets where card_index count &lt; TCG API total
			</p>
		</div>
	</div>

	<!-- Graded-data coverage — the data-acquisition engine's KPI -->
	<div class="card-panel">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-sm font-medium text-white">Graded-Data Coverage</h2>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">
					The engine's scoreboard. Catalog is complete — this is the climb toward ~95%.
				</p>
			</div>
			<span class="font-mono text-[11px] text-vault-text-muted">
				{coverage.cards.toLocaleString()} cards
			</span>
		</div>
		<div class="mt-3 grid grid-cols-3 gap-3">
			<div>
				<p class="text-[11px] uppercase tracking-wide text-vault-text-muted">PSA 10 price</p>
				<p class="mt-1 text-2xl font-bold {kpiColor(coverage.psa10Pct)}">{coverage.psa10Pct}%</p>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">
					{coverage.psa10.toLocaleString()} cards
				</p>
			</div>
			<div>
				<p class="text-[11px] uppercase tracking-wide text-vault-text-muted">PSA pop</p>
				<p class="mt-1 text-2xl font-bold {kpiColor(coverage.psaPopPct)}">{coverage.psaPopPct}%</p>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">
					{coverage.psaPop.toLocaleString()} cards
				</p>
			</div>
			<div>
				<p class="text-[11px] uppercase tracking-wide text-vault-text-muted">CGC pop</p>
				<p class="mt-1 text-2xl font-bold {kpiColor(coverage.cgcPopPct)}">{coverage.cgcPopPct}%</p>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">
					{coverage.cgcPop.toLocaleString()} cards
				</p>
			</div>
		</div>
	</div>

	<!-- Coverage trend — make the 5%→95% climb visible over time. Sourced
	     from coverage_ledger (written nightly after the acquisition crons).
	     Honest empty-state: if the ledger cron hasn't run we say so plainly
	     rather than drawing a flat or fabricated line. -->
	<div class="card-panel">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-sm font-medium text-white">Coverage Trend</h2>
				<p class="mt-0.5 text-[11px] text-vault-text-muted">
					Daily graded-data coverage from the ledger. The line that should climb.
				</p>
			</div>
			{#if coverageTrend.length}
				<span class="font-mono text-[11px] text-vault-text-muted">
					{coverageTrend.length} day{coverageTrend.length === 1 ? '' : 's'} logged
				</span>
			{/if}
		</div>

		{#if coverageTrend.length === 0}
			<p class="mt-4 rounded-xl border border-dashed border-vault-border bg-vault-bg px-4 py-6 text-center text-sm text-vault-text-muted">
				No coverage history yet — the <code class="text-vault-text">coverage-ledger</code> cron
				hasn't recorded a snapshot. Once it runs nightly, the climb shows here.
			</p>
		{:else}
			{@const maxPsa10 = Math.max(1, ...coverageTrend.map((d) => d.psa10Pct))}
			<div class="mt-4 flex items-end gap-1" style="height: 96px">
				{#each coverageTrend as d}
					<div
						class="group relative flex-1 rounded-t bg-vault-green/70 transition-colors hover:bg-vault-green"
						style="height: {Math.max(2, (d.psa10Pct / maxPsa10) * 100)}%"
						title="{d.date} · PSA10 {d.psa10Pct}% · PSA pop {d.psaPopPct}% · CGC pop {d.cgcPopPct}% · stale {d.stalePct}%"
					></div>
				{/each}
			</div>
			<div class="mt-1 flex justify-between text-[10px] text-vault-text-muted">
				<span>{coverageTrend[0].date}</span>
				<span>PSA 10 price coverage · hover a bar for detail</span>
				<span>{coverageTrend[coverageTrend.length - 1].date}</span>
			</div>
			<div class="mt-4 overflow-x-auto">
				<table class="w-full text-left text-[11px]">
					<thead class="text-vault-text-muted">
						<tr>
							<th class="py-1 pr-3 font-medium">Date</th>
							<th class="py-1 pr-3 text-right font-medium">PSA 10</th>
							<th class="py-1 pr-3 text-right font-medium">PSA pop</th>
							<th class="py-1 pr-3 text-right font-medium">CGC pop</th>
							<th class="py-1 text-right font-medium">Stale</th>
						</tr>
					</thead>
					<tbody class="font-mono text-vault-text">
						{#each [...coverageTrend].reverse().slice(0, 7) as d}
							<tr class="border-t border-vault-border">
								<td class="py-1 pr-3">{d.date}</td>
								<td class="py-1 pr-3 text-right">{d.psa10Pct}%</td>
								<td class="py-1 pr-3 text-right">{d.psaPopPct}%</td>
								<td class="py-1 pr-3 text-right">{d.cgcPopPct}%</td>
								<td class="py-1 text-right {d.stalePct >= 90 ? 'text-vault-red' : 'text-vault-text-muted'}">{d.stalePct}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Heal result banner -->
	{#if lastHealReport}
		{@const r = (lastHealReport as Record<string, unknown>).report as Record<string, unknown> | undefined}
		{@const success = (lastHealReport as Record<string, unknown>).success}
		<div class="rounded-xl border {success ? 'border-vault-green/40 bg-vault-green/5 text-vault-green' : 'border-vault-red/40 bg-vault-red/5 text-vault-red'} px-4 py-3 text-sm">
			{#if success && r}
				Healed <b>{(lastHealReport as Record<string, unknown>).setId}</b>:
				{#if (r.missingInserted as number) > 0}+{r.missingInserted} card rows{/if}
				{#if r.slugDiscovered}{' '}· found slug {r.slugDiscovered}{/if}
				{#if (r.pricesUpdated as number) > 0}{' '}· {r.pricesUpdated} prices updated{/if}
				{#if r.skipped}skipped (up to date — use Force){/if}
				{#if (r.missingInserted as number) === 0 && !(r.pricesUpdated as number) && !r.slugDiscovered && !r.skipped}no changes{/if}
			{:else}
				Heal failed: {(lastHealReport as Record<string, unknown>).message ?? (r?.error ?? 'unknown error')}
			{/if}
		</div>
	{/if}

	<!-- Quick setup -->
	<div class="card-panel">
		<h2 class="text-sm font-medium text-white">Quick Setup</h2>
		<p class="mt-1 text-xs text-vault-text-muted">
			Add all sets before a given year to the index, then run the enrichment script locally.
		</p>
		<form method="POST" action="?/bulkAdd" use:enhance class="mt-3 flex items-end gap-3">
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
				class="btn-press rounded-lg bg-brand-gradient px-4 py-1.5 text-sm font-medium text-white transition-all"
			>
				Add All Pre-Year Sets
			</button>
		</form>

		<div class="mt-4 rounded-lg bg-vault-bg/50 p-3 text-xs text-vault-text-muted">
			<p class="font-medium text-vault-text">CLI reference</p>
			<code class="mt-1 block text-vault-purple">npx tsx scripts/refresh-index.ts --all</code>
			<code class="mt-1 block text-vault-purple">npx tsx scripts/refresh-index.ts --set base1,jungle</code>
			<code class="mt-1 block text-vault-purple">npx tsx scripts/auto-heal-sets.ts</code>
			<p class="mt-2">The per-row "Heal" button below runs <code>auto-heal-sets.ts</code> for that single set server-side.</p>
		</div>
	</div>

	<!-- Filter bar -->
	<div class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-1 rounded-xl border border-vault-border bg-vault-surface p-1">
			{#each [
				{ id: 'tracked', label: 'Tracked' },
				{ id: 'gaps', label: 'With gaps' },
				{ id: 'stale', label: 'Stale' },
				{ id: 'no-slug', label: 'Missing slug' },
				{ id: 'all', label: 'All sets' }
			] as tab}
				<button
					type="button"
					onclick={() => (filterMode = tab.id as typeof filterMode)}
					class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition {filterMode === tab.id ? 'bg-brand-gradient text-white' : 'text-vault-text-muted hover:text-white'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
		<label for="filter_year" class="text-xs text-vault-text-muted">Before year</label>
		<input
			type="number"
			id="filter_year"
			bind:value={filterYear}
			placeholder="All"
			min="1999"
			max="2026"
			class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
		/>
		<span class="text-xs text-vault-text-muted">
			{filteredSets.length} set{filteredSets.length === 1 ? '' : 's'}
		</span>
	</div>

	<!-- Sets table -->
	<div class="overflow-x-auto rounded-xl border border-vault-border">
		<table class="w-full text-sm">
			<thead class="border-b border-vault-border bg-vault-surface text-left text-[11px] uppercase tracking-wide text-vault-text-muted">
				<tr>
					<th class="px-3 py-2.5">Track</th>
					<th class="px-3 py-2.5">Set</th>
					<th class="px-3 py-2.5">Released</th>
					<th class="px-3 py-2.5 text-right">Coverage</th>
					<th class="px-3 py-2.5 text-right">Priced</th>
					<th class="px-3 py-2.5 text-right">Stale</th>
					<th class="px-3 py-2.5">Last enrich</th>
					<th class="px-3 py-2.5">TCGPlayer</th>
					<th class="px-3 py-2.5">Heal</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredSets as s (s.id)}
					<tr class="border-b border-vault-border/50 transition-colors hover:bg-vault-surface-hover/30">
						<td class="px-3 py-2">
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="set_id" value={s.id} />
								<input type="hidden" name="set_name" value={s.name} />
								<input type="hidden" name="series" value={s.series} />
								<input type="hidden" name="release_date" value={s.releaseDate} />
								<input type="hidden" name="total_cards" value={s.totalCards} />
								<input type="hidden" name="enable" value={s.tracked && s.enabled ? '0' : '1'} />
								<button
									type="submit"
									aria-label={s.tracked && s.enabled ? 'Untrack' : 'Track'}
									class="flex h-5 w-5 items-center justify-center rounded border transition-colors {s.tracked && s.enabled
										? 'border-vault-purple bg-vault-purple text-white'
										: 'border-vault-border bg-vault-bg text-transparent hover:border-vault-purple/50'}"
								>
									<Icon name="check" class="h-3 w-3" strokeWidth={3} />
								</button>
							</form>
						</td>
						<td class="px-3 py-2">
							<div class="font-medium text-white">{s.name}</div>
							<div class="text-[11px] text-vault-text-muted">{s.series} · {s.id}</div>
						</td>
						<td class="px-3 py-2 text-xs text-vault-text-muted">{s.releaseDate}</td>
						<td class="px-3 py-2 text-right">
							<span class="font-mono font-medium {coverageColor(s.coveragePct, s.enabled)}">
								{s.indexed}/{s.totalCards}
							</span>
							{#if s.enabled && s.indexed < s.totalCards}
								<div class="text-[10px] text-vault-red">-{s.totalCards - s.indexed}</div>
							{/if}
						</td>
						<td class="px-3 py-2 text-right">
							{#if s.indexed > 0}
								<span class="font-mono {s.pricedPct >= 95 ? 'text-vault-green' : s.pricedPct >= 60 ? 'text-vault-gold' : 'text-vault-red'}">
									{s.pricedPct}%
								</span>
							{:else}
								<span class="text-vault-text-muted/50">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-right">
							{#if s.stale > 0}
								<span class="font-mono {s.stale / Math.max(1, s.indexed) > 0.5 ? 'text-vault-red' : 'text-vault-gold'}">
									{s.stale}
								</span>
							{:else}
								<span class="text-vault-text-muted/50">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-xs text-vault-text-muted">
							{#if s.lastIndexedAt}
								{daysAgo(s.lastIndexedAt)}
								{#if s.lastIndexError}
									<div class="text-[10px] text-vault-red" title={s.lastIndexError}>error</div>
								{/if}
							{:else if s.tracked && s.enabled}
								<span class="text-vault-gold">pending</span>
							{:else}
								<span class="text-vault-text-muted/50">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-xs text-vault-text-muted">
							{#if s.tcgplayerSlug}
								<div class="font-mono text-[11px] text-vault-purple">{s.tcgplayerSlug}</div>
								<div class="text-[10px]">backfill {daysAgo(s.tcgplayerLastBackfilledAt)}</div>
							{:else if s.enabled && s.indexed > 0}
								<span class="text-vault-gold">discover</span>
							{:else}
								<span class="text-vault-text-muted/50">—</span>
							{/if}
						</td>
						<td class="px-3 py-2">
							{#if s.enabled}
								<form
									method="POST"
									action="?/heal"
									use:enhance={() => {
										healingSetId = s.id;
										return async ({ update }) => {
											await update();
											healingSetId = null;
										};
									}}
								>
									<input type="hidden" name="set_id" value={s.id} />
									<button
										type="submit"
										disabled={healingSetId !== null}
										class="btn-press rounded-lg border border-vault-purple/40 px-2 py-1 text-[11px] font-medium text-vault-purple transition hover:bg-vault-purple/10 disabled:opacity-50"
										title="Diff TCG API, insert missing, refresh TCGPlayer prices"
									>
										{#if healingSetId === s.id}
											Healing…
										{:else}
											Heal
										{/if}
									</button>
								</form>
							{:else}
								<span class="text-vault-text-muted/50 text-xs">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
