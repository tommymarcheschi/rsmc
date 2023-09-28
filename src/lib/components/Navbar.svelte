<script>
  import typelogo from "$lib/images/RSMC-logo-text.svg"
  import { blockHeight, bitcoinPrice } from "../../store/bitcoin"
</script>



<div class="navbar flex bg-black fixed top-0 justify-between z-40 bottom-auto ">
  <div class="flex-initial h-auto w-auto m-2 mb-4 grid grid-flow-col gap-4 bottom-auto">
    <a href="/" class="link"><img src="{typelogo}" alt="logotype" class="w-20 mx-10" /></a>
    <h2 class="font-bahiana text-3xl text-orange-500 ">Block #{ $blockHeight || 'Loading...' } </h2>
    <h2 class="font-bahiana text-3xl text-green-600">1 BTC: ${ $bitcoinPrice ? `${$bitcoinPrice.toFixed(2)}` : 'Loading...' } </h2>
  </div>

  <div class="flex-initial m-2 mb-4 w-auto right-0 bottom-auto">
    <ul class="menu-horizontal font-rocks text-white text-xl rounded-none tracking-widest m-2">
      <li><a href="/about" class="hover:text-orange-400 mx-4 px-1 ">About</a></li>
      <li><a href="/contact" class="hover:text-orange-400 mx-4 px-1 ">Contact</a></li>
      <li><a href="/donate" class="hover:text-orange-400 mx-4 px-1 ">Donate</a></li>
      <li><a href="/store" class="hover:text-orange-400 mx-4 px-1 ">Store</a></li>
    </ul>
  </div>
</div>