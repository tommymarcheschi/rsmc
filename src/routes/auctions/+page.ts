import { error } from '@sveltejs/kit'
import fixture from './fixture.json'

const API_URL = 'https://rsmc-apis-735bc316de10.herokuapp.com'
const AUTH_TOKEN = '40d297961fd17c0d8eab41c5413d754b293ca87ec06aa29d1d96256c398883b7'
// const API_URL = 'http://localhost:3030'

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {

  console.log(`[auctions/+page.ts load()] fetching...`)

  try {
    const response = await fetch(`${API_URL}/auction-items`, {
      headers: {
        Authorization: `Token ${AUTH_TOKEN}`
      }
    })

    console.log(`response.status:`, response.status)
    if (response.status >= 500) {
      return {
        error: true,
        statusCode: response.status,
      }
    }

    const json = await response.json()
    console.log(`response json:`, json)
    if (json.code >= 300) {
      return {
        ...json,
        isError: true
      }
    }

    return json  
  } catch(e) {
    console.log(`Error:`, e)
  }
  return fixture
}
