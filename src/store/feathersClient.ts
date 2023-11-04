/**
 * This is Feathers client to work with viewport-api which is a FeathersJS app.
 * It could use either REST or websocket transport.
 */
import { feathers } from '@feathersjs/feathers'
import rest from '@feathersjs/rest-client'
import { browser } from '$app/environment'

const FEATHERS_API_URL = import.meta.env.VITE_FEATHERS_API_URL || 'none'
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN_UI || 'none'

console.log(`Feathers Client:`)
console.log(`- FEATHERS_API_URL=${FEATHERS_API_URL.substr(0, 15)}`)
console.log(`- AUTH_TOKEN=${AUTH_TOKEN.substr(0, 5)}`)

export const feathersClient = feathers()

const restClient = rest(FEATHERS_API_URL)

// Configure an AJAX library with the client
// if (browser || true) {
  const customFetch = (url, options) => {
    options.headers = {
      ...options.headers,
      'X-Requested-With': 'RSMC-Frontend',
      'Authorization': `Token ${AUTH_TOKEN}`
    };
    return fetch(url, options);
  }
  feathersClient.configure(restClient.fetch(customFetch))

  // feathersClient.configure(restClient.fetch(window.fetch.bind(window)))
// } else {
//   feathersClient.configure(restClient.fetch(fetch))
// }

// Connect to the `http://feathers-api.com/messages` service
// const messages = feathersClient.service('messages')
