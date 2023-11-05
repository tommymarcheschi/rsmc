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
  <div class="modal-box p-10 border border-white bg-black rounded-none items-center border-box font-incon flex flex-col w-full z-[100]">
    <h3 class="font-bold text-lg">Bid</h3>
    <p class="py-4">Place deposit to confirm bid.</p>
          <button class="link {selectedPaymentMethod === 'BTC' ? 'no-underline' : ''}" 
    on:click={() => selectedPaymentMethod = 'BTC'}>Bitcoin</button> or <button class="link {selectedPaymentMethod === 'BTC-LightningNetwork' ? 'no-underline' : ''}" on:click={() => selectedPaymentMethod = 'BTC-LightningNetwork'}>Lightning</button>:
    <BidQR paymentMethod={selectedPaymentMethod} />
  </div>
  <form method="dialog" class="modal-backdrop">
    <button on:click={close}>close</button>
  </form>
</dialog>
{/if}
