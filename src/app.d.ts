/// <reference types="@sveltejs/kit" />

declare namespace App {
	interface Locals {
		supabase: import('@supabase/supabase-js').SupabaseClient;
		authConfigured: boolean;
		authenticated: boolean;
	}

	interface PageData {}

	interface Error {
		message: string;
		code?: string;
	}
}
