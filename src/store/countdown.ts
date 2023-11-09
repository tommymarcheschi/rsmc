import { writable } from 'svelte/store'
// import { TARGET_DATE } from '$lib/config'

const startDate = "November 9, 2023 17:20:00 EST"
const endDate = "November 11, 2023 17:20:00 EST"

// !TESTING VALUES:
// const startDate = "November 9, 2023 13:20:00 EST"
// const endDate = "November 9, 2023 13:25:00 EST"

const startTimestamp = new Date(startDate).getTime()
const endTimestamp = new Date(endDate).getTime()

export const targetDate = writable('')

export const isPublishActivated = writable(false)
export const isAuctionFinished = writable(false)

let interval: number | undefined
function startTimer() {
  const now = Date.now()
  if (now < endTimestamp) {
    interval = setInterval(checkTime, 1000)
  } else {
    checkTime()
  }
}

function checkTime() {
  console.log(`[checkTime]`)
  const now = Date.now()
  if (now < startTimestamp) {
    isPublishActivated.set(false)
    isAuctionFinished.set(false)
    targetDate.set(startDate)

  } else if (now < endTimestamp) {
    isPublishActivated.set(true)
    isAuctionFinished.set(false)
    targetDate.set(endDate)

  } else if (now > endTimestamp) {
    isPublishActivated.set(false)
    isAuctionFinished.set(true)
    targetDate.set('')
    clearInterval(interval)
  }
}

startTimer()

