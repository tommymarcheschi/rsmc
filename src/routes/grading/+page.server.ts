import { supabase } from '$services/supabase';
import { getGradingFees } from '$services/price-tracker';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [submissionsRes, fees] = await Promise.all([
		supabase.from('grading').select('*').order('created_at', { ascending: false }),
		getGradingFees()
	]);

	return {
		submissions: submissionsRes.data ?? [],
		gradingFees: fees
	};
};
