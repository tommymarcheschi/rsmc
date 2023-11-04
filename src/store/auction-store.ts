import { writable, get } from "svelte/store";
import { feathersClient } from "./feathersClient";

export const currentAuctionItem = writable(null)
export const bids = writable([])

export async function createBid({ displayName, email, amountSats }: any) {
  const auctionItem = get(currentAuctionItem)
  console.log(`[createBid] for ${auctionItem?.id}`)
  try {
    await feathersClient.service('auction-bids').create({
      email,
      nickname: displayName,
      bid_amount: Number(amountSats),
      deposit_amount: Math.round(Number(amountSats) / 100),
      item_id: auctionItem?.id,
    })
  } catch (e) {
    console.log(`Error creating a bid`, e)
    return {
      isError: true,
      message: e.message,
    }
  }
}
