<script lang="ts">
	import type { PokemonCard } from '$types';

	interface Enrichment {
		raw_nm_price?: number | null;
		raw_source?: string | null;
		psa10_price?: number | null;
		psa10_delta?: number | null;
		psa10_multiple?: number | null;
		psa_pop_total?: number | null;
		cgc_pop_total?: number | null;
		combined_pop_total?: number | null;
		pcUrl?: string | null;
	}

	interface EnrichedCard extends PokemonCard {
		_enrichment?: Enrichment;
	}

	interface Props {
		card: EnrichedCard;
		showPrice?: boolean;
	}

	let { card, showPrice = false }: Props = $props();

	let enrichment = $derived(card._enrichment);
	let hasDelta = $derived(enrichment?.psa10_delta != null && enrichment.psa10_delta > 0);
	let hasPop = $derived(enrichment?.combined_pop_total != null);

	function fmtPrice(n: number): string {
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}
</script>

<a href="/card/{card.id}" class="card-glow group relative overflow-hidden rounded-2xl border border-vault-border bg-vault-surface transition-all duration-300 hover:border-vault-purple/40 hover:-translate-y-1">
	<div class="aspect-[2.5/3.5] overflow-hidden">
		<img
			src={card.images.small}
			alt={card.name}
			loading="lazy"
			class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
		/>
	</div>

	<!-- Price badge (top right) -->
	{#if showPrice && card.tcgplayer?.prices}
		{@const firstPrice = Object.values(card.tcgplayer.prices)[0]}
		{#if firstPrice?.market}
			<div class="absolute right-2 top-2 rounded-full bg-vault-bg/90 px-2.5 py-1 text-xs font-bold text-vault-green shadow-lg backdrop-blur-sm">
				${firstPrice.market.toFixed(2)}
			</div>
		{/if}
	{:else if enrichment?.raw_nm_price != null}
		<div class="absolute right-2 top-2 rounded-full bg-vault-bg/90 px-2.5 py-1 text-xs font-bold text-vault-green shadow-lg backdrop-blur-sm">
			{fmtPrice(enrichment.raw_nm_price)}
		</div>
	{/if}

	<!-- Delta badge (top left) — shows when enrichment data is present -->
	{#if hasDelta}
		<div class="absolute left-2 top-2 rounded-full bg-vault-purple/90 px-2 py-0.5 text-xs font-bold text-white shadow-lg backdrop-blur-sm" title="Raw → PSA 10 delta">
			+{fmtPrice(enrichment!.psa10_delta!)}
		</div>
	{/if}

	<!-- Pop badge (bottom left) — shows in hunt mode with PSA/CGC breakdown -->
	{#if hasPop}
		{@const psa = enrichment!.psa_pop_total ?? 0}
		{@const cgc = enrichment!.cgc_pop_total ?? 0}
		{@const combined = enrichment!.combined_pop_total ?? 0}
		<div class="absolute bottom-14 left-2 rounded-full bg-vault-bg/90 px-2 py-0.5 text-[10px] font-medium text-vault-text-muted shadow-lg backdrop-blur-sm"
			title="PSA: {psa.toLocaleString()}{cgc ? ` + CGC: ${cgc.toLocaleString()}` : ''} = {combined.toLocaleString()} total graded">
			{#if psa && cgc}
				PSA {psa.toLocaleString()} + CGC {cgc.toLocaleString()}
			{:else if psa}
				PSA pop {psa.toLocaleString()}
			{:else if cgc}
				CGC pop {cgc.toLocaleString()}
			{:else}
				pop {combined.toLocaleString()}
			{/if}
		</div>
	{/if}

	<div class="p-3">
		<p class="truncate text-sm font-medium text-white">{card.name}</p>
		<p class="truncate text-xs text-vault-text-muted">{card.set.name} · #{card.number}</p>
		{#if card.rarity}
			<p class="mt-1 text-xs font-medium text-vault-gold">{card.rarity}</p>
		{/if}
		{#if hasDelta && enrichment?.psa10_price != null}
			<div class="mt-1 flex items-center gap-1.5 text-[10px]">
				<span class="text-vault-text-muted">PSA 10</span>
				<span class="font-medium text-vault-purple">{fmtPrice(enrichment.psa10_price)}</span>
				{#if enrichment.psa10_multiple != null}
					<span class="text-vault-text-muted">({enrichment.psa10_multiple}×)</span>
				{/if}
			</div>
		{/if}
	</div>
</a>
