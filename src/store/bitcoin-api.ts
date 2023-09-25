const bitcoinStatsApi = 'https://data.messari.io/api/v1/assets/bitcoin/metrics';

export async function fetchBitcoinData() {
  const response = await fetch(bitcoinStatsApi);
  const data = await response.json();
  return {
    blockHeight: data.data.on_chain_data.block_height,
    priceUsd: data.data.market_data.price_usd,
  };
}
