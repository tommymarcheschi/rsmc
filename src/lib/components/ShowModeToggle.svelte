<script lang="ts">
	import { showMode } from '$stores/show-mode';
</script>

<button
	type="button"
	onclick={() => showMode.toggle()}
	aria-pressed={$showMode}
	aria-label={$showMode ? 'Turn off Show Mode' : 'Turn on Show Mode'}
	title={$showMode
		? 'Show Mode is ON — optimized for in-person card lookups'
		: 'Show Mode — fast lookups for card shows + bad WiFi'}
	class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all
		{$showMode
			? 'border-amber-400/60 bg-amber-400/10 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.25)] hover:bg-amber-400/20'
			: 'border-vault-border text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
>
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
	</svg>
	<span class="hidden sm:inline">Show</span>
</button>
