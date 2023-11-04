import { writable } from "svelte/store";
import { feathersClient } from "./feathersClient";

export const auctionItem = writable(null)
export const bids = writable([])

export function createBid({ displayName, email, amountSats }: any) {
  feathersClient.service('auction-bids').create({
    email,
    nickname: displayName,
    bid_amount: amountSats
  })
}
