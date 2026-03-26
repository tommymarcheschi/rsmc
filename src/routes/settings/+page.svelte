<script lang="ts">
	// Settings — API keys, preferences, currency
</script>

<svelte:head>
	<title>Settings — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Settings</h1>
		<p class="mt-1 text-vault-text-muted">Configure your PokéVault experience</p>
	</div>

	<div class="max-w-2xl space-y-6">
		<!-- API Configuration -->
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">API Configuration</h2>
			<p class="mt-1 text-sm text-vault-text-muted">API keys are stored in environment variables on the server.</p>
			<div class="mt-4 space-y-4">
				<div class="flex items-center justify-between rounded-xl border border-vault-border bg-vault-bg p-4">
					<div>
						<p class="text-sm font-medium text-white">Pokémon TCG API</p>
						<p class="text-xs text-vault-text-muted">Card data + images</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-vault-green animate-pulse"></span>
						<span class="text-sm text-vault-green">Connected</span>
					</div>
				</div>
				<div class="flex items-center justify-between rounded-xl border border-vault-border bg-vault-bg p-4">
					<div>
						<p class="text-sm font-medium text-white">PokeTrace</p>
						<p class="text-xs text-vault-text-muted">Multi-marketplace pricing</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-vault-text-muted"></span>
						<span class="text-sm text-vault-text-muted">Not connected</span>
					</div>
				</div>
				<div class="flex items-center justify-between rounded-xl border border-vault-border bg-vault-bg p-4">
					<div>
						<p class="text-sm font-medium text-white">Supabase</p>
						<p class="text-xs text-vault-text-muted">Database + collections</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-vault-green animate-pulse"></span>
						<span class="text-sm text-vault-green">Connected</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Preferences -->
		<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Preferences</h2>
			<div class="mt-4 space-y-4">
				<div>
					<label class="block text-sm font-medium text-vault-text-muted" for="currency">Currency</label>
					<select id="currency" class="mt-1 rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text focus:border-vault-purple focus:outline-none">
						<option value="USD">USD ($)</option>
						<option value="EUR">EUR (€)</option>
						<option value="GBP">GBP (£)</option>
					</select>
				</div>
			</div>
		</div>
	</div>
</div>
