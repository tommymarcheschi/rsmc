import { writable, get } from "svelte/store";
import { feathersClient } from "./feathersClient";

export const currentAuctionItem = writable(null)
export const currentBids = writable([])

export async function createBid({ displayName, email, amountSats }: any) {
  const auctionItem = get(currentAuctionItem)
  console.log(`[createBid] for ${auctionItem?.id}`)
  try {
    const result = await feathersClient.service('auction-bids').create({
      email,
      nickname: displayName,
      bid_amount: Number(amountSats),
      deposit_amount: Math.round(Number(amountSats) / 100),
      item_id: auctionItem?.id,
    })
    loadBids()
    return result
  } catch (e) {
    console.log(`Error creating a bid`, e)
    return {
      isError: true,
      message: e.message,
    }
  }
}

export async function loadBids() {
  const auctionItem = get(currentAuctionItem)
  if (auctionItem?.id) {
    const result = await fetchBids(auctionItem?.id)
    if (result.data.length){
      currentBids.set(result.data)
    }
  }
}

export async function fetchBids(itemId: string) {
  // Implement the logic to fetch bids for the item sorted by amount
  try {
    const response = await feathersClient.service('auction-bids').find({
      query: {
        item_id: itemId,
        $limit: 20,
        $sort: {
          createdAt: -1
        }
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
