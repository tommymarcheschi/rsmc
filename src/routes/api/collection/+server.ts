import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

// GET — fetch all collection entries
export const GET: RequestHandler = async ({ url }) => {
	const search = url.searchParams.get('search') ?? '';

	let query = supabase
		.from('collection')
		.select('*')
		.order('created_at', { ascending: false });

	if (search) {
		query = query.ilike('card_id', `%${search}%`);
	}

	const { data, error: err } = await query;
	if (err) throw error(500, err.message);

	return json(data);
};

// POST — add a card to the collection
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { card_id, quantity, condition, purchase_price, purchase_date, notes } = body;

	if (!card_id) throw error(400, 'card_id is required');

	// Check if card already exists with same condition
	const { data: existing } = await supabase
		.from('collection')
		.select('id, quantity')
		.eq('card_id', card_id)
		.eq('condition', condition ?? 'NM')
		.single();

	if (existing) {
		// Update quantity
		const { data, error: err } = await supabase
			.from('collection')
			.update({ quantity: existing.quantity + (quantity ?? 1) })
			.eq('id', existing.id)
			.select()
			.single();

		if (err) throw error(500, err.message);
		return json(data);
	}

	const { data, error: err } = await supabase
		.from('collection')
		.insert({
			card_id,
			quantity: quantity ?? 1,
			condition: condition ?? 'NM',
			purchase_price: purchase_price ?? null,
			purchase_date: purchase_date ?? null,
			notes: notes ?? null
		})
		.select()
		.single();

	if (err) throw error(500, err.message);
	return json(data, { status: 201 });
};

// DELETE — remove a card from the collection
export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id is required');

	const { error: err } = await supabase
		.from('collection')
		.delete()
		.eq('id', id);

	if (err) throw error(500, err.message);
	return json({ success: true });
};

// PATCH — update a collection entry
export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id, ...updates } = body;

	if (!id) throw error(400, 'id is required');

	const { data, error: err } = await supabase
		.from('collection')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (err) throw error(500, err.message);
	return json(data);
};
