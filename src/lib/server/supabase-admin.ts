/**
 * Server-only Supabase client (service-role).
 *
 * WHY: migration 018 enabled RLS on the data-engine tables with anon =
 * SELECT only and NO write policy ("writes stay service-role-only"). The
 * browser/SSR client (src/lib/services/supabase.ts) uses the publishable
 * key = the `anon` role, so any server-side write it issues is silently
 * RLS-filtered to zero rows (PostgREST returns no error) — the write
 * looks like it succeeded but nothing lands. Server-side form actions
 * that must persist (e.g. card-detail "Refresh now") need this
 * privileged client instead.
 *
 * This file lives under `$lib/server` and imports `$env/dynamic/private`
 * so the service-role key can NEVER be bundled into client code — a
 * build error is raised if it is imported from the browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';

const url = pubEnv.PUBLIC_SUPABASE_URL ?? '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * The privileged client, or null when the service-role key isn't
 * configured in this environment. Callers MUST handle null by failing
 * honestly — never fall back to the anon client and report success
 * (that is the exact silent-no-op bug this module exists to fix).
 */
export const supabaseAdmin: SupabaseClient | null =
	url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
