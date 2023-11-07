<script lang="ts">
  import Countdown from '$lib/components/Countdown.svelte';
  import BidInvoiceModal from '$lib/components/BidInvoiceModal.svelte';
	import { formatSats, isEmail } from '$lib/utils';
	import { createBid, pinHash, verifyEmail } from '../../store/auction-store';
  import { bitcoinPrice } from "../../store/bitcoin";
  import arrowUp from '$lib/images/RSMC-upArrow.svg?raw';
  import arrowDown from '$lib/images/RSMC-downArrow.svg?raw';
  import fixturePaymentMethods from './fixture-payment-methods.json'

	export let bids = []
	export let auctionItem = {}

	let minBid = 100000
	let showPinInput = false

	let displayName = ''
	let email = ''
	let amountSats = minBid // default to minBid
  let pinValue = ''

	// let invoice = 'bitcoin:bc1qrsmca2c8xxnl5f0ddsddeekcysn77069885cgm'
  let paymentMethods: any = null // fixturePaymentMethods.data
	let showModal = false

	let isProcessing = false
	let error = ''
	let successMessage = ''

	$: highestBid = bids?.[0] || {}

  async function onBidClick() {
    // showModal = !showModal
    // return ''

    paymentMethods = null
    error = ''
    successMessage = ''
    if (displayName?.length > 2 && isEmail(email) && Number(amountSats) >= minBid) {
      // Send email for verification
      const result = await verifyEmail(email)
      if (result === true) {
        // Show PIN input
        showPinInput = true
      }
    }
  }

  async function letsCreateBid() {
    // Save pin
    pinHash.update(obj => ({
      ...obj,
      pin: pinValue
    }))

    if (displayName?.length > 2 && isEmail(email) && Number(amountSats) >= minBid && pinValue.length === 4) {
      isProcessing = true
      const result = await createBid({ displayName, email, amountSats })
      console.log(`result`, result)

      if (result?.isError) {
        error = result.message

        // Emulate success response with invoice ({ payment_link })
      } else {
        // successMessage = 'BID has been created!'
        // invoice = result?.payment_link
        paymentMethods = result?.payment_methods.data
        showModal = true
      }
      isProcessing = false
    } else {
      console.log('not enough data', displayName, email, amountSats)
    }
  }

	$: dollarPrice = $bitcoinPrice / 1e8 * (highestBid && highestBid.bid_amount ? highestBid.bid_amount : 0);
  $: dollarPriceFormatted = dollarPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

   function increaseAmount() {
       if (amountSats < 10000000) {
           amountSats += 100000;
       } else if (amountSats < 50000000) {
           amountSats += 500000;
       } else {
           amountSats += 1000000;
       }
   }

   function decreaseAmount() {
       if (amountSats > 100000) {
           amountSats -= 100000;
       }
   }
</script>
<div class="rounded-none bg-black flex flex-col mt-6 w-full">
	<div class="m-2">
		<h3 class="text-center text-xl text-btcorange"> Current bid: </h3>
		<p class="text-center text-lg font-anon text-white">{highestBid.nickname}</p>
		<h2 class="text-center text-2xl font-anon text-white leading-10"> {formatSats(highestBid.bid_amount)} SAT </h2>
		<p class="text-center text-lg font-anon">  { dollarPrice ? `${dollarPriceFormatted}` : '0' } $
 </p>
	</div>
	<div class="m-2">
		<h3 class="text-center text-xl text-btcorange"> Auction starting: </h3>
		<h2 class="text-center text-2xl font-anon text-white"> <Countdown /> </h2>
	</div>	
	
	<p class="text-center text-sm font-anon break-words px-2">new bids in the final minutes add 5min to the auction timer</p>

	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">display name:</span>
		</label>
		<input type="text" placeholder="Satoshi" class="input placeholder:font-anon bg-white text-black font-anon focus:caret-btcorange focus:border-2 focus:border-btcorange rounded-none w-full" 
				bind:value={displayName} />
	</div>

	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">email address:</span>
		</label>
		<input type="text" placeholder="satoshi@rsmc.com" class="input bg-white text-black font-anon focus:caret-btcorange focus:border-2 focus:border-btcorange rounded-none w-full"
				bind:value={email} />
	</div>
	
	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">bid:</span>
		</label>
		
		<div class="join join-horizontal w-full rounded-none flex-row">
       <input type="text" placeholder="100.000 sats" class="input bg-white text-black font-anon border-2 border-black focus:caret-btcorange focus:border-2 focus:border-btcorange rounded-none w-full flex"
           bind:value={amountSats} />
       <button class="rounded-none border-2 border-black bg-white join-item focus:border-2 focus:border-btcorange"
           on:click={() => increaseAmount()}>
           <div class="p-1 w-8 text-white bg-transparent"> {@html arrowUp} </div>
       </button>
       <button class="rounded-none border-2 border-black bg-white join-item focus:border-2 focus:border-btcorange"
           on:click={() => decreaseAmount()}>
           <div class="p-1 w-8 text-white bg-transparent"> {@html arrowDown} </div>
       </button>
   </div>

		<button 
			class="btn _btn-disabled cursor-not-allowed bg-btcorange border-1 border-btcorange rounded-none text-white w-full my-2"
			on:click={onBidClick}
		>
			{#if isProcessing}
				<span class="loading loading-dots loading-md"></span>
			{:else}
				Bid soon!
			{/if}
		</button>

		{#if error}
			<div class="my-4 text-error">{error}</div>
		{/if}

		{#if successMessage}
			<div class="my-4 text-success">{successMessage}</div>
		{/if}

		<!-- {#if invoice}
			<div class="my-4">Please pay this invoice: {invoice}</div>
		{/if} -->

    {#if paymentMethods?.length}
      <BidInvoiceModal bind:showModal {auctionItem} {amountSats} {paymentMethods} /> 
    {/if}

	</div>

  {#if showPinInput && !paymentMethods}
    <div class="px-2 text-sm font-anon">Please check your email for PIN</div>
    <div class="form-control p-2 flex-row w-full space-x-1 justify-end flex-wrap">
      <label class="label">
        <span class="label-text text-white font-anon text-xs md:text-sm whitespace-nowrap">Enter your PIN:</span>
      </label>
      <div class="join join-horizontal rounded-none border-2 border-btcorange flex ">
        <input class="input bg-black text-white font-anon focus:caret-btcorange focus:border-1 focus:border-btcorange rounded-none input-md w-full join-item "
          bind:value={pinValue} type="text" placeholder="PIN" />
        <button on:click={letsCreateBid} class="btn bg-btcorange join-item rounded-none text-black font-anon"> > </button>
      </div>
    </div>
  {/if}

  <p class="text-center text-sm font-anon break-words px-2 mt-4">*by submitting a bid you agree to our <a href="/tos" class="link text-btcorange font-anon text-xs md:text-sm hover:no-underline">terms</a>.</p>

</div>

