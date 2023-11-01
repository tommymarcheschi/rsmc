<script lang="ts">
  /** @type {import('./$types').PageData} */

  import AuctionImageGrid from "$lib/components/AuctionImageGrid.svelte"
  
  export let data: any

  console.log(`data::`, data)

  $: images = [
    { id: 1, src: `/auction/${data.slug}/main.jpeg`, alt: `${data.meta.artist}: ${data.title}` },
  ]
</script>

<div class="flex flex-col items-center justify-center">
  {#if data}
    <div class="flex flex-col mt-32 text-left w-4/5"> 
      <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">
        AUCTION LIVE NOW!
      </h1>
      <span class="flex flex-col font-incon text-white text-sm mb-4">
        See rules and details below. This auction uses BITCOIN-ONLY and a deposit may be required to place bids.
      </span>
    </div>
    
    <div class="flex flex-col items-center justify-center w-3/5 mt-2">

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-7 md:mt-14 mb-10 z-20">
        <div id="auction" class="order-2 md:order-1">
          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Artist:
          </h3>
          <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon">
            {data.meta.artist}<br><br> 
          </p>
          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Artwork:
          </h3>
          <p class="text-lg md:text-2xl text-white text-left leading-6 tracking-normal mb-0 font-anon italic font-bold uppercase">
            {data.title}<br><br> 
          </p>

          <div class="grid grid-cols-2 grid-flow-row">
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Year:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {data.meta.year}<br><br>
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Medium:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {data.meta.medium}<br><br> 
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Dimensions:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {data.meta.dimensions}.<br><br>
              </p>
            </div>
            <div>
              <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
                Primary Sale:
              </h3>
              <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mb-0 font-anon">
                {#if data.meta.primary_sale}
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
            <a href={data.meta.token.link} target="_blank" class="link text-orange-400 hover:no-underline">
              {data.meta.token.name}
            </a><br><br> 
          </p>

          <h3 class="text-sm md:text-base tracking-wider leading-4 py-1 mb-0 uppercase rounded-none font-anon">
            Description:
          </h3>
          <p class="text-base md:text-base text-white text-left leading-6 tracking-normal mt-5 font-anon h-64 break-words overflow-y-auto -webkit-overflow-scrolling: touch;">
            {data.meta.description}
          </p>
          
        </div>

        <div class="order-1 md:order-2">
          <AuctionImageGrid {images} />
        </div>

      </div>

    </div>

  {/if}
</div>
