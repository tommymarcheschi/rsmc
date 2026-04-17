<script lang="ts">
	import type { TrendingCard } from '$services/poketrace';
	import type {
		UndervaluedResult,
		SupplySqueezeRow,
		HeatmapResult,
		HeatmapCell,
		SetValueResult,
		Era
	} from '$services/insights';
	import { ERA_LABELS } from '$services/insights';

	let { data } = $props();

	let trending = $derived(data.trending as TrendingCard[]);
	let moversUp = $derived(data.moversUp as TrendingCard[]);
	let moversDown = $derived(data.moversDown as TrendingCard[]);
	let undervalued = $derived(data.undervalued as UndervaluedResult);
	let supplySqueeze = $derived(data.supplySqueeze as SupplySqueezeRow[]);
	let heatmap = $derived(data.heatmap as HeatmapResult);
	let setValue = $derived(data.setValue as SetValueResult);
	let portfolio = $derived(data.portfolio);

	let insightTab = $state<
		'undervalued' | 'supply' | 'heatmap' | 'sets' | 'trending' | 'movers'
	>('undervalued');

	function fmtMoney(n: number | null | undefined): string {
		if (n == null) return '—';
		return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
	}

	function cellFor(era: Era, rarity: string): HeatmapCell | undefined {
		return heatmap.cells.find((c) => c.era === era && c.rarity === rarity);
	}

	// Map median pop → background color. Low pop = green (hunt zone),
	// high pop = red (saturated). Log scale because pop distribution is
	// skewed heavily toward very large populations on old Charizards.
	function popBg(pop: number): string {
		const logged = Math.log10(Math.max(1, pop));
		if (logged < 1.3) return 'bg-vault-green/35 text-vault-green';
		if (logged < 1.85) return 'bg-vault-green/20 text-vault-green';
		if (logged < 2.4) return 'bg-vault-gold/20 text-vault-gold';
		if (logged < 3) return 'bg-vault-red/20 text-vault-red';
		return 'bg-vault-red/35 text-vault-red';
	}
</script>

