// import { error } from '@sveltejs/kit'
import fixture from './fixture.json'

const API_URL = 'https://rsmc-apis-735bc316de10.herokuapp.com'

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {

  console.log(`[+page.ts load()] fetching...`)

  try {
    const response = await fetch(`${API_URL}/auction-items`).then(
      (response) => response.json()
    )
    const { data } = response
    console.log(`response data:`, data)
    return data
  
  } catch(e) {
    console.log(`Error:`, e)
    return fixture
  }
}