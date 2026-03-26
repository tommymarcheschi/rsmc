import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

// GET — fetch all watchlist entries
export const GET: RequestHandler = async () => {
	const { data, error: err } = await supabase
		.from('watchlist')
		.select('*')
		.order('created_at', { ascending: false });

	if (err) throw error(500, err.message);
	return json(data);
};

// POST — add a card to the watchlist
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { card_id, target_price } = body;

	if (!card_id) throw error(400, 'card_id is required');

	const { data, error: err } = await supabase
		.from('watchlist')
		.insert({
			card_id,
			target_price: target_price ?? null,
			alert_enabled: true
		})
		.select()
		.single();

	if (err) {
		if (err.code === '23505') throw error(409, 'Card already on watchlist');
		throw error(500, err.message);
	}
	return json(data, { status: 201 });
};

// DELETE — remove from watchlist
export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id is required');

	const { error: err } = await supabase
		.from('watchlist')
		.delete()
		.eq('id', id);

	if (err) throw error(500, err.message);
	return json({ success: true });
};

// PATCH — update watchlist entry (target price, alert toggle)
export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id, ...updates } = body;

	if (!id) throw error(400, 'id is required');

	const { data, error: err } = await supabase
		.from('watchlist')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (err) throw error(500, err.message);
	return json(data);
};
