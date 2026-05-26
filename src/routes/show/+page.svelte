<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function money(cents: number): string {
		return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
	}

	function dollars(n: number | null): string {
		if (n == null) return '—';
		return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
	}
</script>

<svelte:head>
	<title>Show · Trove</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
</svelte:head>

<!--
  Show Mode page. Standalone layout (no sidebar / no global header — gated
  in src/routes/+layout.svelte via STANDALONE_PATHS) so the screen is
  maximized for the show-floor flow: type → see → tap → /card/[id].

  Design intent (project_show_mode_page):
    - One big search input, focused on mount, sticky on mobile.
    - Lean result rows — image, name, set/number, price headline.
    - Click → /card/[id]; that page is the unified data home.
    - High contrast + chunky touch targets (glove + glare friendly).
-->

<div class="min-h-screen bg-vault-bg text-vault-text">
	<!-- Sticky top bar: title + back to main app. Kept thin so the search
	     input sits as close to the top as possible. -->
	<div class="sticky top-0 z-10 border-b border-vault-border bg-vault-bg/95 backdrop-blur">
		<div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
			<div class="flex items-center gap-2">
				<svg class="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
				<span class="text-base font-bold text-gradient sm:text-lg">Show</span>
			</div>
			<a
				href="/"
				class="rounded-xl px-3 py-1.5 text-xs font-medium text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
			>
				Exit
			</a>
		</div>

		<!-- Search input — full width, big, plain GET form so it works
		     without JS. On submit we navigate to /show?q=... and the
		     loader runs. autofocus on first load. -->
		<form method="GET" action="/show" class="mx-auto max-w-3xl px-4 pb-3 sm:px-6">
			<label class="sr-only" for="show-search">Search cards</label>
			<div class="relative">
				<svg class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
				<input
					id="show-search"
					type="search"
					name="q"
					value={data.q}
					placeholder="Search any card — name, e.g. Charizard"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					autofocus
					class="w-full rounded-2xl border border-vault-border bg-vault-surface py-4 pl-12 pr-4 text-lg font-medium text-white placeholder-vault-text-muted/70 transition-colors focus:border-amber-400/60 focus:bg-vault-surface focus:outline-none focus:ring-2 focus:ring-amber-400/30 sm:text-xl"
				/>
			</div>
		</form>
	</div>

	<main class="mx-auto max-w-3xl px-4 py-4 sm:px-6">
		{#if !data.q}
			<!-- Empty state: hint, not a tutorial. -->
			<div class="mt-12 text-center">
				<svg class="mx-auto h-12 w-12 text-vault-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
				<p class="mt-4 text-lg font-medium text-vault-text">Type a card name above</p>
				<p class="mt-1 text-sm text-vault-text-muted">
					Fast lookup for the card show floor. Results tap through to the full data view.
				</p>
			</div>
		{:else if data.results.length === 0}
			<div class="mt-12 text-center">
				<p class="text-lg font-medium text-vault-text">No matches for "{data.q}"</p>
				<p class="mt-1 text-sm text-vault-text-muted">
					Try a shorter name or check the spelling.
				</p>
			</div>
		{:else}
			<p class="mb-3 text-xs uppercase tracking-wider text-vault-text-muted">
				{data.results.length}{data.truncated ? '+' : ''} result{data.results.length === 1 ? '' : 's'}
				{#if data.truncated} · narrow your search to see more{/if}
			</p>

			<ul class="space-y-2">
				{#each data.results as r (r.card_id)}
					<li>
						<a
							href={`/card/${r.card_id}`}
							class="flex items-center gap-3 rounded-2xl border border-vault-border bg-vault-surface p-3 transition-colors hover:bg-vault-surface-hover active:bg-vault-surface-hover sm:gap-4 sm:p-4"
						>
							<!-- Thumbnail — large for one-handed scanning. -->
							<div class="flex-shrink-0">
								{#if r.image_small_url}
									<img
										src={r.image_small_url}
										alt=""
										class="h-24 w-auto rounded border border-vault-border sm:h-28"
										loading="lazy"
									/>
								{:else}
									<div class="flex h-24 w-16 items-center justify-center rounded border border-vault-border bg-vault-bg text-[10px] text-vault-text-muted sm:h-28 sm:w-20">
										no image
									</div>
								{/if}
							</div>

							<!-- Name + set + price headline. Price comes from the catalog
							     row eagerly per [[feedback_smart_lazy_load_pattern]]. -->
							<div class="min-w-0 flex-1">
								<p class="truncate text-base font-bold text-white sm:text-lg">{r.name}</p>
								<p class="mt-0.5 truncate text-sm text-vault-text-muted">
									{r.set_name}{#if r.card_number} · #{r.card_number}{/if}
								</p>
								{#if r.rarity}
									<p class="mt-0.5 truncate text-xs text-vault-text-muted/80">{r.rarity}</p>
								{/if}
							</div>

							<!-- Price column — eager, the headline for "is this card worth
							     paying attention to right now?" Compact on mobile. -->
							<div class="flex-shrink-0 text-right">
								{#if r.psa10_price != null}
									<p class="text-base font-bold text-vault-gold sm:text-lg">{dollars(r.psa10_price)}</p>
									<p class="text-[10px] uppercase tracking-wider text-vault-text-muted">PSA 10</p>
								{/if}
								{#if r.raw_nm_price != null}
									<p class="mt-1 text-sm font-semibold text-vault-text sm:text-base">{dollars(r.raw_nm_price)}</p>
									<p class="text-[10px] uppercase tracking-wider text-vault-text-muted">Raw NM</p>
								{/if}
								{#if r.lowest_ask_cents != null}
									<p class="mt-1 text-sm font-semibold text-vault-green">{money(r.lowest_ask_cents)}</p>
									<p class="text-[10px] uppercase tracking-wider text-vault-green/80">
										Low ask{#if r.low_ask_is_sample} <span class="text-amber-300" title="Sample data — real live-listings provider not yet wired up.">·sample</span>{/if}
									</p>
								{/if}
								{#if r.psa10_price == null && r.raw_nm_price == null}
									<p class="text-sm italic text-vault-text-muted">no price</p>
								{/if}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
