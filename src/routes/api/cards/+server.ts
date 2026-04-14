import { json } from '@sveltejs/kit';
import { searchCards, getSets } from '$services/tcg-api';
import {
	isCatalogReady,
	searchCatalog,
	getAllSets as getCatalogSets
} from '$lib/server/catalog';
import type { RequestHandler } from './$types';

/**
 * Card search endpoint used by the browse page's client-side fetcher.
 *
 * Reads from the local Supabase catalog when it's been populated (via
 * `npm run ingest:catalog`), and falls back to the live TCG API otherwise.
 * The fallback keeps the app working in environments that haven't run the
 * ingest yet — e.g. fresh deployments or the dev branch before migration.
 *
 * Accepts the same query syntax as the TCG API (`name:"foo*"`, `set.id:base1`,
 * etc.) so old saved URLs keep working. We parse the query into structured
 * filters before handing it to the catalog reader.
 */
export const GET: RequestHandler = async ({ url }) => {
	const rawQuery = url.searchParams.get('q') ?? '';
	const page = parseInt(url.searchParams.get('page') ?? '1');
	const pageSize = parseInt(url.searchParams.get('pageSize') ?? '24');

	const useCatalog = await isCatalogReady();

	if (useCatalog) {
		const filters = parseQuery(rawQuery);
		// No filters at all → default to the latest set, same behavior as before.
		if (!filters.name && !filters.setId && !filters.type && !filters.rarity) {
			const sets = await getCatalogSets();
			const latest = sets[0];
			if (latest) filters.setId = latest.id;
		}
		try {
			const result = await searchCatalog({ ...filters, page, pageSize });
			return json(result, {
				headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' }
			});
		} catch (err) {
			console.error('[api/cards] catalog read failed, falling through:', err);
			// fall through to live API
		}
	}

	// Live TCG API path (catalog empty or errored)
	let query = rawQuery;
	if (!query) {
		try {
			const sets = await getSets();
			const latest = sets[0];
			query = latest ? `set.id:${latest.id}` : '';
		} catch {
			query = '';
		}
	}

	if (!query) {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}

	try {
		const result = await searchCards(query, page, pageSize);
		return json(result, {
			headers: { 'cache-control': 'private, max-age=300, stale-while-revalidate=3600' }
		});
	} catch {
		return json({ data: [], totalCount: 0, page, pageSize, count: 0 });
	}
};

/**
 * Parse the TCG-API-style query string back into structured filters.
 * Supports the four predicates the browse page actually emits:
 *   name:"foo*", set.id:bar, types:Fire, rarity:"Rare Holo"
 * Any predicate it doesn't recognize is dropped — the catalog reader will
 * just ignore it and the user sees a wider result set than expected, which
 * is preferable to silently returning nothing.
 */
function parseQuery(q: string): {
	name?: string;
	setId?: string;
	type?: string;
	rarity?: string;
} {
	const out: { name?: string; setId?: string; type?: string; rarity?: string } = {};
	if (!q) return out;
	// Match: key:"quoted value" OR key:bareword
	const re = /([\w.]+):(?:"([^"]+)"|(\S+))/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(q)) !== null) {
		const key = m[1];
		const value = (m[2] ?? m[3] ?? '').replace(/\*$/, '');
		if (key === 'name') out.name = value;
		else if (key === 'set.id') out.setId = value;
		else if (key === 'types') out.type = value;
		else if (key === 'rarity') out.rarity = value;
	}
	return out;
}
