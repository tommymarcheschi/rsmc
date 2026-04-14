<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { MonitorSnapshot, ServiceHealth, ServiceStatus } from '$services/api-monitor';

	const POLL_INTERVAL = 30_000; // 30s
	let snapshot = $state<MonitorSnapshot | null>(null);
	let open = $state(false);
	let now = $state(Date.now());
	let timer: ReturnType<typeof setInterval> | null = null;
	let tick: ReturnType<typeof setInterval> | null = null;

	async function refresh() {
		try {
			const res = await fetch('/api/health', { cache: 'no-store' });
			if (res.ok) snapshot = await res.json();
		} catch {
			// Network failure to our own /api/health — leave previous snapshot
		}
	}

	onMount(() => {
		refresh();
		timer = setInterval(refresh, POLL_INTERVAL);
		// Re-tick once a second so countdowns update without refetching
		tick = setInterval(() => (now = Date.now()), 1000);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (tick) clearInterval(tick);
	});

	function colorFor(h: ServiceHealth): string {
		switch (h) {
			case 'ok':
				return 'bg-vault-green';
			case 'error':
				return 'bg-yellow-500';
			case 'ratelimited':
				return 'bg-vault-accent';
			default:
				return 'bg-vault-text-muted';
		}
	}

	function labelFor(h: ServiceHealth): string {
		switch (h) {
			case 'ok':
				return 'Live';
			case 'error':
				return 'Degraded';
			case 'ratelimited':
				return 'Rate limited';
			default:
				return 'Unknown';
		}
	}

	function formatRelative(ts: number | null): string {
		if (!ts) return 'never';
		const delta = now - ts;
		if (delta < 0) return 'in ' + formatDelta(-delta);
		if (delta < 60_000) return Math.round(delta / 1000) + 's ago';
		if (delta < 3_600_000) return Math.round(delta / 60_000) + 'm ago';
		return Math.round(delta / 3_600_000) + 'h ago';
	}

	function formatDelta(ms: number): string {
		if (ms < 60_000) return Math.round(ms / 1000) + 's';
		if (ms < 3_600_000) return Math.round(ms / 60_000) + 'm';
		return Math.round(ms / 3_600_000) + 'h';
	}

	function statusDescription(s: ServiceStatus): string {
		if (s.health === 'ratelimited') {
			if (s.rateLimitResetAt && s.rateLimitResetAt > now) {
				return 'Resets in ' + formatDelta(s.rateLimitResetAt - now);
			}
			return 'Resetting…';
		}
		if (s.health === 'error') return s.lastError ?? 'Recent failure';
		if (s.health === 'ok') {
			if (s.rateLimitRemaining !== null && s.rateLimitLimit !== null) {
				return `${s.rateLimitRemaining}/${s.rateLimitLimit} remaining`;
			}
			return s.totalCalls > 0 ? `${s.totalCalls} call${s.totalCalls === 1 ? '' : 's'}` : 'Idle';
		}
		return 'No traffic yet';
	}

	let overall = $derived(snapshot?.overall ?? 'unknown');
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="flex items-center gap-2 rounded-full px-2 py-1 text-sm text-vault-text-muted transition-colors hover:bg-vault-surface-hover"
		aria-label="API status"
		aria-expanded={open}
	>
		<span class="relative flex h-2 w-2">
			{#if overall === 'ok'}
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-vault-green opacity-60"></span>
			{/if}
			<span class="relative inline-flex h-2 w-2 rounded-full {colorFor(overall)}"></span>
		</span>
		<span class="hidden sm:inline">{labelFor(overall)}</span>
	</button>

	{#if open}
		<button
			type="button"
			class="fixed inset-0 z-40"
			aria-label="Close status panel"
			onclick={() => (open = false)}
		></button>
		<div class="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-vault-border bg-vault-surface p-3 shadow-2xl">
			<div class="mb-3 flex items-center justify-between border-b border-vault-border pb-2">
				<span class="text-sm font-semibold text-white">API Status</span>
				<span class="text-xs text-vault-text-muted">{labelFor(overall)}</span>
			</div>
			{#if snapshot}
				<div class="space-y-2">
					{#each snapshot.services as s (s.service)}
						<div class="flex items-start justify-between gap-3 text-xs">
							<div class="flex items-center gap-2 min-w-0">
								<span class="h-2 w-2 flex-shrink-0 rounded-full {colorFor(s.health)}"></span>
								<span class="truncate text-vault-text">{s.label}</span>
							</div>
							<div class="flex flex-col items-end text-right">
								<span class="text-vault-text-muted">{statusDescription(s)}</span>
								{#if s.lastSuccessAt && s.health === 'ok'}
									<span class="text-[10px] text-vault-text-muted/70">last ok {formatRelative(s.lastSuccessAt)}</span>
								{:else if s.lastErrorAt && s.health !== 'ok'}
									<span class="text-[10px] text-vault-text-muted/70">since {formatRelative(s.lastErrorAt)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-xs text-vault-text-muted">Loading…</p>
			{/if}
			<p class="mt-3 border-t border-vault-border pt-2 text-[10px] text-vault-text-muted">
				Counts reset on server restart. Polls every 30s.
			</p>
		</div>
	{/if}
</div>
