<script lang="ts">
	interface Props {
		setName: string;
		owned: number;
		total: number;
		setImage?: string;
	}

	let { setName, owned, total, setImage }: Props = $props();

	const pct = $derived(total > 0 ? Math.round((owned / total) * 100) : 0);
</script>

<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
	<div class="flex items-center gap-3">
		{#if setImage}
			<img src={setImage} alt={setName} class="h-6 w-6 object-contain" />
		{/if}
		<div class="flex-1">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-white">{setName}</p>
				<p class="text-xs text-vault-text-muted">{owned}/{total}</p>
			</div>
			<div class="mt-2 h-2 overflow-hidden rounded-full bg-vault-bg">
				<div
					class="h-full rounded-full transition-all duration-500 {pct === 100 ? 'bg-vault-gold' : 'bg-vault-accent'}"
					style="width: {pct}%"
				></div>
			</div>
		</div>
	</div>
</div>
