<script lang="ts">
	import type { GradingService } from '$types';

	interface Props {
		cardName: string;
		rawValue: number;
		gradingCost: number;
		expectedValue: number;
		service: GradingService;
		expectedGrade?: number;
	}

	let { cardName, rawValue, gradingCost, expectedValue, service, expectedGrade }: Props = $props();

	const profit = $derived(expectedValue - rawValue - gradingCost);
	const isWorth = $derived(profit > 0);
</script>

<div class="rounded-xl border border-vault-border bg-vault-surface p-4">
	<div class="flex items-start justify-between">
		<div>
			<p class="font-medium text-white">{cardName}</p>
			<p class="text-xs text-vault-text-muted">{service}{expectedGrade ? ` ${expectedGrade}` : ''}</p>
		</div>
		<span class="rounded-full px-2 py-0.5 text-xs font-bold {isWorth ? 'bg-vault-green/15 text-vault-green' : 'bg-vault-red/15 text-vault-red'}">
			{isWorth ? 'GRADE' : 'SELL RAW'}
		</span>
	</div>
	<div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
		<div>
			<p class="text-vault-text-muted">Raw Value</p>
			<p class="font-semibold text-white">${rawValue.toFixed(2)}</p>
		</div>
		<div>
			<p class="text-vault-text-muted">Grade Cost</p>
			<p class="font-semibold text-white">${gradingCost.toFixed(2)}</p>
		</div>
		<div>
			<p class="text-vault-text-muted">Expected</p>
			<p class="font-semibold {isWorth ? 'text-vault-green' : 'text-vault-red'}">${expectedValue.toFixed(2)}</p>
		</div>
	</div>
	<div class="mt-2 border-t border-vault-border pt-2 text-center">
		<p class="text-xs text-vault-text-muted">
			Est. Profit: <span class="font-bold {isWorth ? 'text-vault-green' : 'text-vault-red'}">{profit >= 0 ? '+' : ''}${profit.toFixed(2)}</span>
		</p>
	</div>
</div>
