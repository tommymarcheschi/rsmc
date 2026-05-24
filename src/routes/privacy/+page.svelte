<svelte:head>
	<title>Privacy Policy — Trove</title>
	<meta name="description" content="Trove privacy policy" />
</svelte:head>

<div class="min-h-screen bg-vault-bg text-vault-text">
	<header class="border-b border-vault-border bg-vault-surface/80 backdrop-blur-sm">
		<div class="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
			<a href="/" class="flex items-center gap-3 text-white transition-opacity hover:opacity-80">
				<div class="brand-chip h-7 w-7">
					<svg class="h-4 w-4 text-vault-bg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
						<line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" />
						<circle cx="12" cy="12" r="3" fill="currentColor" />
					</svg>
				</div>
				<span class="text-lg font-bold text-gradient">Trove</span>
			</a>
		</div>
	</header>

	<article class="mx-auto max-w-3xl space-y-6 px-6 py-10 sm:py-16">
		<div>
			<h1 class="text-3xl font-bold text-white sm:text-4xl">Privacy Policy</h1>
			<p class="mt-2 text-sm text-vault-text-muted">Last updated: May 24, 2026</p>
		</div>

		<section class="space-y-4 text-base leading-relaxed">
			<p>
				Trove is a personal Pokémon trading-card research tool. This page describes what data we collect
				and how we use it.
			</p>

			<h2 class="pt-4 text-xl font-semibold text-white">What we collect</h2>
			<ul class="list-disc space-y-2 pl-6">
				<li>Your email address, used only for sign-in.</li>
				<li>
					Cards you mark as owned or watched, plus any notes / target prices you attach to them. Stored
					in our Supabase database to render your collection and watchlist when you sign in.
				</li>
				<li>
					Anonymized request logs (timestamps, paths, response codes) for debugging. No request bodies,
					no user-identifiable data.
				</li>
			</ul>

			<h2 class="pt-4 text-xl font-semibold text-white">What we don't do</h2>
			<ul class="list-disc space-y-2 pl-6">
				<li>We do not sell, share, or transmit your data to third parties.</li>
				<li>We do not run advertising trackers.</li>
				<li>
					We query third-party data sources (eBay, PriceCharting, pokemontcg.io) as a research client.
					No personally-identifiable information about you is sent to those services.
				</li>
			</ul>

			<h2 class="pt-4 text-xl font-semibold text-white">Data deletion</h2>
			<p>
				You can request deletion of all your data by emailing
				<a class="text-vault-purple hover:underline" href="mailto:tommymarcheschi@gmail.com">
					tommymarcheschi@gmail.com
				</a>. We will confirm and remove within 7 days.
			</p>

			<h2 class="pt-4 text-xl font-semibold text-white">Contact</h2>
			<p>
				Questions, concerns, or requests:
				<a class="text-vault-purple hover:underline" href="mailto:tommymarcheschi@gmail.com">
					tommymarcheschi@gmail.com
				</a>.
			</p>
		</section>

		<footer class="border-t border-vault-border pt-6 text-sm text-vault-text-muted">
			<a class="hover:text-vault-purple" href="/terms">Terms of Service</a>
			<span class="mx-2">·</span>
			<a class="hover:text-vault-purple" href="/">Trove</a>
		</footer>
	</article>
</div>
