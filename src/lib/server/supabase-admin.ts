/**
 * Server-only Supabase client using the service role key. Bypasses RLS, so
 * it must NEVER be imported from anywhere that ships to the browser. The
 * `$lib/server` path is enforced by SvelteKit at build time — importing this
 * from a `+page.svelte` will fail the build, which is exactly what we want.
 *
 * Used by:
 *   - The catalog ingest script (writes to `cards` / `sets`)
 *   - Server-side route handlers that need to read/write trusted data
 *
 * For browser-facing reads, use the publishable client from
 * `$services/supabase` instead.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
	if (cached) return cached;

	const url = env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '';
	const serviceRoleKey =
		env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

	if (!url || !serviceRoleKey) {
		throw new Error(
			'Supabase admin client requires PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
		);
	}

	cached = createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return cached;
}
