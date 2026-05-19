<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Build a URL preserving current params with overrides; any param change
	// resets pagination unless page itself is being set.
	function href(overrides: Record<string, string | number | undefined>): string {
		const p = new URLSearchParams();
		const base: Record<string, string> = {
			q: data.q,
			set: data.setId,
			lens: data.lens,
			confidence: data.confidence,
			sort: data.sortCol
		};
		for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
		if (!('page' in overrides)) p.delete('page');
		for (const [k, v] of Object.entries(overrides)) {
			if (v === undefined || v === '' ) p.delete(k);
			else p.set(k, String(v));
		}
		const s = p.toString();
		return s ? `/rankings?${s}` : '/rankings';
	}

	const activeLens = $derived(data.lenses.find((l) => l.key === data.lens)!);

	function scoreClass(v: number | null | undefined): string {
		if (v == null) return 'text-vault-text-muted/40';
		if (v >= 80) return 'text-vault-gold font-semibold';
		if (v >= 60) return 'text-vault-green';
		if (v >= 40) return 'text-vault-text';
		if (v >= 20) return 'text-vault-text-muted';
		return 'text-vault-red/80';
	}

	const confidenceBadge: Record<string, string> = {
		high: 'bg-vault-green/15 text-vault-green',
		medium: 'bg-vault-cyan/15 text-vault-cyan',
		low: 'bg-vault-red/15 text-vault-red'
	};

	const money = (n: unknown) =>
		n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
</script>

<svelte:head><title>Rankings · Trove</title></svelte:head>

