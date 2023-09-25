import { writable } from 'svelte/store';

export const bitcoinBlockHeight = writable(0);
export const bitcoinPrice = writable(0);

// Fetch data and update the store values here.

