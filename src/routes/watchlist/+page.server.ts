/**
 * /watchlist now lives as a tab on /collection (Sprint 1D-i sidebar fold).
 *
 * The route stays alive as a permanent redirect so old bookmarks, in-page
 * links, and the dashboard's "View all" button keep working. The actual UI
 * is rendered by `<WatchlistView />` mounted in /collection/+page.svelte
 * when ?tab=watchlist is set.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(308, '/collection?tab=watchlist');
};
