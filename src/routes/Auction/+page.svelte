<script>
  import AuctionBox from "$lib/components/AuctionBox.svelte"
  import AuctionImageGrid from "$lib/components/AuctionImageGrid.svelte"
	import Footer from "$lib/components/Footer.svelte";

</script>


<div class="flex flex-col items-center justify-center">

  <div class="flex flex-col mt-32 text-left w-4/5"> 
    <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">End Fiat! Auction</h1>
    <span class="flex flex-col font-incon text-white text-sm mb-4">See rules and details below. This auction uses BITCOIN-ONLY and a deposit may be required to place bids.</span>
  </div>
  
  <div class="flex flex-col items-center justify-center w-3/5 mt-2">

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-7 md:mt-14 mb-10 z-20">
      <div id="auction" class="order-2 md:order-1">
    <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Artist:</h3>
    <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon">Tommy Marcheschi<br><br> </p>
    <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Artwork:</h3>
    <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon italic font-bold uppercase">End Fiat! <br> (BEFORE FIAT ENDS US)<br><br> </p>

    <div class="grid grid-cols-2 grid-flow-row">
      <div>
        <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Year:</h3>
        <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">2023<br><br> </p>
      </div>
     <div>
        <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Media:</h3>
        <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">Mixed media on canvas<br><br> </p>
      </div>
     <div>
        <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Dimensions:</h3>
        <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">24 in. × 36 in.<br><br> </p>
      </div>
     <div>
        <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Primary Sale:</h3>
        <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">Yes<br><br> </p>
      </div>
    </div>
    <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Token:</h3>
    <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon"><a href="https://xchain.io/asset/ENDFIAT" target="_blank" class="link text-orange-400 hover:no-underline"> ENDFIAT </a><br><br> </p>
    
    <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">Description:</h3>
    <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mt-5 font-anon h-64 break-words overflow-y-auto -webkit-overflow-scrolling: touch;">We find ourselves at the brink of war that we all agree could be our last. While the talking heads in the U.S. Corporation Federal Gov't stoke conflict in Europe, Tommy imagines an easy way out. <strong> FIAT! BEFORE IT ENDS US. </strong><br><br>

    This is the latest painting in the Bitcoin War Bonds collection.<br><br>

    Started as a live painting at the second-annual HODLween in Charlotte, NC on October 21, 2023 and finished days later at block height #813659.<br><br>

    Painted using mixed media such as spray paints, gouache, solid oil sticks, oil pastel sticks, acrylic paint markers, and Sign Painters' ONESHOT® (the same yellow and red from the original BITCOIN WAR BONDS painting).<br><br>

    Signed on verso.<br><br>

    Includes Coinkite® Satschip affixed to the back of the canvas holding ENDFIAT, the 1/1 edition Counterparty token referencing on-chain image of the painting (Ordinals). Satschip PIN will be transferred to the buyer.<br><br>

    Also includes official Bitcoin War Bonds paper COA.<br><br>

    Ordinal inscription NOT INCLUDED, only the original painting and ENDFIAT token are included in this auction.<br><br>

    This painting is unframed.<br><br>

    Buyer pays shipping from Nashville, TN, USA.<br><br> </p>


         <AuctionBox />
  </div>


  <div class="order-1 md:order-2">
     <AuctionImageGrid />
  </div>

</div>

  </div>


</div>





