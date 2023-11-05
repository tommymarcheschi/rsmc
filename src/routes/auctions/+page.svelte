<script lang="ts">
  /** @type {import('./$types').PageData} */
  export let data: any

  console.log(`data::`, data)
</script>

<div class="flex flex-col items-center justify-center">

  <div class="flex flex-col mt-32 text-left w-4/5"> 
    <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">LIVE AUCTIONS!</h1>
    <span class="flex flex-col font-incon text-white text-sm mb-4">Join our waitlist to get an email notification each time we have an auction.</span>
  </div>

  {#if data?.isError}
    <div class="error">Sorry, an error occured [{data.code}: {data.message}]</div>

  {:else if data?.data}

    <div class="flex flex-row items-start justify-start w-3/5 md:w-2/5 lg:w-1/5 mt-2 text-left">

      <div class="justify-start items-start mb-10 mt-8">
        {#each data?.data as item}

          <div class="border-2 border-white p-2 w-auto flex-1">
            <a href="/auctions/{item.slug}">

            <img src="/auction/{item.slug}/main.jpeg" alt={item.title} class="w-full object-contain mx-auto" />
            </a>
            
            <div class="font-anon text-white text-center break-words text-base md:text-lg">{item.meta.artist} <br></div>

            <div class="font-anon text-white text-center text-lg md:text-xl italic break-words font-bold">{item.title}<br></div>
            <a href="/auctions/{item.slug}" class="btn hover:bg-btcorange w-full bg-white text-black font-anon text-lg md:text-2xl rounded-none mt-4 uppercase">Bid now</a>
          </div>
        {/each}
      </div>
    </div>

  {:else}
    <div class="error">Sorry, something went wrong. Please try again later</div>

  {/if}    
</div>
