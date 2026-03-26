<script lang="ts">
	let activeTab = $state<'colors' | 'components' | 'typography'>('colors');
</script>

<svelte:head>
	<title>Style Guide — PokéVault</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold text-gradient sm:text-3xl">Style Guide</h1>
		<p class="mt-1 text-vault-text-muted">PokéVault design system reference</p>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 rounded-2xl border border-vault-border bg-vault-surface p-1">
		<button
			onclick={() => (activeTab = 'colors')}
			class="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all {activeTab === 'colors' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Colors
		</button>
		<button
			onclick={() => (activeTab = 'components')}
			class="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all {activeTab === 'components' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Components
		</button>
		<button
			onclick={() => (activeTab = 'typography')}
			class="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all {activeTab === 'typography' ? 'bg-gradient-to-r from-vault-accent to-vault-purple text-white shadow-sm' : 'text-vault-text-muted hover:text-white'}"
		>
			Typography
		</button>
	</div>

	<!-- Colors Tab -->
	{#if activeTab === 'colors'}
		<div class="space-y-6">
			<!-- Core Palette -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Core Palette</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Warm darks with purple undertones — lets card art pop</p>
				<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					<div>
						<div class="h-20 rounded-xl bg-vault-bg border border-vault-border"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-bg</p>
						<p class="text-xs text-vault-text-muted">#12111a</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-surface border border-vault-border"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-surface</p>
						<p class="text-xs text-vault-text-muted">#1c1b27</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-surface-hover border border-vault-border"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-surface-hover</p>
						<p class="text-xs text-vault-text-muted">#2a2940</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-border"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-border</p>
						<p class="text-xs text-vault-text-muted">#2e2d42</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-text flex items-center justify-center">
							<span class="text-xs font-bold text-vault-bg">Aa</span>
						</div>
						<p class="mt-2 text-xs font-medium text-white">vault-text</p>
						<p class="text-xs text-vault-text-muted">#eee8f5</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-text-muted flex items-center justify-center">
							<span class="text-xs font-bold text-vault-bg">Aa</span>
						</div>
						<p class="mt-2 text-xs font-medium text-white">vault-text-muted</p>
						<p class="text-xs text-vault-text-muted">#9b93b0</p>
					</div>
				</div>
			</div>

			<!-- Accent Colors -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Accent Colors</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Primary red (Pokeball energy), secondary purple, and functional colors</p>
				<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					<div>
						<div class="h-20 rounded-xl bg-vault-accent"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-accent</p>
						<p class="text-xs text-vault-text-muted">#ff5757</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-accent-hover"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-accent-hover</p>
						<p class="text-xs text-vault-text-muted">#ff3838</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-purple"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-purple</p>
						<p class="text-xs text-vault-text-muted">#a78bfa</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-gold"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-gold</p>
						<p class="text-xs text-vault-text-muted">#fbbf24</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-green"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-green</p>
						<p class="text-xs text-vault-text-muted">#34d399</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-vault-cyan"></div>
						<p class="mt-2 text-xs font-medium text-white">vault-cyan</p>
						<p class="text-xs text-vault-text-muted">#22d3ee</p>
					</div>
				</div>
			</div>

			<!-- Gradient -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Gradients</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Used for primary actions, active states, and branding</p>
				<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div>
						<div class="h-20 rounded-xl bg-gradient-to-r from-vault-accent to-vault-purple"></div>
						<p class="mt-2 text-xs font-medium text-white">Primary gradient</p>
						<p class="text-xs text-vault-text-muted">accent -> purple (buttons, nav active, branding)</p>
					</div>
					<div>
						<div class="h-20 rounded-xl bg-gradient-to-br from-vault-accent to-vault-purple"></div>
						<p class="mt-2 text-xs font-medium text-white">Logo gradient</p>
						<p class="text-xs text-vault-text-muted">accent -> purple diagonal (logo, icons)</p>
					</div>
				</div>
				<div class="mt-4">
					<p class="text-2xl font-bold text-gradient">Gradient text for headings</p>
					<p class="mt-1 text-xs text-vault-text-muted">Use .text-gradient class for page titles</p>
				</div>
			</div>

			<!-- Pokemon Type Colors -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Pokémon Type Colors</h2>
				<div class="mt-4 flex flex-wrap gap-2">
					<span class="rounded-full bg-type-fire px-3 py-1 text-xs font-semibold text-white">Fire</span>
					<span class="rounded-full bg-type-water px-3 py-1 text-xs font-semibold text-white">Water</span>
					<span class="rounded-full bg-type-grass px-3 py-1 text-xs font-semibold text-white">Grass</span>
					<span class="rounded-full bg-type-electric px-3 py-1 text-xs font-semibold text-white">Electric</span>
					<span class="rounded-full bg-type-psychic px-3 py-1 text-xs font-semibold text-white">Psychic</span>
					<span class="rounded-full bg-type-fighting px-3 py-1 text-xs font-semibold text-white">Fighting</span>
					<span class="rounded-full bg-type-dark px-3 py-1 text-xs font-semibold text-white">Dark</span>
					<span class="rounded-full bg-type-fairy px-3 py-1 text-xs font-semibold text-white">Fairy</span>
					<span class="rounded-full bg-type-dragon px-3 py-1 text-xs font-semibold text-white">Dragon</span>
					<span class="rounded-full bg-type-steel px-3 py-1 text-xs font-semibold text-white">Steel</span>
					<span class="rounded-full bg-type-normal px-3 py-1 text-xs font-semibold text-vault-bg">Normal</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Components Tab -->
	{#if activeTab === 'components'}
		<div class="space-y-6">
			<!-- Buttons -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Buttons</h2>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button class="btn-press rounded-xl bg-gradient-to-r from-vault-accent to-vault-accent-hover px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-accent/20 transition-all hover:shadow-vault-accent/40">
						Primary Action
					</button>
					<button class="btn-press rounded-xl bg-vault-purple px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-vault-purple/20 transition-all hover:bg-vault-purple-hover hover:shadow-vault-purple/40">
						Secondary
					</button>
					<button class="btn-press rounded-xl border border-vault-border px-5 py-2.5 text-sm font-medium text-vault-text transition-all hover:border-vault-purple/50 hover:bg-vault-surface-hover">
						Outline
					</button>
					<button class="btn-press rounded-xl bg-vault-surface-hover px-5 py-2.5 text-sm font-medium text-vault-text-muted transition-all hover:text-white">
						Ghost
					</button>
					<button class="btn-press rounded-xl bg-vault-green/10 px-5 py-2.5 text-sm font-medium text-vault-green transition-all hover:bg-vault-green/20">
						Success
					</button>
					<button class="btn-press rounded-xl bg-vault-red/10 px-5 py-2.5 text-sm font-medium text-vault-red transition-all hover:bg-vault-red/20">
						Danger
					</button>
				</div>
				<p class="mt-3 text-xs text-vault-text-muted">All buttons use .btn-press for active scale effect and rounded-xl for softer corners</p>
			</div>

			<!-- Stat Cards -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Stat Cards</h2>
				<p class="mt-1 text-sm text-vault-text-muted">Use .stat-card for hover lift effect</p>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-5">
						<div class="flex items-center justify-between">
							<p class="text-sm text-vault-text-muted">Label</p>
							<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-gold/10">
								<svg class="h-5 w-5 text-vault-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
						</div>
						<p class="mt-3 text-3xl font-bold text-vault-gold">$420.69</p>
						<p class="mt-1 text-sm text-vault-text-muted">sub text here</p>
					</div>
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-5">
						<div class="flex items-center justify-between">
							<p class="text-sm text-vault-text-muted">Label</p>
							<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-purple/10">
								<svg class="h-5 w-5 text-vault-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
								</svg>
							</div>
						</div>
						<p class="mt-3 text-3xl font-bold text-white">147</p>
						<p class="mt-1 text-sm text-vault-text-muted">sub text here</p>
					</div>
					<div class="stat-card rounded-2xl border border-vault-border bg-vault-surface p-5">
						<div class="flex items-center justify-between">
							<p class="text-sm text-vault-text-muted">Label</p>
							<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-vault-green/10">
								<svg class="h-5 w-5 text-vault-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
								</svg>
							</div>
						</div>
						<p class="mt-3 text-3xl font-bold text-vault-green">+12.4%</p>
						<p class="mt-1 text-sm text-vault-text-muted">sub text here</p>
					</div>
				</div>
			</div>

			<!-- Cards & Containers -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Cards & Containers</h2>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="rounded-2xl border border-vault-border bg-vault-surface p-5">
						<p class="font-medium text-white">Standard card</p>
						<p class="mt-1 text-sm text-vault-text-muted">rounded-2xl, border, bg-vault-surface, p-5/6</p>
					</div>
					<div class="card-glow rounded-2xl border border-vault-border bg-vault-surface p-5 cursor-pointer">
						<p class="font-medium text-white">Hover glow card</p>
						<p class="mt-1 text-sm text-vault-text-muted">Add .card-glow for warm hover shadow</p>
					</div>
					<div class="shimmer rounded-2xl border border-vault-border bg-vault-surface p-5">
						<p class="font-medium text-white">Shimmer card</p>
						<p class="mt-1 text-sm text-vault-text-muted">Add .shimmer for subtle animation</p>
					</div>
					<div class="rounded-xl border border-vault-border bg-vault-bg p-4">
						<p class="font-medium text-white">Nested card</p>
						<p class="mt-1 text-sm text-vault-text-muted">bg-vault-bg for inner containers</p>
					</div>
				</div>
			</div>

			<!-- Inputs -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Inputs</h2>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="demo-input">Text Input</label>
						<input
							id="demo-input"
							type="text"
							placeholder="Placeholder text..."
							class="mt-1 w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-vault-text-muted" for="demo-select">Select</label>
						<select
							id="demo-select"
							class="mt-1 w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-sm text-vault-text transition-all focus:border-vault-purple focus:outline-none"
						>
							<option>Option A</option>
							<option>Option B</option>
							<option>Option C</option>
						</select>
					</div>
				</div>
				<p class="mt-3 text-xs text-vault-text-muted">Focus state uses vault-purple ring. All inputs use rounded-xl.</p>
			</div>

			<!-- Badges & Tags -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Badges & Price Tags</h2>
				<div class="mt-4 flex flex-wrap gap-3">
					<span class="rounded-full bg-vault-green/10 px-3 py-1 text-xs font-bold text-vault-green">+5.2%</span>
					<span class="rounded-full bg-vault-red/10 px-3 py-1 text-xs font-bold text-vault-red">-3.1%</span>
					<span class="rounded-full bg-vault-gold/10 px-3 py-1 text-xs font-bold text-vault-gold">$24.99</span>
					<span class="rounded-full bg-vault-purple/10 px-3 py-1 text-xs font-medium text-vault-purple">Rare Holo</span>
					<span class="rounded-full bg-vault-cyan/10 px-3 py-1 text-xs font-medium text-vault-cyan">Live Data</span>
					<span class="rounded-lg border border-vault-border px-2.5 py-1 text-xs text-vault-text-muted">Near Mint</span>
				</div>
			</div>

			<!-- Status Indicators -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Status Indicators</h2>
				<div class="mt-4 flex flex-wrap gap-3">
					<span class="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-medium text-yellow-400">pending</span>
					<span class="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400">submitted</span>
					<span class="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-medium text-purple-400">received</span>
					<span class="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-400">grading</span>
					<span class="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-medium text-cyan-400">shipped</span>
					<span class="rounded-full bg-green-500/15 px-3 py-1 text-xs font-medium text-green-400">complete</span>
				</div>
			</div>

			<!-- ROI Result Examples -->
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">ROI Decision Cards</h2>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="rounded-xl border border-vault-green/30 bg-vault-green/5 p-4">
						<div class="flex items-center justify-between">
							<span class="text-sm font-bold text-vault-green">WORTH GRADING</span>
							<span class="rounded-full bg-vault-green/20 px-2.5 py-0.5 text-xs font-bold text-vault-green">+$85.00</span>
						</div>
						<p class="mt-2 text-xs text-vault-text-muted">Estimated profit exceeds grading cost</p>
					</div>
					<div class="rounded-xl border border-vault-red/30 bg-vault-red/5 p-4">
						<div class="flex items-center justify-between">
							<span class="text-sm font-bold text-vault-red">SELL RAW</span>
							<span class="rounded-full bg-vault-red/20 px-2.5 py-0.5 text-xs font-bold text-vault-red">-$12.00</span>
						</div>
						<p class="mt-2 text-xs text-vault-text-muted">Grading cost exceeds potential return</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Typography Tab -->
	{#if activeTab === 'typography'}
		<div class="space-y-6">
			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Type Scale</h2>
				<div class="mt-4 space-y-4">
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">3xl</span>
						<p class="text-3xl font-bold text-white">Page Heading</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">3xl grad</span>
						<p class="text-3xl font-bold text-gradient">Gradient Heading</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">lg</span>
						<p class="text-lg font-semibold text-white">Section Title</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">sm med</span>
						<p class="text-sm font-medium text-white">Card/Item Title</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">sm</span>
						<p class="text-sm text-vault-text-muted">Body / description text</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-16 text-xs text-vault-text-muted">xs</span>
						<p class="text-xs text-vault-text-muted">Labels, metadata, timestamps</p>
					</div>
				</div>
			</div>

			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Number Styles</h2>
				<div class="mt-4 space-y-3">
					<div class="flex items-baseline gap-4">
						<span class="w-24 text-xs text-vault-text-muted">Big stat</span>
						<p class="text-3xl font-bold text-vault-gold">$1,234.56</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-24 text-xs text-vault-text-muted">Price up</span>
						<p class="text-sm font-bold text-vault-green">+$42.00 (+12.4%)</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-24 text-xs text-vault-text-muted">Price down</span>
						<p class="text-sm font-bold text-vault-red">-$8.50 (-3.1%)</p>
					</div>
					<div class="flex items-baseline gap-4">
						<span class="w-24 text-xs text-vault-text-muted">Card count</span>
						<p class="text-2xl font-bold text-white">147</p>
					</div>
				</div>
			</div>

			<div class="rounded-2xl border border-vault-border bg-vault-surface p-6">
				<h2 class="text-lg font-semibold text-white">Design Principles</h2>
				<div class="mt-4 space-y-3 text-sm text-vault-text-muted">
					<p><span class="font-medium text-white">Dark canvas, bright cards.</span> The deep warm-dark background exists to make Pokémon card art the hero of every page.</p>
					<p><span class="font-medium text-white">Warm, not cold.</span> Purple-tinted darks and warm accent colors (red, gold, purple) create an inviting, collector-friendly atmosphere. No sterile blues.</p>
					<p><span class="font-medium text-white">Soft corners everywhere.</span> rounded-2xl for containers, rounded-xl for buttons/inputs/nested items. Makes the app feel approachable.</p>
					<p><span class="font-medium text-white">Motion with purpose.</span> Hover lifts on stat cards, glow on card thumbnails, subtle press on buttons. Animation enhances, never distracts.</p>
					<p><span class="font-medium text-white">Color signals meaning.</span> Green = price up / positive. Red = price down / danger. Gold = money / value. Purple = accent / interactive. Cyan = data / info.</p>
				</div>
			</div>
		</div>
	{/if}
</div>
