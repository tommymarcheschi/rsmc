<script lang="ts">
  /** @type {import('./$types').PageData} */

  import AuctionImageGrid from "$lib/components/AuctionImageGrid.svelte"
  import AuctionBox from "$lib/components/AuctionBox.svelte"
	import Countdown from "$lib/components/Countdown.svelte";
	import { onDestroy, onMount } from "svelte";
	import { currentAuctionItem, currentBids, loadBids } from "../../../store/auction-store";
	import { formatDate, formatSats } from "$lib/utils";
  import BidModal from '$lib/components/BidInvoiceModal.svelte';
  import socialx from "$lib/images/RSMC-X.svg"
  import socialnostr from "$lib/images/RSMC-nostr.svg"
  import socialwebsite from "$lib/images/RSMC-website.svg"


  export let data: any
  let showModal = false;
  console.log(`data::`, data)

  $: bids = $currentBids?.length > 0 ? $currentBids : data?.bids || []

  $: auctionItem = data.auctionItem || {}
  $: slug = auctionItem?.slug
  $: meta = auctionItem?.meta
  $: images = [
    { id: 1, src: `/auction/${slug}/main.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 2, src: `/auction/${slug}/main2.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 3, src: `/auction/${slug}/detail.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 4, src: `/auction/${slug}/detail2.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 5, src: `/auction/${slug}/detail3.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 6, src: `/auction/${slug}/detail4.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
    { id: 7, src: `/auction/${slug}/detail5.jpeg`, alt: `${meta.artist}: ${auctionItem.title}` },
  ]

  let interval: number | undefined
  onMount(() => {
    currentAuctionItem.set(data.auctionItem)
    interval = setInterval(loadBids, 30000)
  })
  onDestroy(() => {
    clearInterval(interval)
  })

  function formatDesc(txt: string) {
    return txt.replaceAll('\n', '<br><br>')
  }
</script>

<div class="flex flex-col items-center justify-center">
  {#if data}
    <div class="flex flex-col mt-32 text-left w-4/5"> 
      <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">
        AUCTION Delayed
      </h1>
      <span class="flex flex-col font-incon text-white text-sm mb-4">
        See rules and details below. This auction uses BITCOIN-ONLY and a deposit may be required to place bids.
      </span>
    </div>
    

    <div class="flex flex-col items-center justify-center w-4/5 md:w-3/5 lg:w-3/5 mt-2">
       <button on:click={() => showModal = true} class="btn btn-squareflex items-center bg-white"></button>
       <BidModal bind:showModal={showModal} /> 

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-7 md:mt-14 mb-10 z-20">
        <div id="auction" class="order-2 md:order-1">
          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Artist:
          </h3>

          <div class="flex ">
            <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon">
            {meta.artist} <br><br> 
            </p>
            <div class="flex flex-row md:py-1 pl-4 space-x-2 ">
            <a href="https://tommy.studio" target="_blank" ><img src="{socialwebsite}" class="w-6 items-baseline align-bottom" alt="tommy.studio"></a>
            <a href="https://twitter.com/yungguccit" target="_blank" ><img src="{socialx}" class="w-6" alt="x.com"></a>
            <a href="https://iris.to/npub15uql845ve3vkl7pnm7p5342qyxq9f0j85xvkxc7waepxxwe0tn6ssr6hfz" target="_blank" ><img src="{socialnostr}" class="w-6" alt="nostr"></a>
          </div>
          </div>
          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Artwork:
          </h3>
          <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon italic font-bold uppercase">
            {auctionItem.title}<br><br> 
          </p>

          <div class="grid grid-cols-2 grid-flow-row">
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Year:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {meta.year}<br><br>
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Medium:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {meta.medium}<br><br> 
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Dimensions:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {meta.dimensions}.<br><br>
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Primary Sale:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {#if meta.primary_sale}
                  Yes
                {:else}
                  No
                {/if}
                <br><br> 
              </p>
            </div>
          </div>

          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Token:
          </h3>
          <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
            <a href={meta.token.link} target="_blank" class="link text-orange-400 hover:no-underline">
              {meta.token.name}
            </a><br><br> 
          </p>

          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Description:
          </h3>
          <p class="description text-base md:text-base text-white text-left leading-6 tracking-normal mt-5 font-anon h-64 break-words overflow-y-auto -webkit-overflow-scrolling: touch;">
            {@html formatDesc(meta.description)}
          </p>

          <AuctionBox {bids} {auctionItem} />
        </div>

        <div class="order-1 md:order-2">
          <AuctionImageGrid {images} />
        </div>
      </div>

      <div class="w-full">
        <h2 class="text-white font-bahiana text-5xl text-center  mt-10 mb-4"> BIDDING HISTORY ({bids.length} total bids): </h2>

        {#each bids as bid}
          <div class="bg-white rounded-none text-black font-anon flex-row flex justify-between my-2 p-2 px-4">
            <p> {bid.nickname} </p>
            <p> {formatSats(bid.bid_amount)} {bid.status !== 'PAYMENT_RECEIVED' ? '(PENDING)' : ''}</p>
            <p> {formatDate(bid.createdAt)} </p>
          </div>
        {/each}

      </div>
    </div>

  {/if}


</div>
