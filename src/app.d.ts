/// <reference types="@sveltejs/kit" />

declare namespace App {
	interface Locals {
		supabase: import('@supabase/supabase-js').SupabaseClient;
	}

	interface PageData {}

	interface Error {
		message: string;
		code?: string;
	}
}
