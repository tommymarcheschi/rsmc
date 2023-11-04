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
}
