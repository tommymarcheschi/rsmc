<!--
	Shared icon component so we don't inline the same <svg> markup in
	dozens of places. When the brand refresh lands and we get a new
	icon set (Phosphor, Lucide, custom) the swap happens here.

	Usage: <Icon name="check" /> or <Icon name="search" class="h-4 w-4" />
	Sizing: defaults to 5×5 (matches h-5 w-5 tailwind). Override via class.

	Add a new icon by sticking its path data in ICON_PATHS below.
	Heroicons v1 outline conventions: 24×24 viewBox, stroke-width=2,
	stroke="currentColor", fill="none".
-->
<script lang="ts">
	import type { IconName } from './icon-names';

	interface Props {
		name: IconName;
		class?: string;
		/** Override stroke width — default 2 (matches Heroicons outline). */
		strokeWidth?: number;
		/** When true, use fill=currentColor instead of stroke. For solid icons. */
		solid?: boolean;
		title?: string;
	}

	/** The raw <path d="..."> data for each supported icon. Multi-path
	 *  icons are a single `d` string with separate subpaths — SVG allows
	 *  concatenating them and all our shapes are compatible. */
	const ICON_PATHS: Record<IconName, string> = {
		check: 'M5 13l4 4L19 7',
		close: 'M6 18L18 6M6 6l12 12',
		search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
		'chevron-left': 'M15 19l-7-7 7-7',
		'chevron-right': 'M9 5l7 7-7 7',
		bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
		star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
		trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
		plus: 'M12 4v16m8-8H4',
		collection:
			'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
		eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
		'trending-up': 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
		'sign-out':
			'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
		menu: 'M4 6h16M4 12h16M4 18h16',
		alert: 'M12 9v2m0 4h.01M5.07 19h13.86A2 2 0 0020.7 16.86L13.77 4.94a2 2 0 00-3.54 0L3.3 16.86A2 2 0 005.07 19z',
		'arrow-up': 'M5 10l7-7m0 0l7 7m-7-7v18',
		'arrow-down': 'M19 14l-7 7m0 0l-7-7m7 7V3'
	};

	let {
		name,
		class: klass = 'h-5 w-5',
		strokeWidth = 2,
		solid = false,
		title
	}: Props = $props();

	let path = $derived(ICON_PATHS[name]);
</script>

<svg
	class={klass}
	fill={solid ? 'currentColor' : 'none'}
	viewBox="0 0 24 24"
	stroke={solid ? 'none' : 'currentColor'}
	stroke-width={solid ? 0 : strokeWidth}
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
>
	{#if title}<title>{title}</title>{/if}
	<path stroke-linecap="round" stroke-linejoin="round" d={path} />
</svg>
