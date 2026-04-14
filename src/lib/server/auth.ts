/**
 * Trove auth — single-user, env-var password, signed-cookie session.
 *
 * Personal app, no user table. The "account" is whoever knows TROVE_PASSWORD.
 * The session cookie is just a signed expiry timestamp — there is no userId
 * because there is one user.
 *
 * To swap this out for real multi-user auth (Supabase Auth, Lucia, etc.):
 *   1. Replace verifyPassword() with a DB lookup
 *   2. Encode the userId into createSession() / verifySession()
 *   3. Add /signup if you want self-serve registration
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'trove_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
	const secret = env.TROVE_AUTH_SECRET;
	if (!secret || secret.length < 16) {
		throw new Error(
			'TROVE_AUTH_SECRET is not set or too short. Set it to a random string of at least 16 characters in .env.local and your hosting provider env vars.'
		);
	}
	return secret;
}

function getPassword(): string | null {
	const pw = env.TROVE_PASSWORD;
	return pw && pw.length > 0 ? pw : null;
}

/** True when the app has been configured with a password. */
export function isAuthConfigured(): boolean {
	return !!env.TROVE_PASSWORD && !!env.TROVE_AUTH_SECRET;
}

/** Constant-time password comparison. */
export function verifyPassword(candidate: string): boolean {
	const expected = getPassword();
	if (!expected) return false;
	const a = Buffer.from(candidate);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

function sign(payload: string): string {
	const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
	return `${payload}.${sig}`;
}

function unsign(signed: string): string | null {
	const lastDot = signed.lastIndexOf('.');
	if (lastDot < 0) return null;
	const payload = signed.slice(0, lastDot);
	const sig = signed.slice(lastDot + 1);
	if (!payload || !sig) return null;
	let expected: string;
	try {
		expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
	} catch {
		return null;
	}
	if (sig.length !== expected.length) return null;
	try {
		const ok = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
		return ok ? payload : null;
	} catch {
		return null;
	}
}

/** Create a new signed-session cookie value. */
export function createSessionCookie(): string {
	const expiresAt = Date.now() + SESSION_TTL_MS;
	return sign(String(expiresAt));
}

/** Returns true if the cookie value is a valid, unexpired session. */
export function verifySessionCookie(value: string | undefined): boolean {
	if (!value) return false;
	const payload = unsign(value);
	if (!payload) return false;
	const expiresAt = Number(payload);
	if (!Number.isFinite(expiresAt)) return false;
	return expiresAt > Date.now();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
