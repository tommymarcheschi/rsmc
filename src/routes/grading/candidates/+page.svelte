<script lang="ts">
	import type { GradingService } from '$types';
	import type { GradingFees } from '$services/price-tracker';
	import {
		computeGradingROI,
		DEFAULT_TIER_BY_SERVICE,
		GEM_RATE_MIN_SAMPLE
	} from '$services/grading-roi';

	let { data } = $props();

	// Filters are the source of truth for the query; local state mirrors the
	// service/tier selector so it can re-compute costs client-side without
	// a round-trip. Other filters submit via the GET form like hunt mode.
	// Initial value from `data.filters` is intentional — on navigation the
	// component remounts with fresh data.
	// svelte-ignore state_referenced_locally
	let localService = $state<GradingService>(data.filters.service);
	// svelte-ignore state_referenced_locally
	let localTier = $state<string>(data.filters.tier);

	const gradingFees = $derived(data.gradingFees as GradingFees[]);
	const tiersForService = $derived(
		gradingFees.find((f) => f.service === localService)?.tiers ?? []
	);

	function fmt(n: number | null | undefined, prefix = '$'): string {
		if (n == null) return '—';
		const abs = Math.abs(n);
		if (abs >= 1000) return `${prefix}${(n / 1000).toFixed(1)}k`;
		return `${prefix}${n.toFixed(2)}`;
	}

	function fmtSignedMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		const sign = n >= 0 ? '+' : '';
		return `${sign}${fmt(n)}`;
	}

	function fmtPct(n: number | null | undefined): string {
		if (n == null) return '—';
		return `${n.toFixed(1)}%`;
	}

	// Per-row ROI — recomputed whenever the user switches service/tier.
	// Server rows carry the SQL `grading_roi_premium` column; we validate
	// it matches the TS computation when first rendering (dev aid).
	function roiFor(row: (typeof data.rows)[number]) {
		return computeGradingROI(
			{
				raw_nm_price: row.raw_nm_price,
				psa10_price: row.psa10_price,
				psa_gem_rate: row.psa_gem_rate,
				psa_pop_total: row.psa_pop_total
			},
			localService,
			localTier,
			gradingFees
		);
	}

	// Page stats use server-side service/tier defaults for the "Total
	// potential profit" headline. We keep it stable so the number doesn't
	// jitter when the user flips services on the page. Switching service
	// affects per-row only.
	const pageStats = $derived(data.stats);

	// JS enhancement: auto-submit filter form on select change. Without JS
	// the Apply button handles it.
	function autoSubmit(e: Event) {
		const form = (e.currentTarget as HTMLSelectElement).form;
		form?.submit();
	}

	const hasActiveFilters = $derived(
		!!(
			data.filters.minGemRate ||
			data.filters.maxRaw ||
			data.filters.setId ||
			(data.filters.minPop !== GEM_RATE_MIN_SAMPLE && data.filters.minPop !== 0) ||
			data.filters.sort !== 'roi_desc'
		)
	);

	const totalPages = $derived(Math.max(1, Math.ceil(data.totalCount / data.pageSize)));

	function pageUrl(p: number): string {
		const params = new URLSearchParams();
		if (data.filters.minGemRate) params.set('min_gem_rate', String(data.filters.minGemRate));
		if (data.filters.maxRaw) params.set('max_raw', String(data.filters.maxRaw));
		if (data.filters.minPop !== GEM_RATE_MIN_SAMPLE)
			params.set('min_pop', String(data.filters.minPop));
		if (data.filters.setId) params.set('set', data.filters.setId);
		if (data.filters.sort && data.filters.sort !== 'roi_desc')
			params.set('sort', data.filters.sort);
		if (p > 1) params.set('page', String(p));
		const qs = params.toString();
		return qs ? `/grading/candidates?${qs}` : '/grading/candidates';
	}

	// When the service changes, snap the tier to that service's default
	// (cheapest) so the cost column reflects something sensible. User can
	// then pick a different tier from the now-valid list.
	$effect(() => {
		if (!tiersForService.find((t) => t.name.toLowerCase() === localTier.toLowerCase())) {
			localTier = DEFAULT_TIER_BY_SERVICE[localService] ?? tiersForService[0]?.name ?? '';
		}
	});
