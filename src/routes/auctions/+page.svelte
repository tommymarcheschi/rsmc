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

  <div class="flex flex-row gap-10 justify-start">
    {#each data?.data as item}
      <div class="">
        <img src="/auction/{item.slug}/main.jpeg" alt={item.title} class="w-64" />

        <div class="">{item.title}</div>

        <a href="/auctions/{item.slug}" class="btn btn-primary mt-4">BID Now</a>
      </div>
    {/each}
  </div>
</div>
