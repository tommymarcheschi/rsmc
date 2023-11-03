// import { error } from '@sveltejs/kit';
import fixture from '../fixture.json';

const API_URL = 'https://rsmc-apis-735bc316de10.herokuapp.com';
// const API_URL = 'http://localhost:3030';

/** @type {import('./$types').PageLoad} */
export async function load({ params, fetch }) {
	const { slug } = params;

	console.log(`[+page.ts load()] fetching for slug=${slug}...`);
	try {
		const response = await fetch(`${API_URL}/auction-items?slug=${slug}`).then((response) =>
			response.json()
		);
		const { data } = response;
		console.log(`response data:`, data);
		const auctionItem = data.data[0];
		const bids = await fetchBids(auctionItem.id);
		return { auctionItem, bids };
	} catch (e) {
		console.log(`Error:`, e);
		return { auctionItem: fixture.data[0], bids: [] };
	}
}


function fetchBids(itemId) {
	// bids for the item softed by amount
	return []
}