<svelte:head>
	<title>Insights — Trove</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Market Insights</h1>
		<p class="mt-1 text-vault-text-muted">Analytics, trends, and arbitrage opportunities</p>
	</div>

	<!-- Portfolio Summary -->
	<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Portfolio Invested</p>
			<p class="mt-1 text-2xl font-bold text-vault-gold">${portfolio.totalInvested.toFixed(2)}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Total Cards</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.totalCards}</p>
		</div>
		<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-4">
			<p class="text-sm text-vault-text-muted">Unique Entries</p>
			<p class="mt-1 text-2xl font-bold text-white">{portfolio.uniqueCards}</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="flex gap-1 rounded-2xl border border-vault-border bg-vault-surface p-1">
		<button
			onclick={() => (insightTab = 'undervalued')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'undervalued' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Undervalued
		</button>
		<button
			onclick={() => (insightTab = 'supply')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'supply' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Supply Squeeze
		</button>
		<button
			onclick={() => (insightTab = 'heatmap')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'heatmap' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Heatmap
		</button>
		<button
			onclick={() => (insightTab = 'sets')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'sets' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Sets
		</button>
		<button
			onclick={() => (insightTab = 'trending')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'trending' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Trending
		</button>
		<button
			onclick={() => (insightTab = 'movers')}
			class="flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm {insightTab === 'movers' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Movers
		</button>
	</div>

	<!-- Trending Cards Tab -->
	{#if insightTab === 'trending'}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			{#if trending.length > 0}
				<div class="divide-y divide-vault-border">
					{#each trending as card, i}
						<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
							<span class="w-6 text-center text-sm font-bold text-vault-text-muted">#{i + 1}</span>
							{#if card.image_url}
								<img src={card.image_url} alt={card.card_name} class="h-14 w-10 rounded-lg object-cover" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-medium text-white">{card.card_name}</p>
								<p class="text-xs text-vault-text-muted">{card.set_name}</p>
							</div>
							<div class="text-right">
								<p class="font-bold text-white">${card.current_price.toFixed(2)}</p>
								<p class="text-sm {card.change_pct >= 0 ? 'text-vault-green' : 'text-vault-red'}">
									{card.change_pct >= 0 ? '+' : ''}{card.change_pct.toFixed(1)}%
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">Trending data coming soon</p>
						<p class="mt-1 text-sm">
							We started snapshotting every card's price daily at 5am. In ~7 days this tab will rank cards by 7d / 30d momentum — no API key required.
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Supply Squeeze Tab -->
	{#if insightTab === 'supply'}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-6 py-4">
				<p class="text-sm text-white">Low supply, high value</p>
				<p class="mt-1 text-xs text-vault-text-muted">
					Cards where fewer than 200 copies exist in the total PSA population and a PSA 10 still sells for $100+. Low supply + real demand = potential upside as more people hunt them. Sorted by fewest PSA-graded copies.
				</p>
			</div>
			{#if supplySqueeze.length > 0}
				<div class="divide-y divide-vault-border">
					{#each supplySqueeze as row}
						<a href="/card/{row.card_id}" class="flex items-center gap-3 px-3 py-3 transition hover:bg-vault-bg/30 sm:gap-4 sm:px-6 sm:py-4">
							{#if row.image_small_url}
								<img src={row.image_small_url} alt={row.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-white">{row.name}</p>
								<p class="truncate text-xs text-vault-text-muted">
									{row.set_name}{#if row.rarity} · {row.rarity}{/if}
								</p>
								{#if row.raw_nm_price != null}
									<p class="mt-0.5 truncate text-xs text-vault-text-muted">
										Raw {fmtMoney(row.raw_nm_price)} → PSA 10 {fmtMoney(row.psa10_price)}
									</p>
								{/if}
							</div>
							<div class="shrink-0 text-right">
								<p class="text-sm font-bold text-vault-gold">
									{row.psa_pop_total.toLocaleString()}
								</p>
								<p class="text-xs text-vault-text-muted">PSA pop</p>
								{#if row.psa_pop_10 != null}
									<p class="mt-0.5 text-[10px] text-vault-text-muted">
										{row.psa_pop_10} at 10{#if row.psa_gem_rate != null} · {row.psa_gem_rate.toFixed(0)}%{/if}
									</p>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">No supply-squeeze cards found yet</p>
						<p class="mt-1 text-sm">Pop data grows as more sets get indexed.</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Pop Density Heatmap Tab -->
	{#if insightTab === 'heatmap'}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
				<p class="text-sm text-white">Where is PSA supply thin?</p>
				<p class="mt-1 text-xs text-vault-text-muted">
					Median PSA population by era × rarity. Green cells are buckets where most cards have small populations — your grading budget moves the needle more here. Red cells are saturated: a PSA 10 Base Set Charizard is not scarce anymore. Based on <b>{heatmap.totalCards.toLocaleString()}</b> indexed cards with PSA pop data.
				</p>
			</div>
			{#if heatmap.cells.length > 0}
				<div class="overflow-x-auto px-3 py-4 sm:px-6">
					<table class="min-w-full border-separate border-spacing-1 text-xs">
						<thead>
							<tr>
								<th class="sticky left-0 z-10 bg-vault-surface px-2 py-1 text-left font-medium text-vault-text-muted">Era</th>
								{#each heatmap.rarities as rarity}
									<th class="whitespace-nowrap px-2 py-1 text-left font-medium text-vault-text-muted">{rarity}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each heatmap.eras as era}
								<tr>
									<th class="sticky left-0 z-10 whitespace-nowrap bg-vault-surface px-2 py-2 text-left font-medium text-white">
										{ERA_LABELS[era]}
									</th>
									{#each heatmap.rarities as rarity}
										{@const cell = cellFor(era, rarity)}
										<td class="min-w-[110px] align-top">
											{#if cell}
												<div class="rounded-lg px-2 py-1.5 {popBg(cell.median_pop)}">
													<p class="text-sm font-bold">pop {Math.round(cell.median_pop).toLocaleString()}</p>
													<p class="mt-0.5 text-[10px] opacity-80">
														n={cell.card_count}{#if cell.median_psa10_price != null} · PSA10 {fmtMoney(cell.median_psa10_price)}{/if}
													</p>
													{#if cell.scarce_share >= 0.5}
														<p class="mt-0.5 text-[10px] font-medium">{Math.round(cell.scarce_share * 100)}% pop≤50</p>
													{/if}
												</div>
											{:else}
												<div class="rounded-lg border border-dashed border-vault-border/50 px-2 py-1.5 text-[10px] text-vault-text-muted">—</div>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="border-t border-vault-border px-4 py-3 text-[11px] text-vault-text-muted sm:px-6">
					<span class="inline-block rounded bg-vault-green/35 px-2 py-0.5 text-vault-green">pop &lt; 20</span>
					<span class="ml-2 inline-block rounded bg-vault-green/20 px-2 py-0.5 text-vault-green">20–70</span>
					<span class="ml-2 inline-block rounded bg-vault-gold/20 px-2 py-0.5 text-vault-gold">70–250</span>
					<span class="ml-2 inline-block rounded bg-vault-red/20 px-2 py-0.5 text-vault-red">250–1k</span>
					<span class="ml-2 inline-block rounded bg-vault-red/35 px-2 py-0.5 text-vault-red">1k+</span>
					<span class="ml-3">Buckets with fewer than 3 indexed cards are omitted.</span>
				</div>
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">Not enough PSA pop data yet</p>
						<p class="mt-1 text-sm">The heatmap fills in as more sets finish enriching.</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Set Value Tracker Tab -->
	{#if insightTab === 'sets'}
		<div class="rounded-2xl border border-vault-border bg-vault-surface">
			<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
				<p class="text-sm text-white">Which sets are best to grade out of?</p>
				<p class="mt-1 text-xs text-vault-text-muted">
					Aggregates per set: what it'd cost to buy one of each card raw, what the all-PSA-10 ceiling is worth, and the expected realistic net profit if you bought and graded every card (PSA Value tier, with tier escalation on high-value cards, weighted by each card's gem rate). Only cards with enough PSA pop data to trust the gem rate contribute to the ROI sum. Ranked by expected ROI. Based on <b>{setValue.totalCards.toLocaleString()}</b> indexed cards across <b>{setValue.totalSets}</b> sets.
				</p>
			</div>
			{#if setValue.rows.length > 0}
				<div class="overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="border-b border-vault-border bg-vault-bg/30">
							<tr class="text-left text-[11px] font-medium uppercase tracking-wide text-vault-text-muted">
								<th class="px-4 py-2">Set</th>
								<th class="px-2 py-2 text-right">Indexed</th>
								<th class="px-2 py-2 text-right">Raw basis</th>
								<th class="px-2 py-2 text-right">PSA 10 ceiling</th>
								<th class="px-2 py-2 text-right">Avg gem rate</th>
								<th class="px-2 py-2 text-right">Expected ROI</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-vault-border">
							{#each setValue.rows.slice(0, 40) as row}
								<tr class="hover:bg-vault-bg/20">
									<td class="px-4 py-2">
										<a href="/sets?set={row.set_id}" class="text-white hover:text-vault-accent">
											{row.set_name}
										</a>
										{#if row.set_release_date}
											<span class="ml-2 text-[10px] text-vault-text-muted">{row.set_release_date.slice(0, 4)}</span>
										{/if}
									</td>
									<td class="px-2 py-2 text-right text-vault-text-muted">{row.indexed_cards}</td>
									<td class="px-2 py-2 text-right text-vault-text-muted">{fmtMoney(row.raw_basis)}</td>
									<td class="px-2 py-2 text-right font-medium text-vault-gold">{fmtMoney(row.psa10_ceiling)}</td>
									<td class="px-2 py-2 text-right text-vault-text-muted">
										{#if row.avg_gem_rate != null}
											{row.avg_gem_rate.toFixed(1)}%
											<span class="ml-1 text-[10px] opacity-70">(n={row.confident_cards})</span>
										{:else}
											<span class="text-[11px]">—</span>
										{/if}
									</td>
									<td class="px-2 py-2 text-right">
										<span class="font-bold {row.expected_roi > 0 ? 'text-vault-green' : row.expected_roi < 0 ? 'text-vault-red' : 'text-vault-text-muted'}">
											{row.expected_roi >= 0 ? '+' : ''}{fmtMoney(row.expected_roi)}
										</span>
										{#if row.confident_cards > 0}
											<p class="text-[10px] text-vault-text-muted">{row.positive_roi_cards}/{row.confident_cards} profitable</p>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if setValue.rows.length > 40}
					<div class="border-t border-vault-border px-4 py-3 text-[11px] text-vault-text-muted sm:px-6">
						Showing top 40 of {setValue.rows.length} sets by expected ROI.
					</div>
				{/if}
			{:else}
				<div class="flex items-center justify-center py-16 text-vault-text-muted">
					<div class="text-center">
						<p class="text-lg">No set-level data yet</p>
						<p class="mt-1 text-sm">Needs indexed PSA 10 prices — fills in as sets finish enriching.</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Undervalued Tab -->
	{#if insightTab === 'undervalued'}
		<div class="space-y-6">
			<div class="rounded-2xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-vault-text-muted">
				<p class="text-white">How much more does a PSA 10 cost than a raw copy?</p>
				<p class="mt-1">
					For every card, we compare its raw → PSA 10 jump to what's typical for cards of the same rarity <i>and</i> era. (1999 promos and 2024 promos live in different markets — bucketing by era too keeps the median honest.) The two lists flag cards where the jump is way bigger or way smaller than normal — possible mispricings to investigate. Based on <b>{undervalued.cardsAnalyzed.toLocaleString()}</b> indexed cards across <b>{undervalued.bucketsSampled}</b> era × rarity buckets.
				</p>
			</div>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Cheap PSA 10 -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface">
					<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
						<h3 class="font-semibold text-vault-green">PSA 10s selling cheap</h3>
						<p class="mt-0.5 text-xs text-vault-text-muted">
							The jump from raw to PSA 10 is smaller than usual for the rarity. A graded copy may be a bargain right now.
						</p>
					</div>
					{#if undervalued.cheapPsa10.length > 0}
						<div class="divide-y divide-vault-border">
							{#each undervalued.cheapPsa10 as row}
								<a href="/card/{row.card_id}" class="flex items-center gap-3 px-3 py-3 transition hover:bg-vault-bg/30 sm:gap-4 sm:px-6 sm:py-4">
									{#if row.image_small_url}
										<img src={row.image_small_url} alt={row.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-white">{row.name}</p>
										<p class="truncate text-xs text-vault-text-muted">{row.set_name} · {row.rarity} · {ERA_LABELS[row.era]}</p>
										<p class="mt-0.5 truncate text-xs text-vault-text-muted">
											Raw ${row.raw_nm_price.toFixed(0)} → PSA 10 ${row.psa10_price.toFixed(0)}
										</p>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-bold text-vault-green">
											{row.deviation_pct.toFixed(0)}%
										</p>
										<p class="text-xs text-vault-text-muted">below typical</p>
										<p class="mt-0.5 text-[10px] text-vault-text-muted">
											{row.actual_multiple.toFixed(1)}× vs {row.median_multiple.toFixed(1)}×
										</p>
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
							Not enough indexed cards yet — come back after more sets finish enriching.
						</div>
					{/if}
				</div>

				<!-- Hot PSA 10 -->
				<div class="rounded-2xl border border-vault-border bg-vault-surface">
					<div class="border-b border-vault-border px-4 py-3 sm:px-6 sm:py-4">
						<h3 class="font-semibold text-vault-gold">PSA 10s running hot</h3>
						<p class="mt-0.5 text-xs text-vault-text-muted">
							The jump from raw to PSA 10 is much bigger than usual. Either the graded market is hot, or the raw is still cheap — worth a closer look before grading or buying.
						</p>
					</div>
					{#if undervalued.hotPsa10.length > 0}
						<div class="divide-y divide-vault-border">
							{#each undervalued.hotPsa10 as row}
								<a href="/card/{row.card_id}" class="flex items-center gap-3 px-3 py-3 transition hover:bg-vault-bg/30 sm:gap-4 sm:px-6 sm:py-4">
									{#if row.image_small_url}
										<img src={row.image_small_url} alt={row.name} class="h-14 w-10 rounded-lg object-cover" loading="lazy" />
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-white">{row.name}</p>
										<p class="truncate text-xs text-vault-text-muted">{row.set_name} · {row.rarity} · {ERA_LABELS[row.era]}</p>
										<p class="mt-0.5 truncate text-xs text-vault-text-muted">
											Raw ${row.raw_nm_price.toFixed(0)} → PSA 10 ${row.psa10_price.toFixed(0)}
										</p>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-bold text-vault-gold">
											+{row.deviation_pct.toFixed(0)}%
										</p>
										<p class="text-xs text-vault-text-muted">above typical</p>
										<p class="mt-0.5 text-[10px] text-vault-text-muted">
											{row.actual_multiple.toFixed(1)}× vs {row.median_multiple.toFixed(1)}×
										</p>
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
							Not enough indexed cards yet — come back after more sets finish enriching.
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Biggest Movers Tab -->
	{#if insightTab === 'movers'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Biggest Gainers -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-green">Biggest Gainers</h3>
				</div>
				{#if moversUp.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversUp as card}
							<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-white">{card.card_name}</p>
									<p class="text-xs text-vault-text-muted">{card.set_name}</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-bold text-white">${card.current_price.toFixed(2)}</p>
									<p class="text-xs text-vault-green">+{card.change_pct.toFixed(1)}%</p>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
						Data accumulating — lights up after ~7 days of snapshots.
					</div>
				{/if}
			</div>

			<!-- Biggest Losers -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface">
				<div class="border-b border-vault-border px-6 py-4">
					<h3 class="font-semibold text-vault-red">Biggest Losers</h3>
				</div>
				{#if moversDown.length > 0}
					<div class="divide-y divide-vault-border">
						{#each moversDown as card}
							<div class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-6">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-white">{card.card_name}</p>
									<p class="text-xs text-vault-text-muted">{card.set_name}</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-bold text-white">${card.current_price.toFixed(2)}</p>
									<p class="text-xs text-vault-red">{card.change_pct.toFixed(1)}%</p>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-vault-text-muted">
						Data accumulating — lights up after ~7 days of snapshots.
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
