<script lang="ts">
	// Grading — ROI calculator, submission tracker
</script>

<svelte:head>
	<title>Grading — PokéVault</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-white">Grading Center</h1>
		<p class="mt-1 text-vault-text-muted">Calculate ROI and track your grading submissions</p>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- ROI Calculator -->
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<h2 class="text-lg font-semibold text-white">Grading ROI Calculator</h2>
			<p class="mt-2 text-sm text-vault-text-muted">
				Enter a card to see if it's worth grading — compare PSA, CGC, BGS, and SGC.
			</p>
			<div class="mt-4 space-y-4">
				<input
					type="text"
					placeholder="Search for a card..."
					class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-accent focus:outline-none"
				/>
				<p class="text-center text-sm text-vault-text-muted">
					ROI calculator will be connected in Phase 3.
				</p>
			</div>
		</div>

		<!-- Submission Tracker -->
		<div class="rounded-xl border border-vault-border bg-vault-surface p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Submission Tracker</h2>
				<button class="rounded-lg bg-vault-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-vault-accent-hover">
					+ New Submission
				</button>
			</div>
			<div class="mt-4 flex items-center justify-center py-12 text-vault-text-muted">
				<p>No grading submissions yet.</p>
			</div>
		</div>
	</div>
</div>
