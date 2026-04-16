<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { ApiStatus } from '$components';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
		{ href: '/browse', label: 'Browse', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
		{ href: '/collection', label: 'Collection', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
		{ href: '/watchlist', label: 'Watchlist', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
		{ href: '/grading', label: 'Grading', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
		{ href: '/grading/candidates', label: 'Grading Scan', icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941' },
		{ href: '/insights', label: 'Insights', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
		{ href: '/analytics', label: 'Analytics', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
		{ href: '/sets', label: 'Set Tracker', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
		{ href: '/admin/index', label: 'Card Index', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' }
	];

	let mobileMenuOpen = $state(false);

	// /login uses its own standalone layout — skip the sidebar chrome there.
	let isLoginPage = $derived($page.url.pathname === '/login');

	function isActive(href: string, currentPath: string): boolean {
		if (href === '/') return currentPath === '/';
		if (currentPath === href) return true;
		if (!currentPath.startsWith(href + '/')) return false;
		// Longest-prefix wins. Don't highlight /grading when a more
		// specific sibling like /grading/candidates also matches.
		return !navItems.some(
			(other) =>
				other.href !== href &&
				other.href.length > href.length &&
				(currentPath === other.href || currentPath.startsWith(other.href + '/'))
		);
	}
</script>

{#if isLoginPage}
	{@render children()}
{:else}
<div class="flex h-screen overflow-hidden bg-vault-bg">
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-64 flex-shrink-0 flex-col border-r border-vault-border bg-vault-surface lg:flex">
		<!-- Logo -->
		<div class="flex h-16 items-center gap-3 border-b border-vault-border px-6">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-vault-accent to-vault-purple">
				<svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
					<line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
					<circle cx="12" cy="12" r="3" fill="currentColor"/>
				</svg>
			</div>
			<span class="text-xl font-bold text-gradient">Trove</span>
		</div>

		<!-- Nav items -->
		<nav class="flex-1 space-y-1 p-3">
			{#each navItems as item}
				{@const active = isActive(item.href, $page.url.pathname)}
				<a
					href={item.href}
					class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
						{active ? 'nav-active' : 'text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
				>
					<svg class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
					</svg>
					{item.label}
				</a>
			{/each}
		</nav>

		<!-- Footer -->
		<div class="border-t border-vault-border p-3">
			<a
				href="/settings"
				class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-all duration-200 hover:bg-vault-surface-hover hover:text-white
					{$page.url.pathname === '/settings' ? 'nav-active' : ''}"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				Settings
			</a>
			<a
				href="/style-guide"
				class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-all duration-200 hover:bg-vault-surface-hover hover:text-white
					{$page.url.pathname === '/style-guide' ? 'nav-active' : ''}"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
				</svg>
				Style Guide
			</a>
			<form method="POST" action="/logout" class="contents">
				<button
					type="submit"
					class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-vault-text-muted transition-all duration-200 hover:bg-vault-surface-hover hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
					</svg>
					Sign Out
				</button>
			</form>
		</div>
	</aside>

	<!-- Main content area -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Top bar -->
		<header class="flex h-16 items-center justify-between border-b border-vault-border bg-vault-surface/80 px-4 backdrop-blur-sm lg:px-8">
			<!-- Mobile menu button -->
			<button
				aria-label="Toggle menu"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="rounded-xl p-2 text-vault-text-muted hover:bg-vault-surface-hover hover:text-white lg:hidden"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="hidden lg:block"></div>

			<!--
				Global search bar — plain GET form that natively navigates to
				/browse?q=... when submitted. Works without JS. With JS,
				SvelteKit's data-sveltekit-preload-code on the surrounding
				layout makes the navigation instant; no extra handler needed.
			-->
			<form method="GET" action="/browse" class="mx-2 flex max-w-md flex-1 sm:mx-4">
				<div class="relative w-full">
					<input
						type="text"
						name="q"
						placeholder="Search cards..."
						class="w-full rounded-xl border border-vault-border bg-vault-bg px-4 py-2 pl-10 text-sm text-vault-text placeholder-vault-text-muted transition-all focus:border-vault-purple focus:outline-none focus:ring-1 focus:ring-vault-purple/50"
					/>
					<svg class="absolute left-3 top-2.5 h-4 w-4 text-vault-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</div>
			</form>

			<ApiStatus />
		</header>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8">
			{@render children()}
		</main>
	</div>
</div>

<!-- Mobile menu overlay -->
{#if mobileMenuOpen}
	<div class="fixed inset-0 z-50 lg:hidden">
		<button aria-label="Close menu" class="fixed inset-0 bg-black/70 backdrop-blur-sm" onclick={() => (mobileMenuOpen = false)}></button>
		<div class="fixed inset-y-0 left-0 w-64 max-w-[80vw] bg-vault-surface shadow-2xl">
			<div class="flex h-16 items-center gap-3 border-b border-vault-border px-6">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-vault-accent to-vault-purple">
					<svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
						<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
						<line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
						<circle cx="12" cy="12" r="3" fill="currentColor"/>
					</svg>
				</div>
				<span class="text-xl font-bold text-gradient">Trove</span>
			</div>
			<nav class="space-y-1 p-3">
				{#each navItems as item}
					{@const active = isActive(item.href, $page.url.pathname)}
					<a
						href={item.href}
						onclick={() => (mobileMenuOpen = false)}
						class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
							{active ? 'nav-active' : 'text-vault-text-muted hover:bg-vault-surface-hover hover:text-white'}"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
						</svg>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}
{/if}
