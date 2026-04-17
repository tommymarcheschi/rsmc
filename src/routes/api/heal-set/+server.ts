import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import { healSet, type TrackedSetRow } from '$services/auto-heal';
import type { RequestHandler } from './$types';

/**
 * POST /api/heal-set
 * Body: { set_id: string, force?: boolean }
 *
 * Runs the auto-heal service on a single tracked set and returns the
 * report. Shared by every "fix-it-now" button we surface in empty-state
 * UI — the admin dashboard's per-row Heal button uses a SvelteKit form
 * action for no-JS compatibility, but everywhere else we just fetch().
 *
 * Safe to re-run. The 24h freshness guard in healSet() prevents
 * accidental hammering when a user mashes the button.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { set_id?: string; force?: boolean } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected JSON body');
	}
	const setId = (body.set_id ?? '').trim();
	if (!setId) throw error(400, 'set_id is required');

	const { data: tracked, error: readErr } = await supabase
		.from('tracked_sets')
		.select('set_id, set_name, release_date, tcgplayer_set_name, tcgplayer_last_backfilled_at')
		.eq('set_id', setId)
		.maybeSingle();
	if (readErr || !tracked) {
		throw error(404, readErr?.message ?? `Set ${setId} not tracked`);
	}

	const report = await healSet(supabase, tracked as TrackedSetRow, { force: !!body.force });
	return json({ ok: !report.error, report });
};
