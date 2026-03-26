<script lang="ts">
	// Card Browser — All sets, search, filter, infinite scroll grid
</script>

<svelte:head>
	<title>Browse Cards — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-white">Browse Cards</h1>
			<p class="mt-1 text-vault-text-muted">Explore every Pokémon TCG card ever printed</p>
		</div>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<select class="rounded-lg border border-vault-border bg-vault-surface px-4 py-2 text-sm text-vault-text focus:border-vault-accent focus:outline-none">
			<option value="">All Sets</option>
		</select>
		<select class="rounded-lg border border-vault-border bg-vault-surface px-4 py-2 text-sm text-vault-text focus:border-vault-accent focus:outline-none">
			<option value="">All Types</option>
			<option value="Fire">Fire</option>
			<option value="Water">Water</option>
			<option value="Grass">Grass</option>
			<option value="Electric">Electric</option>
			<option value="Psychic">Psychic</option>
			<option value="Fighting">Fighting</option>
			<option value="Dark">Dark</option>
			<option value="Fairy">Fairy</option>
			<option value="Dragon">Dragon</option>
			<option value="Steel">Steel</option>
			<option value="Normal">Normal</option>
		</select>
		<select class="rounded-lg border border-vault-border bg-vault-surface px-4 py-2 text-sm text-vault-text focus:border-vault-accent focus:outline-none">
			<option value="">All Rarities</option>
			<option value="Common">Common</option>
			<option value="Uncommon">Uncommon</option>
			<option value="Rare">Rare</option>
			<option value="Rare Holo">Rare Holo</option>
			<option value="Rare Ultra">Rare Ultra</option>
			<option value="Rare Secret">Rare Secret</option>
		</select>
	</div>

	<!-- Card Grid -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
		<!-- Cards will be populated from TCG API in Phase 1B -->
		<div class="col-span-full flex items-center justify-center py-24 text-vault-text-muted">
			<p>Card browser will be connected in Phase 1B.</p>
		</div>
	</div>
</div>
