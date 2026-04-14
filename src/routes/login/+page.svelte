<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in — Trove</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-vault-bg px-4">
	<div class="w-full max-w-sm space-y-6 rounded-2xl border border-vault-border bg-vault-surface p-8 shadow-2xl">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-vault-accent to-vault-purple">
				<svg class="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
					<line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" />
					<circle cx="12" cy="12" r="3" fill="currentColor" />
				</svg>
			</div>
			<div>
				<h1 class="text-xl font-bold text-gradient">Trove</h1>
				<p class="text-xs text-vault-text-muted">Sign in to continue</p>
			</div>
		</div>

		{#if !data.authConfigured}
			<div class="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200">
				<p class="font-semibold">Auth not configured</p>
				<p class="mt-1">
					Set <code>TROVE_PASSWORD</code> and <code>TROVE_AUTH_SECRET</code> in your environment, then restart the server.
				</p>
			</div>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="next" value={data.next} />

			<label class="block">
				<span class="text-sm font-medium text-vault-text-muted">Password</span>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					required
					autofocus
					class="mt-1 w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
				/>
			</label>

			{#if form?.error}
				<div class="rounded-xl border border-vault-accent/40 bg-vault-accent/10 px-4 py-3 text-sm text-vault-accent">
					{form.error}
				</div>
			{/if}

			<button
				type="submit"
				disabled={submitting || !data.authConfigured}
				class="btn-press w-full rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40 disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	</div>
</div>
