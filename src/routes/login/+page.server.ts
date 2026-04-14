import { fail, redirect } from '@sveltejs/kit';
import {
	verifyPassword,
	createSessionCookie,
	isAuthConfigured,
	verifySessionCookie,
	SESSION_COOKIE_NAME,
	SESSION_TTL_SECONDS
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	// If already logged in, bounce to the dashboard (or to ?next=).
	const authConfigured = isAuthConfigured();
	if (authConfigured && verifySessionCookie(cookies.get(SESSION_COOKIE_NAME))) {
		const next = url.searchParams.get('next') || '/';
		throw redirect(303, next);
	}
	return {
		authConfigured,
		next: url.searchParams.get('next') ?? ''
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		if (!isAuthConfigured()) {
			return fail(503, {
				error:
					'Auth is not configured. Set TROVE_PASSWORD and TROVE_AUTH_SECRET in your environment.'
			});
		}

		const data = await request.formData();
		const password = String(data.get('password') ?? '');

		if (!password) {
			return fail(400, { error: 'Password is required.' });
		}

		if (!verifyPassword(password)) {
			return fail(401, { error: 'Incorrect password.' });
		}

		cookies.set(SESSION_COOKIE_NAME, createSessionCookie(), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: SESSION_TTL_SECONDS
		});

		const next = (data.get('next') as string) || '/';
		// Only allow same-origin redirects
		const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
		throw redirect(303, safeNext);
	}
};
