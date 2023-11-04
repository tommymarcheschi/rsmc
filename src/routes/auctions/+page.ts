// import { error } from '@sveltejs/kit'
// import fixture from './fixture.json'
// import { API_URL, AUTH_TOKEN } from '$lib/config' 
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

  // try {
  //   const response = await fetch(`${API_URL}/auction-items`, {
  //     headers: {
  //       Authorization: `Token ${AUTH_TOKEN}`
  //     }
  //   })

  //   console.log(`response.status:`, response.status)
  //   if (response.status >= 500) {
  //     return {
  //       error: true,
  //       statusCode: response.status,
  //     }
  //   }

  //   const json = await response.json()
  //   console.log(`response json:`, json)
  //   if (json.code >= 300) {
  //     return {
  //       ...json,
  //       isError: true
  //     }
  //   }

  //   return json  
  // } catch(e) {
  //   console.log(`Error:`, e)
  // }
  // return fixture
}
