// import { error } from '@sveltejs/kit';
import { feathersClient } from '../../../store/feathersClient';

/** @type {import('./$types').PageLoad} */
export async function load({ params, fetch }) {
  const { slug } = params;

  console.log(`[+page.ts load()] fetching for slug=${slug}...`);

  const auctionItemResponse = await fetchAuctionItem(slug);
  const auctionItem = auctionItemResponse?.data?.[0]
  const bidsResponse = await fetchBids(auctionItem.id, fetch); // Pass the fetch function to use it inside fetchBids
  const bids = bidsResponse.data;
  return { auctionItem, bids };

  // try {
  //   const response = await fetch(`${API_URL}/auction-items?slug=${slug}`, {
  //     headers: {
  //       Authorization: `Token ${AUTH_TOKEN}`
  //     }
  //   });

  //   console.log(`response.status:`, response.status);
  //   if (response.status >= 500) {
  //     return {
  //       error: true,
  //       statusCode: response.status,
  //     };
  //   }

  //   const json = await response.json();
  //   console.log(`response json:`, json);
  //   if (json.code >= 300) {
  //     return {
  //       ...json,
  //       isError: true
  //     };
  //   }

  //   const auctionItem = json.data[0];
  //   const bids = await fetchBids(auctionItem.id, fetch); // Pass the fetch function to use it inside fetchBids
  //   return { auctionItem, bids };
  // } catch (e) {
  //   console.log(`Error:`, e);
  //   // Use the error function from '@sveltejs/kit' to throw a proper error
  //   throw error(500, `An error occurred while fetching auction item: ${e.message}`);
  // }
}

async function fetchAuctionItem(slug: string) {
  try {
    const response = await feathersClient.service('auction-items').find({
      query: {
        slug,
        $limit: 20,
      }
    })
    console.log(`\n>>>feathers client response items`, response)
    return response
  } catch(e: any){
    console.log(`Error page load auction items:`, e)
    return {
      isError: true,
      message: e.message,
      code: e.code
    }
  }
}

async function fetchBids(itemId, fetch) {
  // Implement the logic to fetch bids for the item sorted by amount
  try {
    const response = await feathersClient.service('auction-bids').find({
      query: {
        $limit: 20,
      }
    })
    console.log(`\n>>>feathers client response bids`, response)
    return response
  } catch(e: any){
    console.log(`Error page load auction bids:`, e)
    return {
      isError: true,
      message: e.message,
      code: e.code
    }
  }

  // try {
  //   const response = await fetch(`${API_URL}/auction-bids?item_id=${itemId}`, {
  //     headers: {
  //       Authorization: `Token ${AUTH_TOKEN}`
  //     }
  //   });

  //   if (response.status >= 500) {
  //     console.error('Server error when fetching bids:', response.status);
  //     // return [];
  //   }

  //   const json = await response.json();

  //   console.log(`bids json`, json)
  //   if (json.code >= 300) {
  //     console.error('Error response when fetching bids:', json);
  //     return [];
  //   }

  //   return json.bids || [];
  // } catch (e) {
  //   console.error(`Error fetching bids for item ${itemId}:`, e);
  //   return [];
  // }
}
