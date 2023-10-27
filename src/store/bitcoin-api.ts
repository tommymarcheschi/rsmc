// Updated API endpoints
const blockHeightApi = 'https://mempool.space/api/blocks/tip/height';
const bitcoinPriceApi = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';

export async function fetchBitcoinData() {
  // Fetch block height
  const blockHeightResponse = await fetch(blockHeightApi);
  const blockHeight = await blockHeightResponse.text();

  // Fetch Bitcoin price from Kraken
  const priceResponse = await fetch(bitcoinPriceApi);
  const priceData = await priceResponse.json();
  const priceUsd = parseInt(priceData.result.XXBTZUSD.a[0], 10); // Parse the price to an integer

  return {
    blockHeight: parseInt(blockHeight, 10),
    priceUsd: priceUsd,
  };
}
