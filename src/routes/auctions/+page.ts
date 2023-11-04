// import { error } from '@sveltejs/kit'
// import fixture from './fixture.json'
import { feathersClient } from '../../store/feathersClient'

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
  console.log(`[auctions/+page.ts load()] fetching...`)

  try {
    const response = await feathersClient.service('auction-items').find({
      query: {
        $limit: 10,
      }
    })
    console.log(`\n>>>feathers client response`, response)
    return response
  } catch(e: any){
    console.log(`Error page load:`, e)
    return {
      isError: true,
      message: e.message,
      code: e.code
    }
  }
}
