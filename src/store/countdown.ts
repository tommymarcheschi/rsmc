import { writable } from 'svelte/store'
// import { TARGET_DATE } from '$lib/config'

export const isPublishActivated = writable(true)

// const now = new Date().getTime();
// const distance = TARGET_DATE - now;
// if (distance < 0) {
//   isPublishActivated.set(true)
// }