</script>

<svelte:head>
	<title>Grading Candidates — Trove</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<div class="flex flex-wrap items-center gap-3">
			<a href="/grading" class="text-sm text-vault-text-muted hover:text-white">← Grading</a>
		</div>
		<h1 class="mt-2 text-2xl font-bold text-gradient sm:text-3xl">Grading Candidates</h1>
		<p class="mt-1 text-vault-text-muted">
			Ranked by gem-rate-weighted PSA 10 premium. {data.totalCount.toLocaleString()} candidates.
		</p>
	</div>

	<!-- Stats header -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Candidates</p>
			<p class="mt-1 text-2xl font-bold text-white">{pageStats.candidateCount.toLocaleString()}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Potential Premium</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">{fmt(pageStats.totalPremium)}</p>
			<p class="mt-0.5 text-[10px] text-vault-text-muted">before grading cost</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Median Gem Rate</p>
			<p class="mt-1 text-2xl font-bold text-white">{fmtPct(pageStats.medianGemRate)}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Median Premium</p>
			<p class="mt-1 text-2xl font-bold text-white">{fmt(pageStats.medianPremium)}</p>
		</div>
	</div>

	<!-- Preset chips -->
	<div class="flex flex-wrap gap-2">
		<a
			href="/grading/candidates?min_gem_rate=30"
			class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
		>
			High confidence (gem rate ≥ 30%)
		</a>
		<a
			href="/grading/candidates?max_raw=20"
			class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
		>
			Cheap gateway (raw ≤ $20)
		</a>
		<a
			href="/grading/candidates?sort=psa10_desc&min_gem_rate=15"
			class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
		>
			Home run (PSA 10 high to low, gem ≥ 15%)
		</a>
		<a
			href="/grading/candidates?min_pop=20&sort=pop_asc"
			class="rounded-lg border border-vault-purple/30 bg-vault-purple/10 px-3 py-1.5 text-xs font-medium text-vault-purple transition-all hover:bg-vault-purple/20"
		>
			Low-pop bets (pop ≥ 20, ascending)
		</a>
	</div>

	<!-- Filter + service form. Plain GET so it works without JS. -->
	<form method="GET" action="/grading/candidates" class="space-y-3">
		<div class="flex flex-wrap gap-2 sm:gap-3">
			<!-- Service / tier are in the form so they persist via URL; bind to
			     local state so the row-level cost recomputes without navigation. -->
			<div class="flex items-center gap-1.5">
				<label for="service" class="text-xs text-vault-text-muted">Service</label>
				<select
					id="service"
					name="service"
					bind:value={localService}
					onchange={autoSubmit}
					class="rounded-xl border border-vault-border bg-vault-surface px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				>
					<option value="PSA">PSA</option>
					<option value="CGC">CGC</option>
					<option value="BGS">BGS</option>
					<option value="SGC">SGC</option>
				</select>
			</div>

			<div class="flex items-center gap-1.5">
				<label for="tier" class="text-xs text-vault-text-muted">Tier</label>
				<select
					id="tier"
					name="tier"
					bind:value={localTier}
					class="rounded-xl border border-vault-border bg-vault-surface px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				>
					{#each tiersForService as t}
						<option value={t.name}>{t.name} (${t.cost})</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center gap-1.5">
				<label for="min_gem_rate" class="text-xs text-vault-text-muted">Min Gem %</label>
				<input
					type="number"
					id="min_gem_rate"
					name="min_gem_rate"
					value={data.filters.minGemRate || ''}
					placeholder="0"
					step="0.1"
					min="0"
					max="100"
					class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				/>
			</div>

			<div class="flex items-center gap-1.5">
				<label for="max_raw" class="text-xs text-vault-text-muted">Max Raw $</label>
				<input
					type="number"
					id="max_raw"
					name="max_raw"
					value={data.filters.maxRaw ?? ''}
					placeholder=""
					step="0.01"
					min="0"
					class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				/>
			</div>

			<div class="flex items-center gap-1.5">
				<label for="min_pop" class="text-xs text-vault-text-muted" title="Minimum PSA-graded sample size for a trustworthy gem rate.">
					Min Pop
				</label>
				<input
					type="number"
					id="min_pop"
					name="min_pop"
					value={data.filters.minPop}
					placeholder={String(GEM_RATE_MIN_SAMPLE)}
					min="0"
					class="w-20 rounded-lg border border-vault-border bg-vault-surface px-2 py-1.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				/>
			</div>

			<select
				name="set"
				value={data.filters.setId}
				onchange={autoSubmit}
				class="rounded-xl border border-vault-border bg-vault-surface px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
			>
				<option value="">All Indexed Sets</option>
				{#each data.trackedSets as s}
					<option value={s.set_id}>{s.set_name}</option>
				{/each}
			</select>

			<select
				name="sort"
				value={data.filters.sort}
				onchange={autoSubmit}
				class="rounded-xl border border-vault-border bg-vault-surface px-3 py-2 text-sm text-vault-text focus:border-vault-purple focus:outline-none"
				aria-label="Sort candidates"
			>
				<option value="roi_desc">ROI premium (high → low)</option>
				<option value="gem_rate_desc">Gem rate (high → low)</option>
				<option value="raw_asc">Raw price (low → high)</option>
				<option value="psa10_desc">PSA 10 price (high → low)</option>
				<option value="pop_asc">Population (low → high)</option>
			</select>

			<button
				type="submit"
				class="btn-press rounded-xl bg-vault-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover"
			>
				Apply
			</button>

			{#if hasActiveFilters}
				<a
					href="/grading/candidates"
					class="btn-press rounded-xl border border-vault-border px-4 py-2 text-sm font-medium text-vault-text-muted transition-all hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
				>
					Clear filters
				</a>
			{/if}
		</div>
	</form>

	<!-- Explanation panel -->
	<details class="group rounded-2xl border border-vault-border bg-vault-surface" open>
		<summary class="cursor-pointer list-none px-6 py-4 text-sm font-medium text-white">
			<span class="inline-flex items-center gap-2">
				<svg class="h-4 w-4 text-vault-purple transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
				How we compute this
			</span>
		</summary>
		<div class="border-t border-vault-border px-6 py-4 text-sm text-vault-text-muted">
			<p>
				<span class="font-semibold text-white">Realistic profit</span> =
				<code class="rounded bg-vault-bg px-1.5 py-0.5 text-xs text-vault-purple">gem_rate × (psa10 − raw) − grading_cost</code>.
				<br />
				<span class="font-semibold text-white">Optimistic profit</span> =
				<code class="rounded bg-vault-bg px-1.5 py-0.5 text-xs text-vault-purple">(psa10 − raw) − grading_cost</code>
				— i.e. assuming the card gets a 10.
			</p>
			<p class="mt-2">
				<span class="font-semibold text-white">Honest assumption:</span> when the card
				doesn't grade a 10, we assume it recoups raw value at resale. We don't store PSA 9 /
				PSA 8 comps separately, so this simplifies the expected-value math. The page always
				shows both the realistic (gem-rate weighted) number and the optimistic (if it hits
				10) number so you can see the spread.
			</p>
			<p class="mt-2">
				Grading cost is resolved for the service and tier you pick. If a card's PSA 10 price
				exceeds a tier's <code class="text-xs">max_value</code> ceiling, we escalate to the
				next tier up to keep the quoted cost realistic.
			</p>

			<p class="mt-3 text-xs">
				Cards with fewer than <span class="text-white">{GEM_RATE_MIN_SAMPLE} PSA-graded</span>
				copies are flagged as low confidence — the gem rate is too noisy to trust. Raise or
				lower the "Min Pop" filter to taste.
			</p>

			{#if tiersForService.length > 0}
				<div class="mt-4">
					<p class="text-xs font-medium text-white">{localService} tiers</p>
					<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{#each tiersForService as t}
							<div class="rounded-lg border border-vault-border bg-vault-bg p-2 text-center text-xs">
								<p class="font-medium text-white">{t.name}</p>
								<p class="text-vault-gold">${t.cost}</p>
								<p class="text-vault-text-muted">~{t.turnaround_days}d</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</details>

	<!-- Candidate list -->
	{#if data.queryError}
		<div class="rounded-2xl border border-vault-red/40 bg-vault-red/5 p-6 text-sm text-vault-red">
			Error loading candidates: {data.queryError}
		</div>
	{:else if data.rows.length === 0}
		<div class="flex flex-col items-center justify-center rounded-2xl border border-vault-border bg-vault-surface py-16 text-vault-text-muted">
			<p class="text-lg font-medium">No candidates match your filters</p>
			<p class="mt-1 text-sm">Try lowering Min Pop, raising Max Raw, or clearing filters.</p>
			{#if hasActiveFilters}
				<a href="/grading/candidates" class="btn-press mt-4 rounded-xl bg-vault-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-vault-accent-hover">
					Clear filters
				</a>
			{/if}
		</div>
	{:else}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="divide-y divide-vault-border">
				{#each data.rows as row, i (row.card_id)}
					{@const roi = roiFor(row)}
					{@const posClass = roi.realisticProfit != null && roi.realisticProfit > 0 ? 'text-vault-green' : 'text-vault-red'}
					<a
						href="/card/{row.card_id}"
						class="flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-vault-surface-hover sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4"
					>
						<span class="hidden w-6 text-center text-sm font-bold text-vault-text-muted sm:inline-block">
							#{(data.page - 1) * data.pageSize + i + 1}
						</span>
						{#if row.image_small_url}
							<img
								src={row.image_small_url}
								alt={row.name}
								loading="lazy"
								class="h-16 w-11 flex-shrink-0 rounded-lg object-cover"
							/>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-white">{row.name}</p>
							<p class="truncate text-xs text-vault-text-muted">
								{row.set_name}
								{row.card_number ? `· #${row.card_number}` : ''}
								{row.rarity ? `· ${row.rarity}` : ''}
							</p>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-vault-text-muted">
								<span>Raw <span class="font-semibold text-white">{fmt(row.raw_nm_price)}</span></span>
								<span>
									Gem
									<span class="font-semibold text-white">{fmtPct(row.psa_gem_rate)}</span>
									<span class="text-vault-text-muted">({(row.psa_pop_total ?? 0).toLocaleString()} graded)</span>
								</span>
								<span>PSA 10 <span class="font-semibold text-vault-purple">{fmt(row.psa10_price)}</span></span>
								<span>Cost <span class="font-semibold text-white">${roi.gradingCost.toFixed(0)}</span></span>
								{#if roi.breakEvenGemRate != null}
									<span>Break-even <span class="font-semibold text-vault-gold">{fmtPct(roi.breakEvenGemRate)}</span></span>
								{/if}
							</div>
							{#if !roi.confident}
								<p class="mt-1 text-[10px] text-vault-gold">
									Low confidence — only {row.psa_pop_total ?? 0} PSA graded
								</p>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-2 text-right sm:w-48 sm:grid-cols-1 sm:gap-0.5">
							<div>
								<p class="text-[10px] uppercase tracking-wide text-vault-text-muted">Realistic</p>
								<p class="text-sm font-bold {posClass}">
									{fmtSignedMoney(roi.realisticProfit)}
								</p>
							</div>
							<div>
								<p class="text-[10px] uppercase tracking-wide text-vault-text-muted">Optimistic</p>
								<p class="text-sm font-semibold text-vault-gold">
									{fmtSignedMoney(roi.optimisticProfit)}
								</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>

		{#if totalPages > 1}
			<div class="flex items-center justify-between text-sm text-vault-text-muted">
				<div>
					Page {data.page} of {totalPages.toLocaleString()}
				</div>
				<div class="flex gap-2">
					{#if data.page > 1}
						<a
							href={pageUrl(data.page - 1)}
							class="rounded-lg border border-vault-border px-3 py-1.5 text-xs hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
						>
							← Prev
						</a>
					{/if}
					{#if data.page < totalPages}
						<a
							href={pageUrl(data.page + 1)}
							class="rounded-lg border border-vault-border px-3 py-1.5 text-xs hover:border-vault-accent/50 hover:bg-vault-surface-hover hover:text-white"
						>
							Next →
						</a>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
