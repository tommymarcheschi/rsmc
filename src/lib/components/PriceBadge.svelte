<script lang="ts">
	interface Props {
		price: number;
		previousPrice?: number;
		currency?: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { price, previousPrice, currency = '$', size = 'md' }: Props = $props();

	const change = $derived(previousPrice ? ((price - previousPrice) / previousPrice) * 100 : 0);
	const isUp = $derived(change > 0);
	const isDown = $derived(change < 0);

	const sizeClasses = $derived({
		sm: 'text-xs px-1.5 py-0.5',
		md: 'text-sm px-2 py-1',
		lg: 'text-base px-3 py-1.5'
	}[size]);
</script>

<span class="inline-flex items-center gap-1 rounded-full font-semibold {sizeClasses} {isUp ? 'bg-vault-green/15 text-vault-green' : isDown ? 'bg-vault-red/15 text-vault-red' : 'bg-vault-surface text-vault-text'}">
	{currency}{price.toFixed(2)}
	{#if change !== 0}
		<span class="text-[0.75em]">
			{isUp ? '▲' : '▼'}{Math.abs(change).toFixed(1)}%
		</span>
	{/if}
</span>
