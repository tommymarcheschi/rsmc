


import { error } from '@sveltejs/kit';
import fixture from '../fixture.json';

const API_URL = 'https://rsmc-apis-735bc316de10.herokuapp.com';
const AUTH_TOKEN = '40d297961fd17c0d8eab41c5413d754b293ca87ec06aa29d1d96256c398883b7';
// const API_URL = 'http://localhost:3030';

/** @type {import('./$types').PageLoad} */
export async function load({ params, fetch }) {
  const { slug } = params;

  console.log(`[+page.ts load()] fetching for slug=${slug}...`);

  try {
    const response = await fetch(`${API_URL}/auction-items?slug=${slug}`, {
      headers: {
        Authorization: `Token ${AUTH_TOKEN}`
      }
    });

    console.log(`response.status:`, response.status);
    if (response.status >= 500) {
      return {
        error: true,
        statusCode: response.status,
      };
    }

    const json = await response.json();
    console.log(`response json:`, json);
    if (json.code >= 300) {
      return {
        ...json,
        isError: true
      };
    }

    const auctionItem = json.data[0];
    const bids = await fetchBids(auctionItem.id, fetch); // Pass the fetch function to use it inside fetchBids
    return { auctionItem, bids };
  } catch (e) {
    console.log(`Error:`, e);
    // Use the error function from '@sveltejs/kit' to throw a proper error
    throw error(500, `An error occurred while fetching auction item: ${e.message}`);
  }
}

async function fetchBids(itemId, fetch) {
  // Implement the logic to fetch bids for the item sorted by amount
  try {
    const response = await fetch(`${API_URL}/bids?itemId=${itemId}`, {
      headers: {
        Authorization: `Token ${AUTH_TOKEN}`
      }
    });

    if (response.status >= 500) {
      console.error('Server error when fetching bids:', response.status);
      return [];
    }

    const json = await response.json();
    if (json.code >= 300) {
      console.error('Error response when fetching bids:', json);
      return [];
    }

    return json.bids || [];
  } catch (e) {
    console.error(`Error fetching bids for item ${itemId}:`, e);
    return [];
  }
}
