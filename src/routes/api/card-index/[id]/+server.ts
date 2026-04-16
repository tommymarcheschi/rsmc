import { json } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

/**
 * Thin lookup for a single card_index row by card_id. Used by the /grading
 * ROI calculator to get real raw/PSA10/gem-rate data for a user-selected
 * card without widening /api/cards (which is a TCG-API passthrough with a
 * different contract).
 *
 * Returns 404 when the card isn't indexed — the caller surfaces that as
 * "not indexed yet" rather than falling back to a fabricated multiplier.
 */
export const GET: RequestHandler = async ({ params }) => {
	const cardId = params.id;
	if (!cardId) return json({ error: 'missing id' }, { status: 400 });

	// Deliberately does NOT select grading_roi_premium — callers recompute
	// via computeGradingROI, and this way the endpoint keeps working even
	// if migration 004 hasn't been applied yet.
	const { data, error } = await supabase
		.from('card_index')
		.select(
			'card_id, name, set_name, set_release_date, card_number, rarity, image_small_url, ' +
				'raw_nm_price, raw_source, psa10_price, psa_gem_rate, psa_pop_total, psa_pop_10, ' +
				'tag_pop_total, tag_pop_10, graded_prices_fetched_at'
		)
		.eq('card_id', cardId)
		.maybeSingle();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return json({ error: 'not indexed' }, { status: 404 });
	}

	return json(data, {
		headers: { 'cache-control': 'private, max-age=300' }
	});
};
