import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '';

function createSupabaseClient(): SupabaseClient {
	if (!supabaseUrl || !supabaseKey) {
		// Return a dummy client that won't crash — pages degrade gracefully
		return createClient('https://placeholder.supabase.co', 'placeholder');
	}
	return createClient(supabaseUrl, supabaseKey);
}

export const supabase = createSupabaseClient();
