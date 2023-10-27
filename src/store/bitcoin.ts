import { writable } from 'svelte/store';
import { fetchBitcoinData } from './bitcoin-api';

export const blockHeight = writable(null);
export const bitcoinPrice = writable(null);

async function init() {
  try {
    const { blockHeight: height, priceUsd: price } = await fetchBitcoinData();
    blockHeight.set(height);
    bitcoinPrice.set(price);
  } catch (error) {
    console.error("Error fetching Bitcoin data:", error);
  }
}

init();
