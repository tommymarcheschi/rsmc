<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function href(overrides: Record<string, string | number | undefined>): string {
		const p = new URLSearchParams();
		const base: Record<string, string> = {
			filter: data.filter,
			sort: data.sortMode
		};
		for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
		if (!('page' in overrides)) p.delete('page');
		for (const [k, v] of Object.entries(overrides)) {
			if (v === undefined || v === '') p.delete(k);
			else p.set(k, String(v));
		}
		const s = p.toString();
		return s ? `/sleepers?${s}` : '/sleepers';
	}

	function money(cents: number): string {
		return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
	}

	function fmtAgo(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(ms / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}

	function marketplaceLabel(m: string | null): string {
		switch (m) {
			case 'ebay':
				return 'eBay';
			case 'tcgplayer':
				return 'TCGPlayer';
			case 'mercari':
				return 'Mercari';
			default:
				return m ?? 'unknown';
		}
	}

	function marketplaceClass(m: string | null): string {
		switch (m) {
			case 'ebay':
				return 'bg-blue-500/15 text-blue-300';
			case 'tcgplayer':
				return 'bg-purple-500/15 text-purple-300';
			case 'mercari':
				return 'bg-red-500/15 text-red-300';
			default:
				return 'bg-vault-surface text-vault-text-muted';
		}
	}
</script>

<svelte:head><title>Sleepers · Trove</title></svelte:head>

<div class="mx-auto max-w-7xl">
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-gradient">Sleepers</h1>
		<p class="mt-1 text-sm text-vault-text-muted">
			Cards where the cheapest live ask sits well below the last sold comp — the
			biggest spreads first. Click through to verify the listing before you act;
			active asks move fast.
		</p>
	</header>

	{#if data.anyStub}
		<div
			class="mb-4 rounded-card border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-300"
		>
			<span class="font-bold uppercase tracking-wider">Sample data</span> —
			the live-listings provider is currently the deterministic stub, so these
			"sleepers" are fabricated for layout/QA. Numbers become real once
			<code class="rounded bg-amber-400/10 px-1 py-0.5">LIVE_LISTINGS_PROVIDER</code>
			is flipped to a real source (eBay Browse / 130point).
		</div>
	{/if}

	<!-- Filter chips + sort toggle -->
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<div class="flex gap-1">
			{#each [['all', 'All'], ['raw', 'Raw only'], ['graded', 'Graded only']] as [val, label]}
				<a
					href={href({ filter: val, page: undefined })}
					class="rounded-chip px-3 py-1.5 text-xs font-medium transition-colors
						{data.filter === val
							? 'bg-vault-purple text-white'
							: 'bg-vault-surface text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
				>{label}</a>
			{/each}
		</div>
		<div class="flex gap-1">
			{#each [['absolute', '$ delta'], ['percent', '% under']] as [val, label]}
				<a
					href={href({ sort: val, page: undefined })}
					class="rounded-chip px-3 py-1.5 text-xs font-medium transition-colors
						{data.sortMode === val
							? 'bg-vault-accent text-white'
							: 'bg-vault-surface text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
				>{label}</a>
			{/each}
		</div>
		<span class="ml-auto text-xs text-vault-text-muted">
			{data.totalCount.toLocaleString()} cards · page {data.page}/{data.totalPages}
		</span>
	</div>

	{#if data.errorMsg}
		<div class="rounded-card border border-vault-red/40 bg-vault-red/10 p-4 text-sm text-vault-red">
			Couldn't read live listings: {data.errorMsg}
		</div>
	{:else if data.rows.length === 0}
		<div class="rounded-card border border-vault-border bg-vault-surface p-8 text-center">
			<p class="text-vault-text">No sleepers yet.</p>
			<p class="mt-2 text-sm text-vault-text-muted">
				The live-listings cache is empty for this filter. As card pages get
				viewed and the warming cron runs, this list fills in.
			</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each data.rows as r (r.card_id + '|' + r.query_key)}
				<li class="rounded-card border border-vault-border bg-vault-surface transition-colors hover:bg-vault-surface-hover">
					<a href={`/card/${r.card_id}`} class="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
						<!-- Thumbnail -->
						<div class="flex-shrink-0">
							{#if r.image_small_url}
								<img
									src={r.image_small_url}
									alt=""
									class="h-20 w-auto rounded border border-vault-border"
									loading="lazy"
								/>
							{:else}
								<div class="flex h-20 w-14 items-center justify-center rounded border border-vault-border bg-vault-bg text-[10px] text-vault-text-muted">no image</div>
							{/if}
						</div>

						<!-- Name + set + ask metadata -->
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-1.5">
								<p class="truncate font-semibold text-white">{r.name}</p>
								{#if r.provider === 'stub'}
									<span
										class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"
										title="Sample data — real live-listings provider not yet wired up."
									>
										sample data
									</span>
								{/if}
								<span class="rounded-full bg-vault-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-vault-text-muted">
									{r.condition === 'graded' ? (r.grader ?? 'graded') + ' 10' : 'raw'}
								</span>
							</div>
							<p class="mt-0.5 text-xs text-vault-text-muted">
								{r.set_name}{#if r.card_number} · #{r.card_number}{/if}
							</p>
							<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								<span class="text-vault-text-muted">
									Low ask:
									<span class="font-bold text-vault-green">{money(r.lowest_ask_cents)}</span>
									{#if r.lowest_ask_marketplace}
										<span class="ml-1 rounded-full px-1.5 py-0.5 font-semibold {marketplaceClass(r.lowest_ask_marketplace)}">
											{marketplaceLabel(r.lowest_ask_marketplace)}
										</span>
									{/if}
								</span>
								<span class="text-vault-text-muted">
									Last sold ({r.sold_comp_label}):
									{#if r.sold_comp_cents != null}
										<span class="font-bold text-vault-text">{money(r.sold_comp_cents)}</span>
									{:else}
										<span class="italic text-vault-text-muted/60">no comp</span>
									{/if}
								</span>
								<span class="text-[10px] text-vault-text-muted/60">
									refreshed {fmtAgo(r.fetched_at)}
								</span>
							</div>
						</div>

						<!-- Delta -->
						<div class="flex-shrink-0 text-right">
							{#if r.delta_cents != null && r.delta_cents > 0}
								<p class="text-xl font-bold text-vault-green">
									{money(r.delta_cents)}
								</p>
								<p class="text-[10px] uppercase tracking-wider text-vault-green">
									delta{#if r.delta_pct != null} · {r.delta_pct.toFixed(0)}% under{/if}
								</p>
							{:else if r.delta_cents != null}
								<!-- Ask is at or above the sold comp — not a sleeper, but
								     still shown so the user can see the full distribution. -->
								<p class="text-xl font-bold text-vault-text-muted">
									{money(r.delta_cents)}
								</p>
								<p class="text-[10px] uppercase tracking-wider text-vault-text-muted">
									{r.delta_pct != null && r.delta_pct < 0 ? 'over comp' : 'at comp'}
								</p>
							{:else}
								<!-- No sold comp = no percentage; honesty doctrine. -->
								<p class="text-sm italic text-vault-text-muted">no comp to compare</p>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>

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
