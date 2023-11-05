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
  <div class="modal-box p-10 border border-black bg-black rounded-none items-center border-box font-incon flex flex-col w-full z-[100] ">
    <h3 class="font-bold antialiased text-lg text-white">$auctionItem.title</h3>
    <h2 class=" text-xl md:text-3xl text-btcorange pt-4">Bid $bid.bid_amount</h2>
    <p class="pb-2 font-bold font-anon">$dollaramount</p>
    <p class="pt-4 pb-2 font-bold font-anon text-white">Place 1% deposit to confirm bid.</p>

  <div class="text-white subpixel-antialiased">Pay with <button class="link {selectedPaymentMethod === 'BTC' ? 'no-underline' : ''}" 
    on:click={() => selectedPaymentMethod = 'BTC'}>Bitcoin</button>/<button class="link {selectedPaymentMethod === 'BTC-LightningNetwork' ? 'no-underline' : ''}" on:click={() => selectedPaymentMethod = 'BTC-LightningNetwork'}>Lightning</button>:
    <BidQR paymentMethod={selectedPaymentMethod} />
  </div>
</div>
  <form method="dialog" class="modal-backdrop">
    <button on:click={close}>close</button>
  </form>
</dialog>
{/if}
