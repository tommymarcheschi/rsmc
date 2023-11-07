import { writable, get } from "svelte/store";
import { feathersClient } from "./feathersClient";

export const currentAuctionItem = writable(null)
export const currentBids = writable([])

export const pinHash = writable({
  pin: '',
  hash: ''
})

export async function createBid({ displayName, email, amountSats }: any) {
  const auctionItem = get(currentAuctionItem)
  const pinObj = get(pinHash)

  if (!pinObj.pin || !pinObj.hash) {
    return {
      isError: true,
      message: 'Email verification required',
    }
  }

  console.log(`[createBid] for ${auctionItem?.id}`)
  try {
    const result = await feathersClient.service('auction-bids').create({
      email,
      nickname: displayName,
      bid_amount: Number(amountSats),
      deposit_amount: Math.round(Number(amountSats) / 100),
      item_id: auctionItem?.id,
    }, {
      headers: {
        'x-ev': `${pinObj.pin}:${pinObj.hash}`
      }
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
        status: {
          $in: ['INVOICE_CREATED', 'PAYMENT_PROCESSING', 'PAYMENT_RECEIVED']
        },
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

export async function verifyEmail(email: string) {
  try {
    const response = await feathersClient.service('email-verify').create({
      email
    })
    console.log(`\n>>>feathers client response email-verify`, response)
    if (response.hash) {
      pinHash.set({
        pin: '',
        hash: response.hash
      })
    }
    return true
  } catch(e: any){
    console.log(`[verifyEmail] Error:`, e)
    return {
      isError: true,
      message: e.message,
      code: e.code
    }
  }
}