<div class="mx-auto max-w-7xl">
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-gradient">Card Rankings</h1>
		<p class="mt-1 text-sm text-vault-text-muted">
			Every card scored 0–100 on six independent axes, percentile-ranked across the
			whole catalog. Switch lenses to re-weight for your intent. Thin-data cards are
			flagged, never hidden.
		</p>
	</header>

	<!-- Lens selector -->
	<div class="mb-4 flex flex-wrap gap-2">
		{#each data.lenses as l}
			<a
				href={href({ lens: l.key, sort: undefined, page: undefined })}
				class="rounded-chip px-3 py-1.5 text-sm font-medium transition-colors
					{l.key === data.lens
						? 'bg-vault-purple text-white'
						: 'bg-vault-surface text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
				title={l.blurb}
			>
				{l.label}
			</a>
		{/each}
		<span class="self-center text-xs text-vault-text-muted">{activeLens.blurb}</span>
	</div>

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<form method="GET" action="/rankings" class="flex gap-2">
			{#if data.lens}<input type="hidden" name="lens" value={data.lens} />{/if}
			<input
				type="text"
				name="q"
				value={data.q}
				placeholder="charizard pop:<500 year:1999-2003 rarity:holo psa10"
				title="Hunt-DSL: barewords search the name; field:value filters — pop:<N year:A-B price:A-B raw:>N rarity:holo set:base1 psa10"
				class="w-80 max-w-full rounded-xl border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-purple focus:outline-none"
			/>
			<button class="rounded-xl bg-vault-surface px-3 py-1.5 text-sm text-vault-text hover:bg-vault-surface-hover">Search</button>
		</form>
		<div class="flex gap-1">
			{#each [['all', 'All confidence'], ['nolow', 'Hide low'], ['high', 'High only']] as [val, label]}
				<a
					href={href({ confidence: val, page: undefined })}
					class="rounded-chip px-2.5 py-1 text-xs transition-colors
						{data.confidence === val
							? 'bg-vault-accent text-white'
							: 'bg-vault-surface text-vault-text-muted hover:text-white'}"
				>{label}</a>
			{/each}
		</div>
		<span class="ml-auto text-xs text-vault-text-muted">
			{data.count.toLocaleString()} cards · page {data.page}/{data.totalPages}
		</span>
	</div>

	<!-- DSL interpretation echo — shows the user how their query was parsed
	     so a filtered result set is trustworthy, and flags tokens we didn't
	     understand instead of silently dropping them. -->
	{#if data.dslFilters.length > 0 || data.dslErrors.length > 0}
		<div class="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
			{#if data.dslFilters.length > 0}
				<span class="text-vault-text-muted">Filtered by:</span>
				{#each data.dslFilters as f}
					<span class="rounded-chip bg-vault-purple/15 px-2 py-0.5 text-vault-purple">{f}</span>
				{/each}
			{/if}
			{#each data.dslErrors as e}
				<span class="rounded-chip bg-vault-red/15 px-2 py-0.5 text-vault-red" title="Unrecognized — ignored. Try field:value, e.g. pop:<500">didn't understand "{e}"</span>
			{/each}
		</div>
	{/if}

	{#if !data.rankingsReady}
		<div class="rounded-card border border-vault-border bg-vault-surface p-8 text-center">
			<p class="text-vault-text">Rankings not available yet.</p>
			<p class="mt-2 text-sm text-vault-text-muted">{data.degradeMsg}</p>
			<p class="mt-3 text-xs text-vault-text-muted">
				Apply <code class="text-vault-cyan">supabase/migrations/017_card_rankings.sql</code>,
				then run <code class="text-vault-cyan">scripts/rank-cards.ts</code> (or wait for the
				nightly cron).
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-card border border-vault-border">
			<table class="w-full min-w-[920px] border-collapse text-sm">
				<thead>
					<tr class="bg-vault-surface text-left text-xs uppercase tracking-wide text-vault-text-muted">
						<th class="px-3 py-2.5 font-medium">Card</th>
						<th class="px-2 py-2.5 text-right font-medium">Raw</th>
						<th class="px-2 py-2.5 text-right font-medium">PSA 10</th>
						{#each data.axes as ax}
							<th class="px-2 py-2.5 text-center font-medium">
								<a
									href={href({ sort: ax.column, page: undefined })}
									class="hover:text-white {data.sortCol === ax.column ? 'text-white' : ''}"
									title={ax.hint}
								>
									{ax.label}{data.sortCol === ax.column ? ' ↓' : ''}
								</a>
							</th>
						{/each}
						<th class="px-2 py-2.5 text-center font-medium">
							<a
								href={href({ sort: activeLens.column, page: undefined })}
								class="hover:text-white {data.sortCol === activeLens.column ? 'text-white' : ''}"
							>
								{activeLens.label}{data.sortCol === activeLens.column ? ' ↓' : ''}
							</a>
						</th>
						<th class="px-2 py-2.5 text-center font-medium">Conf.</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.card_id)}
						{@const lv = r[activeLens.column] as number | null}
						<tr class="border-t border-vault-border hover:bg-vault-surface-hover/40">
							<td class="px-3 py-2">
								<a href={`/card/${r.card_id}`} class="flex items-center gap-2.5">
									{#if r.image_small_url}
										<img src={r.image_small_url as string} alt="" class="h-12 w-auto rounded" loading="lazy" />
									{/if}
									<span>
										<span class="block font-medium text-vault-text">{r.name}</span>
										<span class="block text-xs text-vault-text-muted">{r.set_name} · #{r.card_number}</span>
									</span>
								</a>
							</td>
							<td class="px-2 py-2 text-right text-vault-text-muted">{money(r.raw_nm_price)}</td>
							<td class="px-2 py-2 text-right text-vault-text-muted">{money(r.psa10_price)}</td>
							{#each data.axes as ax}
								{@const v = r[ax.column] as number | null}
								<td class="px-2 py-2 text-center tabular-nums {scoreClass(v)}">
									{v ?? '—'}
								</td>
							{/each}
							<td class="px-2 py-2 text-center tabular-nums {scoreClass(lv)}">
								<span class="text-base">{lv ?? '—'}</span>
							</td>
							<td class="px-2 py-2 text-center">
								<span class="rounded-chip px-1.5 py-0.5 text-[10px] uppercase {confidenceBadge[(r.ranking_confidence as string) ?? 'low']}">
									{r.ranking_confidence ?? 'low'}
								</span>
							</td>
						</tr>
					{:else}
						<tr><td colspan="11" class="px-3 py-8 text-center text-vault-text-muted">No cards match.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		<div class="mt-4 flex items-center justify-between text-sm">
			<a
				href={data.page > 1 ? href({ page: data.page - 1 }) : undefined}
				class="rounded-xl px-3 py-1.5 {data.page > 1
					? 'bg-vault-surface text-vault-text hover:bg-vault-surface-hover'
					: 'pointer-events-none opacity-30'}"
				aria-disabled={data.page <= 1}
			>← Prev</a>
			<span class="text-vault-text-muted">Page {data.page} of {data.totalPages}</span>
			<a
				href={data.page < data.totalPages ? href({ page: data.page + 1 }) : undefined}
				class="rounded-xl px-3 py-1.5 {data.page < data.totalPages
					? 'bg-vault-surface text-vault-text hover:bg-vault-surface-hover'
					: 'pointer-events-none opacity-30'}"
				aria-disabled={data.page >= data.totalPages}
			>Next →</a>
		</div>
	{/if}
</div>
