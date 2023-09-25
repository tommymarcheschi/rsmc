<script>
  import typelogo from "$lib/images/RSMC-logo-text.svg"
  import { blockHeight, bitcoinPrice } from "../../store/bitcoin"
</script>



<div class="navbar bg-transparent flex fixed top-0 justify-between z-40">
  <div class="flex-initial h-auto w-auto m-2 mb-4 grid grid-flow-col gap-4">
    <a href="/" class="link"><img src="{typelogo}" alt="logotype" class="w-20 mx-10" /></a>
    <h2 class="font-rocks text-2xl text-orange-500 ">Block #{ $blockHeight || 'Loading...' } </h2>
    <h2 class="font-rocks text-2xl text-green-600">1 BTC: ${ $bitcoinPrice ? `${$bitcoinPrice.toFixed(2)}` : 'Loading...' } </h2>
  </div>

  <div class="flex-initial m-2 mb-4 w-auto right-0">
    <ul class="menu menu-horizontal px-1 font-rocks text-white text-xl tracking-widest">
      <li><a href="/about">About</a></li>
      <li><a href="/contact">Contact</a></li>
      <li><a href="/donate">Donate</a></li>
      <li><a href="/store">Store</a></li>
    </ul>
  </div>
</div>