<script lang="ts">
	import type { PokemonCard } from '$types';
	import { getHeadlinePrice } from '$services/card-price';

	interface Props {
		card: PokemonCard;
		showPrice?: boolean;
		/** Optional override badge (e.g. "Spread $4.20"). When set, replaces the price chip. */
		badgeLabel?: string | null;
	}

	let { card, showPrice = false, badgeLabel = null }: Props = $props();

	const headline = $derived(getHeadlinePrice(card));
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

	{#if badgeLabel}
		<div class="absolute right-2 top-2 rounded-full bg-vault-bg/90 px-2.5 py-1 text-xs font-bold text-vault-gold shadow-lg backdrop-blur-sm">
			{badgeLabel}
		</div>
	{:else if showPrice && headline != null}
		<div class="absolute right-2 top-2 rounded-full bg-vault-bg/90 px-2.5 py-1 text-xs font-bold text-vault-green shadow-lg backdrop-blur-sm">
			${headline.toFixed(2)}
		</div>
	{/if}

	<div class="p-3">
		<p class="truncate text-sm font-medium text-white">{card.name}</p>
		<p class="truncate text-xs text-vault-text-muted">{card.set.name} · #{card.number}</p>
		{#if card.rarity}
			<p class="mt-1 text-xs font-medium text-vault-gold">{card.rarity}</p>
		{/if}
	</div>
</a>
