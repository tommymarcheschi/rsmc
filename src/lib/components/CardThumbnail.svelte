<script lang="ts">
	import type { PokemonCard } from '$types';

	interface Enrichment {
		raw_nm_price?: number | null;
		raw_source?: string | null;
		psa10_price?: number | null;
		psa10_delta?: number | null;
		psa10_multiple?: number | null;
		psa10_last_sold_at?: string | null;
		psa_pop_total?: number | null;
		psa_pop_10?: number | null;
		psa_gem_rate?: number | null;
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
	// Real PSA gem rate (psa_pop_10 / psa_pop_total, persisted as a %). Only
	// surface it when it's genuinely backed by a scraped PSA pop — never
	// derive or estimate it. A lower rate = harder to pull a 10, the single
	// most decision-relevant graded signal and (until now) sortable on hunt
	// but invisible on the grid. null ⇒ render nothing (honesty doctrine).
	let gemRate = $derived(
		enrichment?.psa_gem_rate != null && (enrichment?.psa_pop_total ?? 0) > 0
			? enrichment.psa_gem_rate
			: null
	);

	function fmtPrice(n: number): string {
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}

	// Turn a last-sold date into a coarse recency so a PSA 10 price reads
	// as a real comp ("sold 3w ago") not an abstract number. Honesty: if
	// the comp is old we say so rather than implying it's fresh.
	function soldAgo(iso: string | null | undefined): string | null {
		if (!iso) return null;
		const then = new Date(`${iso}T00:00:00Z`).getTime();
		if (Number.isNaN(then)) return null;
		const d = Math.max(0, Math.floor((Date.now() - then) / 86400000));
		if (d <= 1) return 'sold today';
		if (d < 7) return `sold ${d}d ago`;
		if (d < 31) return `sold ${Math.floor(d / 7)}w ago`;
		if (d < 365) return `sold ${Math.floor(d / 30)}mo ago`;
		return `sold ${Math.floor(d / 365)}y ago`;
	}
	let lastSold = $derived(soldAgo(enrichment?.psa10_last_sold_at));

	// Resolve a single headline price for the badge. Prefer TCG API's
	// tcgplayer.prices when populated, otherwise fall back to our own
	// card_index enrichment (which covers new sets pokemontcg.io hasn't
	// priced yet, like the Mega Evolution era). `tcgplayer.prices` being
	// present-but-empty or having null markets should NOT block the
	// fallback — the previous {#if/else if} structure did, hiding prices
	// for any card whose variants all had null market.
	let tcgMarket = $derived.by(() => {
		const prices = card.tcgplayer?.prices;
		if (!prices) return null;
		for (const p of Object.values(prices)) {
			if (p?.market != null && p.market > 0) return p.market;
		}
		return null;
	});
	let headlinePrice = $derived(tcgMarket ?? enrichment?.raw_nm_price ?? null);
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
	{#if showPrice && headlinePrice != null}
		<div class="absolute right-2 top-2 rounded-full bg-vault-bg/90 px-2.5 py-1 text-xs font-bold text-vault-green shadow-lg backdrop-blur-sm">
			{fmtPrice(headlinePrice)}
		</div>
	{/if}

	<!-- Delta badge (top left) — shows when enrichment data is present -->
	{#if hasDelta}
		<div class="absolute left-2 top-2 rounded-full bg-vault-gold/90 px-2 py-0.5 text-xs font-bold text-vault-bg shadow-lg backdrop-blur-sm" title="Raw → PSA 10 delta">
			+{fmtPrice(enrichment!.psa10_delta!)}
		</div>
	{/if}

	<!-- Pop badge (bottom left) — shows in hunt mode with PSA/CGC breakdown -->
	{#if hasPop}
		{@const psa = enrichment!.psa_pop_total ?? 0}
		{@const cgc = enrichment!.cgc_pop_total ?? 0}
		{@const combined = enrichment!.combined_pop_total ?? 0}
		<div class="absolute bottom-14 left-2 rounded-full bg-vault-bg/90 px-2 py-0.5 text-[10px] font-medium text-vault-text-muted shadow-lg backdrop-blur-sm"
			title="PSA: {psa.toLocaleString()}{cgc ? ` + CGC: ${cgc.toLocaleString()}` : ''} = {combined.toLocaleString()} total graded{gemRate != null ? ` · PSA ${(enrichment!.psa_pop_10 ?? 0).toLocaleString()} of ${psa.toLocaleString()} are a 10 → ${gemRate}% gem rate (lower = harder pull)` : ''}">
			{#if psa && cgc}
				PSA {psa.toLocaleString()} + CGC {cgc.toLocaleString()}
			{:else if psa}
				PSA pop {psa.toLocaleString()}
			{:else if cgc}
				CGC pop {cgc.toLocaleString()}
			{:else}
				pop {combined.toLocaleString()}
			{/if}{#if gemRate != null}<span class="ml-1 text-vault-gold">· {gemRate}% gem</span>{/if}
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
				<span class="font-medium text-vault-gold">{fmtPrice(enrichment.psa10_price)}</span>
				{#if enrichment.psa10_multiple != null}
					<span class="text-vault-text-muted">({enrichment.psa10_multiple}×)</span>
				{/if}
				{#if lastSold}
					<span class="text-vault-text-muted" title="Most recent real PSA 10 sold comp on PriceCharting">· {lastSold}</span>
				{/if}
			</div>
		{/if}
	</div>
</a>
