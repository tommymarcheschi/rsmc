<script lang="ts">
  import BidQR from '$lib/components/BidInoivceQr.svelte';
  import { bitcoinPrice } from "../../store/bitcoin";
  import { bidStatus } from '../../store/auction-store';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

  export let auctionItem = {}
  export let amountSats = 0
  export let showModal = false;
  export let paymentMethods = []

  $: amount = Math.round(Number(amountSats) / 100)

  let selectedPaymentMethod = 'BTC-LightningNetwork'; // Default to Lightning
  
  $: paymentProcessing = $bidStatus === 'PAYMENT_PROCESSING'
  $: paymentReceived = $bidStatus === 'PAYMENT_RECEIVED'

  $: paymentLink = paymentByMethod(selectedPaymentMethod)?.paymentLink || ''


  $: dollarPrice = $bitcoinPrice / 1e8 * amountSats;
  $: dollarPriceFormatted = dollarPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  function close() {
    showModal = false;
    dispatch('close')
  }
  function paymentByMethod(value: string) {
    return paymentMethods?.find(m => m.paymentMethod === value)
  }

  // Add a function to simulate a successful payment
  function simulatePayment() {
    paymentProcessing = true;
    // Simulate delay for payment processing
    setTimeout(() => {
      paymentProcessing = false;
      paymentReceived = true;
    }, 3000);
  }
</script>

{#if showModal}
<dialog open class="modal">
  <div class="modal-box w-full md:max-w-xl px-5 py-2 md:px-10 md:py-4 border-2 border-black bg-black rounded-none items-center border-box font-incon flex flex-col z-[100] ">
    <h3 class="font-bold antialiased md:text-lg text-white font-rocks">{auctionItem.title}</h3>
    <h2 class=" text-2xl md:text-4xl text-btcorange pt-4 font-anon whitespace-nowrap">Bid {Number(amountSats).toLocaleString()} sats!</h2>
    <p class="pb-2 font-bold font-anon">{dollarPriceFormatted} $</p>
    <p class="pt-4  font-bold font-incon text-white">Place 1% deposit to confirm bid.</p>
    <p class="text-sm md:text-base font-bold pb-4 font-incon text-white">
      ({amount.toLocaleString()} sats)
    </p>

  <div class="text-white font-incon subpixel-antialiased text-center">
    {#if !paymentReceived && !paymentProcessing}
      Pay with 
      <button class="link {selectedPaymentMethod === 'BTC' ? 'no-underline font-bold' : ''}" 
      on:click={() => selectedPaymentMethod = 'BTC'}>Bitcoin</button>
      /
      <button class="link {selectedPaymentMethod === 'BTC-LightningNetwork' ? 'no-underline font-bold' : ''}" on:click={() => selectedPaymentMethod = 'BTC-LightningNetwork'}>Lightning</button>:
    {/if}

    {#if paymentProcessing}
      <p class="text-center font-rocks text-3xl md:text-6xl mt-5 md:mt-10 ">
        processing<span class="loading loading-dots loading-sm md:loading-md align-bottom"></span>
      </p>
      <p class="md:text-sm text-xs text-center font-incon mb-5 md:mb-10 "> (waiting for confirmation) </p>
    {:else if paymentReceived}

      <p class="text-center font-rocks text-3xl md:text-6xl my-5 md:my-10 underline">Payment Received!</p>

    {:else}

      <BidQR {paymentLink} /> 

    {/if}

    <div class="font-incon text-white pt-4 pb-1 text-sm md:text-base">
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
