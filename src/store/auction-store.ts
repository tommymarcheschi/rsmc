import { writable, get } from "svelte/store";
import { feathersClient } from "./feathersClient";

export const currentAuctionItem = writable(null)
export const currentBids = writable([])
export const bidStatus = writable('')

export const pinHash = writable({
  pin: '',
  hash: ''
})
export const currentEmail = writable('')
export const currentDisplayName = writable('')

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
    const bids = await fetchBidsWithPending(auctionItem?.id)
    currentBids.set(bids)
  }
}

export async function fetchBidsWithPending(itemId: string) {
  let bids = []
  const result = await fetchBids(itemId)
  if (result.data.length){
    bids = result.data
  }
  const resultPending = await fetchPendingBids(itemId)
  // Add pending to the start of the list only if its bid amount is greater than the biggest paid bid.
  if (resultPending.data.length && (!bids[0] || resultPending.data[0].bid_amount > bids[0].bid_amount)){
    bids.unshift(resultPending.data[0])
  }
  return bids
}

export async function fetchBids(itemId: string) {
  // Implement the logic to fetch bids for the item sorted by amount
  try {
    const response = await feathersClient.service('auction-bids').find({
      query: {
        item_id: itemId,
        status: {
          $in: ['PAYMENT_RECEIVED']
        },
        $limit: 20,
        $sort: {
          bid_amount: -1
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

export async function fetchPendingBids(itemId: string) {
  const now = Math.floor(Date.now() / 1000)
  try {
    const response = await feathersClient.service('auction-bids').find({
      query: {
        item_id: itemId,
        status: {
          $in: ['INVOICE_CREATED', 'PAYMENT_PROCESSING']
        },
        invoice_expiration: {
          $gt: now
        },
        $limit: 1,
        $sort: {
          bid_amount: -1
        }
      }
    })
    console.log(`\n>>>feathers client response pendingBids`, response)
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

export async function verifyEmail(email: string, displayName: string) {
  try {
    const response = await feathersClient.service('email-verify').create({
      email,
      displayName,
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

export function pollBidStatus(bidId: string) {
  // Give user 5 minutes
  const numberOfMinutes = 10
  const interval = 5000
  const times = numberOfMinutes * 12
  const service = 'auction-bids'
  const onSuccess = (status: string) => bidStatus.set(status)

  pollForStatus(bidId, ['PAYMENT_PROCESSING', 'PAYMENT_RECEIVED'], { interval, times, service, onSuccess })
}

type PollOptions = {
  interval: number
  times: number
  service: string
  onSuccess: (status: string) => void
}

function pollForStatus(id: string, statusesToWatch: string[], { interval, times, service, onSuccess }: PollOptions) {
  // Check status for 'PAYMENT_RECEIVED'
  setTimeout(async () => {
    console.log(`- [pollForStatus,${service}] ${id}, ${times}...`)
    if (id) {
      const result = await feathersClient.service(service).get(id)
      if (statusesToWatch.includes(result.status)) {

        console.log(`- received status ${result.status}`)
        onSuccess(result.status)

        if (statusesToWatch.length > 1 && result.status === statusesToWatch[0]) {
          pollForStatus(id, [statusesToWatch[1]], { interval, times: times - 1, service, onSuccess })
        }
      } else if (times > 0) {
        pollForStatus(id, statusesToWatch, { interval, times: times - 1, service, onSuccess })
      }
    }
  }, interval)
}
