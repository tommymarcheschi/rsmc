import { json } from '@sveltejs/kit';
import { getSnapshot } from '$services/api-monitor';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(getSnapshot(), {
		headers: {
			// Never cache — this should always reflect the current server state.
			'cache-control': 'no-store, max-age=0'
		}
	});
};
