<script>
  import BidQR from '$lib/components/BidInoivceQr.svelte';

  let selectedPaymentMethod = 'BTC'; // Default to BTC

  export let showModal = false;
  function close() {
    showModal = false;
  }
</script>

{#if showModal}
<dialog open class="modal">
  <div class="modal-box w-full md:max-w-xl p-10 border-2 border-black bg-black rounded-none items-center border-box font-incon flex flex-col z-[100] ">
    <h3 class="font-bold antialiased md:text-lg text-white font-rocks">$auctionItem.title</h3>
    <h2 class=" text-2xl md:text-4xl text-btcorange pt-4 font-anon whitespace-nowrap">Bid $bid.bid_amount sats</h2>
    <p class="pb-2 font-bold font-anon">$dollaramount</p>
    <p class="pt-4 pb-4 font-bold font-incon text-white">Place 1% deposit to confirm bid.</p>

  <div class="text-white font-incon subpixel-antialiased text-center">
    Pay with 
    <button class="link {selectedPaymentMethod === 'BTC' ? 'no-underline' : ''}" 
    on:click={() => selectedPaymentMethod = 'BTC'}>Bitcoin</button>
    /
    <button class="link {selectedPaymentMethod === 'BTC-LightningNetwork' ? 'no-underline' : ''}" on:click={() => selectedPaymentMethod = 'BTC-LightningNetwork'}>Lightning</button>:
    <BidQR paymentMethod={selectedPaymentMethod} /> 

    <div class="font-incon text-white py-6 text-sm md:text-base">
      By placing a bid you agree to our <a href="/tos" class="link hover:no-underline">terms</a>.
    </div>
  </div>
  <form method="dialog" class="text-white font-incon">
    <button class="link hover:no-underline" on:click={close}>cancel bid</button>
  </form>
</div>
  <form method="dialog" class="modal-backdrop">
    <button on:click={close}>close</button>
  </form>
</dialog>
{/if}


<style>
  .modal-backdrop {

    backdrop-filter: saturate(0) blur(8px);

  }
</style>