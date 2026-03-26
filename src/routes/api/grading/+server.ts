import { json, error } from '@sveltejs/kit';
import { supabase } from '$services/supabase';
import type { RequestHandler } from './$types';

// GET — fetch all grading submissions
export const GET: RequestHandler = async () => {
	const { data, error: err } = await supabase
		.from('grading')
		.select('*')
		.order('created_at', { ascending: false });

	if (err) throw error(500, err.message);
	return json(data);
};

// POST — add a grading submission
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { card_id, service, tier, submitted_date, cost } = body;

	if (!card_id || !service) throw error(400, 'card_id and service are required');

	const { data, error: err } = await supabase
		.from('grading')
		.insert({
			card_id,
			service,
			tier: tier ?? 'regular',
			status: 'pending',
			submitted_date: submitted_date ?? null,
			cost: cost ?? null
		})
		.select()
		.single();

	if (err) throw error(500, err.message);
	return json(data, { status: 201 });
};

// PATCH — update a grading submission
export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id, ...updates } = body;

	if (!id) throw error(400, 'id is required');

	const { data, error: err } = await supabase
		.from('grading')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (err) throw error(500, err.message);
	return json(data);
};

// DELETE — remove a grading submission
export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id is required');

	const { error: err } = await supabase
		.from('grading')
		.delete()
		.eq('id', id);

	if (err) throw error(500, err.message);
	return json({ success: true });
};
