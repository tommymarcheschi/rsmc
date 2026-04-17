// Extracted from Icon.svelte so the type can be re-exported via the
// $components barrel. Svelte files can't export types through the
// `*.svelte` module shim, which TS 5 enforces.

export type IconName =
	| 'check'
	| 'close'
	| 'search'
	| 'chevron-left'
	| 'chevron-right'
	| 'bell'
	| 'star'
	| 'trash'
	| 'plus'
	| 'collection'
	| 'eye'
	| 'trending-up'
	| 'sign-out'
	| 'menu'
	| 'alert'
	| 'arrow-up'
	| 'arrow-down';
