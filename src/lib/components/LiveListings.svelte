<script lang="ts">
	import type { LiveListingsResult } from '$services/live-listings';

	interface Props {
		result: LiveListingsResult | null;
	}

	let { result }: Props = $props();

	function fmtMoney(cents: number): string {
		return `$${(cents / 100).toFixed(2)}`;
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

	function marketplaceLabel(m: string): string {
		switch (m) {
			case 'ebay':
				return 'eBay';
			case 'tcgplayer':
				return 'TCGPlayer';
			case 'mercari':
				return 'Mercari';
			default:
				return m;
		}
	}

	function marketplaceClass(m: string): string {
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

	function buyingLabel(b: string): string {
		switch (b) {
			case 'fixed_price':
				return 'Buy Now';
			case 'auction':
				return 'Auction';
			case 'best_offer':
				return 'Best Offer';
			default:
				return b;
		}
	}
</script>

{#if result && result.listings.length > 0}
	<div class="rounded-2xl border border-vault-border bg-vault-surface">
		<div class="flex items-center justify-between gap-3 border-b border-vault-border px-4 py-3 sm:px-6">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="font-semibold text-white">Live listings</h2>
					{#if result.source === 'stub'}
						<span
							class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"
							title="Sample data — real live-listings provider is being wired up (Sprint 2). Numbers are not market prices."
						>
							Sample data
						</span>
					{:else}
						<span class="text-[10px] uppercase tracking-wider text-vault-text-muted">
							via {result.source}
						</span>
					{/if}
				</div>
				{#if result.lowest_ask_cents != null}
					<p class="mt-0.5 text-xs text-vault-text-muted">
						Low ask: <span class="font-bold text-vault-green">{fmtMoney(result.lowest_ask_cents)}</span>
						· {result.listings.length} active · refreshed {fmtAgo(result.fetched_at)}
					</p>
				{/if}
			</div>
		</div>

		<ul class="divide-y divide-vault-border">
			{#each result.listings as listing}
				{@const isLow = listing.price_cents === result.lowest_ask_cents}
				<li>
					<a
						href={listing.listing_url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-vault-surface-hover sm:gap-4 sm:px-6"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-white">{listing.title}</p>
							<div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
								<span class="rounded-full px-1.5 py-0.5 font-semibold {marketplaceClass(listing.marketplace)}">
									{marketplaceLabel(listing.marketplace)}
								</span>
								<span class="rounded-full bg-vault-bg px-1.5 py-0.5 text-vault-text-muted">
									{buyingLabel(listing.buying_option)}
								</span>
								{#if listing.grader}
									<span class="rounded-full bg-vault-gold/15 px-1.5 py-0.5 font-semibold text-vault-gold">
										{listing.grader} {listing.grade ?? ''}
									</span>
								{/if}
								{#if listing.shipping_cents != null}
									<span class="text-vault-text-muted">
										+{listing.shipping_cents === 0 ? 'free' : fmtMoney(listing.shipping_cents)} ship
									</span>
								{/if}
							</div>
						</div>
						<div class="flex-shrink-0 text-right">
							<p class="text-base font-bold {isLow ? 'text-vault-green' : 'text-white'}">
								{fmtMoney(listing.price_cents)}
							</p>
							{#if isLow}
								<p class="text-[10px] font-bold uppercase tracking-wider text-vault-green">low ask</p>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/if}
