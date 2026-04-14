import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import {
	isAuthConfigured,
	verifySessionCookie,
	SESSION_COOKIE_NAME
} from '$lib/server/auth';

// Paths that don't require an authenticated session.
// Everything else (pages AND api routes) requires login.
const PUBLIC_PATHS = new Set(['/login', '/logout']);

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) return true;
	// SvelteKit internals and static assets
	if (pathname.startsWith('/_app/')) return true;
	if (pathname === '/favicon.png' || pathname === '/favicon.ico') return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	// If auth env vars aren't set, the gate is effectively off — let everything
	// through and let the login page show a setup banner instead.
	if (!isAuthConfigured()) {
		event.locals.authConfigured = false;
		event.locals.authenticated = false;
		return resolve(event);
	}

	event.locals.authConfigured = true;

	const cookie = event.cookies.get(SESSION_COOKIE_NAME);
	const authenticated = verifySessionCookie(cookie);
	event.locals.authenticated = authenticated;

	if (authenticated || isPublicPath(event.url.pathname)) {
		return resolve(event);
	}

	// Unauthenticated request to a protected route.
	if (event.url.pathname.startsWith('/api/')) {
		return new Response(JSON.stringify({ message: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	const next = encodeURIComponent(event.url.pathname + event.url.search);
	throw redirect(303, `/login?next=${next}`);
};
