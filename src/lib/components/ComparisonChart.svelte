<script lang="ts">
	import { onMount } from 'svelte';

	interface ChartDataset {
		label: string;
		prices: number[];
		dates: string[];
		color: string;
	}

	interface Props {
		datasets: ChartDataset[];
		height?: number;
		title?: string;
		normalized?: boolean;
	}

	let { datasets, height = 300, title = '', normalized = false }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: any = null;

	const CHART_COLORS = [
		'#a78bfa', // purple
		'#ff5757', // red accent
		'#34d399', // green
		'#fbbf24', // gold
		'#22d3ee', // cyan
		'#f472b6', // pink
		'#fb923c', // orange
		'#60a5fa'  // blue
	];

	onMount(async () => {
		if (!canvas || datasets.length === 0) return;

		const { Chart, registerables } = await import('chart.js');
		Chart.register(...registerables);

		// Find the longest dataset for labels
		const longestDataset = datasets.reduce((a, b) =>
			a.dates.length >= b.dates.length ? a : b
		);

		const labels = longestDataset.dates.map((d) =>
			new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		);

		const chartDatasets = datasets.map((ds, i) => {
			const color = ds.color || CHART_COLORS[i % CHART_COLORS.length];
			let data = ds.prices;

			// Normalize to percentage change from first value if requested
			if (normalized && data.length > 0) {
				const base = data[0];
				data = data.map((p) => base > 0 ? ((p - base) / base) * 100 : 0);
			}

			return {
				label: ds.label,
				data,
				borderColor: color,
				backgroundColor: color + '18',
				fill: false,
				tension: 0.3,
				borderWidth: 2,
				pointRadius: 0,
				pointHoverRadius: 5,
				pointHoverBackgroundColor: color
			};
		});

		chartInstance = new Chart(canvas, {
			type: 'line',
			data: { labels, datasets: chartDatasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: {
					legend: {
						display: datasets.length > 1,
						position: 'top',
						labels: {
							color: '#9b93b0',
							usePointStyle: true,
							pointStyle: 'circle',
							padding: 16,
							font: { size: 11 }
						}
					},
					tooltip: {
						backgroundColor: '#1c1b27',
						borderColor: '#2e2d42',
						borderWidth: 1,
						titleColor: '#eee8f5',
						bodyColor: '#eee8f5',
						padding: 12,
						callbacks: {
							label: (ctx: any) => {
								const val = ctx.parsed.y;
								if (normalized) {
									return `${ctx.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
								}
								return `${ctx.dataset.label}: $${val.toFixed(2)}`;
							}
						}
					}
				},
				scales: {
					x: {
						grid: { color: 'rgba(46, 45, 66, 0.5)' },
						ticks: {
							color: '#9b93b0',
							maxTicksLimit: 8,
							font: { size: 11 }
						}
					},
					y: {
						grid: { color: 'rgba(46, 45, 66, 0.5)' },
						ticks: {
							color: '#9b93b0',
							font: { size: 11 },
							callback: (val: any) => normalized ? `${val}%` : `$${val}`
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

{#if datasets.length > 0 && datasets.some(d => d.prices.length > 0)}
	{#if title}
		<h3 class="mb-3 text-sm font-semibold text-vault-text-muted">{title}</h3>
	{/if}
	<div style="height: {height}px;">
		<canvas bind:this={canvas}></canvas>
	</div>
{:else}
	<div class="flex items-center justify-center py-8 text-sm text-vault-text-muted" style="height: {height}px;">
		Add cards to compare their price trends
	</div>
{/if}
