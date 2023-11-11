<script lang="ts">
  import Countdown from '$lib/components/Countdown.svelte';
  import BidInvoiceModal from '$lib/components/BidInvoiceModal.svelte';
  import Reserve from '$lib/components/AuctionReserve.svelte';
	import { formatSats, isEmail } from '$lib/utils';
	import { bidStatus, createBid, currentDisplayName, currentEmail, loadBids, pinHash, pollBidStatus, verifyEmail } from '../../store/auction-store';
  import { bitcoinPrice } from "../../store/bitcoin";
  import { isPublishActivated, isAuctionFinished } from '../../store/countdown';
  import arrowUp from '$lib/images/RSMC-upArrow.svg?raw';
  import arrowDown from '$lib/images/RSMC-downArrow.svg?raw';
  // import fixturePaymentMethods from './fixture-payment-methods.json'

  const BID_STEP_1 = 100000
  const BID_STEP_BORDER_1 = 10000000
  const BID_STEP_2 = 500000
  const BID_STEP_BORDER_2 = 50000000
  const BID_STEP_3 = 1000000

	export let bids = []
	export let auctionItem = {}

	let amountSats =  BID_STEP_1 // default to minBid
	let showPinInput = false

  let displayName = $currentDisplayName
  let email = $currentEmail
  let pinValue = ''
  let userVerified = !!$currentEmail

	// let invoice = 'bitcoin:bc1qrsmca2c8xxnl5f0ddsddeekcysn77069885cgm'
  let paymentMethods: any = null // fixturePaymentMethods.data
  let depositAmount: number = 0
  let bidId: string = ''
	let showModal = false

	let isProcessing = false
	let error = ''
	let successMessage = ''

	$: highestBid = bids?.find(bid => bid.status === 'PAYMENT_RECEIVED') || {}
  $: highestBidAmount = Number(highestBid.bid_amount) || 0
  $: MINIMUM_BID_STEP = highestBidAmount < BID_STEP_BORDER_1 
    ? BID_STEP_1 
    : (highestBidAmount < BID_STEP_BORDER_2
      ? BID_STEP_2
      : BID_STEP_3
    )
  $: minAvailAmount = (highestBidAmount) + MINIMUM_BID_STEP
  $: if (amountSats < minAvailAmount) {
    amountSats = minAvailAmount
  }

  $: isMet = auctionItem.minPrice < highestBidAmount

  function resetForm() {
    console.log(`[resetForm].`)
    amountSats = BID_STEP_1
    depositAmount = 0
    showPinInput = false
    pinValue = ''
    error = ''
    successMessage = ''
    // displayName = ''
    // email = ''
    currentEmail.set(email)
    currentDisplayName.set(displayName)
    userVerified = true

    // Store:
    bidStatus.set('')
    loadBids()
  }

  async function onBidClick() {
    // console.log(`onBidClick...`)
    // paymentMethods = fixturePaymentMethods.data
    // showModal = true
    // return ''

    paymentMethods = null
    error = ''
    successMessage = ''

    if (userVerified) {
      letsCreateBid()
      return
    }

    if (displayName?.length > 2 && isEmail(email) && Number(amountSats) >= minAvailAmount) {
      isProcessing = true
      // Send email for verification
      const result = await verifyEmail(email, displayName)
      if (result === true) {
        // Show PIN input
        showPinInput = true
      }
      isProcessing = false
    }
  }

  async function letsCreateBid() {
    if (!userVerified) {
      // Save pin
      pinHash.update(obj => ({
        ...obj,
        pin: pinValue
      }))
    }

    if (userVerified || displayName?.length > 2 && isEmail(email) && Number(amountSats) >= minAvailAmount && pinValue.length === 4) {
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
        depositAmount = result?.deposit_amount
        bidId = result.id
        showModal = true
        pollBidStatus(bidId)
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
    const amount = Number(amountSats)
    if (amount < BID_STEP_BORDER_1) {
      amountSats = amount + BID_STEP_1;
    } else if (amount < BID_STEP_BORDER_2) {
      amountSats = amount + BID_STEP_2;
    } else {
      amountSats = amount + BID_STEP_3;
    }
   }

  function decreaseAmount() {
    const amount = Number(amountSats)
    if (amount <= BID_STEP_1) {
      return
    }

    if (amount < BID_STEP_BORDER_1) {
      amountSats = amount - BID_STEP_1;
    } else if (amount < BID_STEP_BORDER_2) {
      amountSats = amount - BID_STEP_2;
    } else {
      amountSats = amount - BID_STEP_3;
    }
  }

  function changeEmail(){
    error = ''
    showPinInput = false
  }
</script>

<div class="rounded-none bg-black flex flex-col mt-6 w-full">

  {#if $isPublishActivated === true}
    <Reserve {isMet} />

    <div class="m-2">
      <h3 class="text-center text-xl text-btcorange"> Current bid:</h3>
      <p class="text-center text-lg font-anon text-white">{highestBid.nickname}</p>
      <h2 class="text-center text-2xl font-anon text-white leading-10"> {formatSats(highestBid.bid_amount)} sats </h2>
      <p class="text-center text-lg font-anon">
        { dollarPrice ? `${dollarPriceFormatted}` : '0' } $
      </p>
    </div>
  {/if}

  {#if $isAuctionFinished}
    <div class="m-2">
      <h3 class="text-center text-xl text-btcorange">
        Winning Bid:
      </h3>

      <div class="text-center text-lg font-anon text-white ">{highestBid.nickname}</div>
      <div class="text-center text-2xl font-anon text-white leading-10">{highestBidAmount.toLocaleString()} sats</div>
            <p class="text-center text-lg font-anon">
        { dollarPrice ? `${dollarPriceFormatted}` : '0' } $
      </p>
    </div>

  {:else}
    <div class="m-2">
      <h3 class="text-center text-xl text-btcorange">
        {#if $isPublishActivated === true}
          Auction ending:
        {:else}
          Auction starting:
        {/if}
      </h3>
      <h2 class="text-center text-2xl font-anon text-white"> <Countdown /> </h2>
    </div>	
  {/if}
	

  {#if $isPublishActivated === true}
    <p class="text-center text-sm font-anon break-words px-2">new bids in the final minutes add 5min to the auction timer</p>

    {#if !userVerified}
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
        <input type="text" placeholder="satoshi@rsmc.tech" class="input bg-white text-black font-anon focus:caret-btcorange focus:border-2 focus:border-btcorange rounded-none w-full"
            bind:value={email} />
      </div>
    {/if}
    
    <div class="px-2 w-full">
      <label class="label">
        <span class="label-text text-white font-anon text-xs md:text-sm">
          bid:  (min {minAvailAmount.toLocaleString()} sats)
        </span>
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

      {#if !showPinInput}
        <button 
          class="btn {isProcessing ? 'btn-disabled cursor-not-allowed' : ''} bg-btcorange border-1 border-btcorange rounded-none text-white w-full my-2"
          on:click={onBidClick}
        >
          {#if isProcessing}
            <span class="loading loading-dots loading-md"></span>
          {:else}
            Bid now
          {/if}
        </button>
      {/if}

      {#if successMessage}
        <div class="my-4 text-success">{successMessage}</div>
      {/if}

      <!-- {#if invoice}
        <div class="my-4">Please pay this invoice: {invoice}</div>
      {/if} -->

      {#if paymentMethods?.length}
        <BidInvoiceModal
          bind:showModal on:close={resetForm}
          {auctionItem} {amountSats} {paymentMethods} {depositAmount} />
      {/if}

    </div>

    {#if showPinInput}
      <div class="px-2 text-sm font-anon mt-2">Please check your email for PIN</div>
      <div class="px-2 text-sm font-anon cursor-pointer text-btcorange" on:click={changeEmail}>(change email)</div>
      <div class="form-control p-2 flex-row w-full space-x-1 justify-end flex-wrap">
        <label class="label">
          <span class="label-text text-white font-anon text-xs md:text-sm whitespace-nowrap">Enter your PIN:</span>
        </label>
        <div class="join join-horizontal rounded-none border-2 border-btcorange flex ">
          <input class="input bg-black text-white font-anon focus:caret-btcorange focus:border-1 focus:border-btcorange rounded-none input-md w-full join-item "
            bind:value={pinValue} type="text" placeholder="PIN" />
          <button on:click={letsCreateBid} class="btn bg-btcorange join-item rounded-none text-black font-anon hover:text-white">
            {#if isProcessing}
              <span class="loading loading-dots loading-sm"></span>
            {:else}
              &gt; 
            {/if}
          </button>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="text-error text-center">{error}</div>
    {/if}

    <p class="text-center text-sm font-anon break-words px-2 mt-4">*by submitting a bid you agree to our <a href="/tos" class="link text-btcorange font-anon text-xs md:text-sm hover:no-underline">terms</a>.</p>

  {/if}
</div>

