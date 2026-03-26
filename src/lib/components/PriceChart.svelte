<script lang="ts">
	import { onMount } from 'svelte';
	import type { PriceHistory } from '$services/price-tracker';

	interface Props {
		priceHistory: PriceHistory | null;
		height?: number;
	}

	let { priceHistory, height = 250 }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: any = null;

	onMount(async () => {
		if (!canvas || !priceHistory?.data_points?.length) return;

		const { Chart, registerables } = await import('chart.js');
		Chart.register(...registerables);

		const labels = priceHistory.data_points.map((p) =>
			new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		);
		const prices = priceHistory.data_points.map((p) => p.price);

		const firstPrice = prices[0] ?? 0;
		const lastPrice = prices[prices.length - 1] ?? 0;
		const isUp = lastPrice >= firstPrice;

		chartInstance = new Chart(canvas, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'Price (USD)',
						data: prices,
						borderColor: isUp ? '#22c55e' : '#ef4444',
						backgroundColor: isUp ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
						fill: true,
						tension: 0.3,
						borderWidth: 2,
						pointRadius: 0,
						pointHoverRadius: 5,
						pointHoverBackgroundColor: isUp ? '#22c55e' : '#ef4444'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: '#111827',
						borderColor: '#1e293b',
						borderWidth: 1,
						titleColor: '#e2e8f0',
						bodyColor: '#e2e8f0',
						padding: 12,
						displayColors: false,
						callbacks: {
							label: (ctx: any) => `$${ctx.parsed.y.toFixed(2)}`
						}
					}
				},
				scales: {
					x: {
						grid: { color: 'rgba(30, 41, 59, 0.5)' },
						ticks: {
							color: '#94a3b8',
							maxTicksLimit: 6,
							font: { size: 11 }
						}
					},
					y: {
						grid: { color: 'rgba(30, 41, 59, 0.5)' },
						ticks: {
							color: '#94a3b8',
							font: { size: 11 },
							callback: (val: any) => `$${val}`
						}
					}
				}
			}
		});

		return () => {
			chartInstance?.destroy();
		};
	});
</script>

{#if priceHistory?.data_points?.length}
	<div style="height: {height}px;">
		<canvas bind:this={canvas}></canvas>
	</div>
{:else}
	<div class="flex items-center justify-center py-8 text-sm text-vault-text-muted" style="height: {height}px;">
		No price history available
	</div>
{/if}
