import { get, writable, derived } from 'svelte/store'
import { feathersClient } from './feathersClient'
// import { TARGET_DATE } from '$lib/config'

const startDate = "November 9, 2023 17:20:00 EST"
// const endDate = "November 11, 2023 17:20:00 EST"

export const endDate = writable('November 11, 2023 17:20:00 EST')
const endTimestamp = derived(endDate, ($endDate) => new Date($endDate).getTime());

// !TESTING VALUES:
// const startDate = "November 9, 2023 13:20:00 EST"
// const endDate = "November 9, 2023 13:25:00 EST"

const startTimestamp = new Date(startDate).getTime()
// const endTimestamp = new Date(endDate).getTime()

export const targetDate = writable('')

export const isPublishActivated = writable(false)
export const isAuctionFinished = writable(false)

async function getEndDate() {
  const auctionItem = await feathersClient.service('auction-items').get(1)
  endDate.set(auctionItem.endDate)
  console.log(`- new auctionItem.endDate: ${auctionItem.endDate}`)
}
getEndDate()
setInterval(getEndDate, 10000)

let interval: number | undefined
async function startTimer() {
  const now = Date.now()
  if (now < get(endTimestamp)) {
    interval = setInterval(checkTime, 1000)
  } else {
    checkTime()
  }
}

function checkTime() {
  const now = Date.now()
  if (now < startTimestamp) {
    isPublishActivated.set(false)
    isAuctionFinished.set(false)
    targetDate.set(startDate)

  } else if (now < get(endTimestamp)) {
    isPublishActivated.set(true)
    isAuctionFinished.set(false)
    targetDate.set(get(endDate))

  } else if (now > get(endTimestamp)) {
    isPublishActivated.set(false)
    isAuctionFinished.set(true)
    targetDate.set('')
    clearInterval(interval)
  }
}

startTimer()

