<script lang="ts">
	import '../app.css';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '🏠' },
		{ href: '/browse', label: 'Browse', icon: '🔍' },
		{ href: '/collection', label: 'Collection', icon: '📦' },
		{ href: '/watchlist', label: 'Watchlist', icon: '👁' },
		{ href: '/grading', label: 'Grading', icon: '⭐' },
		{ href: '/insights', label: 'Insights', icon: '📊' }
	];

	let mobileMenuOpen = $state(false);
</script>

<div class="flex h-screen overflow-hidden bg-vault-bg">
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-64 flex-shrink-0 border-r border-vault-border bg-vault-surface lg:flex lg:flex-col">
		<div class="flex h-16 items-center gap-3 border-b border-vault-border px-6">
			<span class="text-2xl">🎴</span>
			<span class="text-xl font-bold text-white">PokéVault</span>
		</div>
		<nav class="flex-1 space-y-1 p-4">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
				>
					<span>{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</nav>
		<div class="border-t border-vault-border p-4">
			<a
				href="/settings"
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
			>
				<span>⚙️</span>
				Settings
			</a>
		</div>
	</aside>

	<!-- Main content area -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Top bar -->
		<header class="flex h-16 items-center justify-between border-b border-vault-border bg-vault-surface px-4 lg:px-8">
			<!-- Mobile menu button -->
			<button
				aria-label="Toggle menu"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="rounded-lg p-2 text-vault-text-muted hover:bg-vault-surface-hover lg:hidden"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="hidden lg:block"></div>

			<!-- Search bar -->
			<div class="mx-4 flex max-w-md flex-1">
				<div class="relative w-full">
					<input
						type="text"
						placeholder="Search cards..."
						class="w-full rounded-lg border border-vault-border bg-vault-bg px-4 py-2 pl-10 text-sm text-vault-text placeholder-vault-text-muted focus:border-vault-accent focus:outline-none focus:ring-1 focus:ring-vault-accent"
					/>
					<svg class="absolute left-3 top-2.5 h-4 w-4 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</div>
			</div>

			<div class="text-sm text-vault-text-muted">PokéVault v0.1</div>
		</header>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto p-4 lg:p-8">
			{@render children()}
		</main>
	</div>
</div>

<!-- Mobile menu overlay -->
{#if mobileMenuOpen}
	<div class="fixed inset-0 z-50 lg:hidden">
		<button aria-label="Close menu" class="fixed inset-0 bg-black/60" onclick={() => (mobileMenuOpen = false)}></button>
		<div class="fixed inset-y-0 left-0 w-64 bg-vault-surface">
			<div class="flex h-16 items-center gap-3 border-b border-vault-border px-6">
				<span class="text-2xl">🎴</span>
				<span class="text-xl font-bold text-white">PokéVault</span>
			</div>
			<nav class="space-y-1 p-4">
				{#each navItems as item}
					<a
						href={item.href}
						onclick={() => (mobileMenuOpen = false)}
						class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-colors hover:bg-vault-surface-hover hover:text-white"
					>
						<span>{item.icon}</span>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}
