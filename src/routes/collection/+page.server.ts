import { supabase } from '$services/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { data: entries, error } = await supabase
		.from('collection')
		.select('*')
		.order('created_at', { ascending: false });

	return {
		entries: entries ?? []
	};
};
