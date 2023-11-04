<script lang="ts">
  import Countdown from '$lib/components/Countdown.svelte';
	import { createBid } from '../../store/auction-store';

	export let bids = []

	const minBid = 100000

	let displayName = ''
	let email = ''
	let amountSats = minBid // default to minBid

	let isProcessing = false
	let error = ''
	let successMessage = ''

	$: highestBid = bids?.[0] || {}

	async function onBidClick() {
		error = ''
		successMessage = ''
		if (displayName?.length > 2 && isEmail(email) && Number(amountSats) >= minBid) {
			isProcessing = true
			const result = await createBid({ displayName, email, amountSats })
			if (result?.isError) {
				error = result.message
			} else {
				successMessage = 'BID has been created!'
			}
			isProcessing = false
		} else {
			console.log('not enough data', displayName, email, amountSats)
		}
	}
	function isEmail(email: string): boolean{
		return email.length > 5 && email.includes('@')
	}
</script>

<div class="rounded-none bg-black flex flex-col mt-6 w-full">
	<div class="m-2">
		<h3 class="text-center text-xl text-orange-500"> Current bid: </h3>
		<p class="text-center text-lg font-anon text-white">( {highestBid.nickname}: {highestBid.bid_amount} )</p>
		<h2 class="text-center text-2xl font-anon text-white leading-10"> 0 BTC </h2>
		<p class="text-center text-lg font-anon">( $dollarprice )</p>
	</div>
	<div class="m-2">
		<h3 class="text-center text-xl text-orange-500"> Auction starting: </h3>
		<h2 class="text-center text-2xl font-anon text-white"> <Countdown /> </h2>
	</div>	
		<p class="text-center text-sm font-anon break-words px-2">new bids in the final minutes add 5min to the auction timer</p>
	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">display name:</span>
		</label>
			<input type="text" placeholder="Satoshi" class="input bg-white rounded-none w-full" 
				bind:value={displayName} />
		</div>
	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">email address:</span>
		</label>
			<input type="text" placeholder="satoshi@rsmc.com" class="input bg-white rounded-none w-full"
				bind:value={email} />
		</div>
	<div class="px-2 w-full">
		<label class="label">
		<span class="label-text text-white font-anon text-xs md:text-sm">bid:</span>
		</label>
		<form id="auction-form" name="auction-form" data-name="Auction Form" method="get" data-wf-page-id="65396d2c02ecf45338528637" data-wf-element-id="efc08962-f955-2525-ab9c-74c60fc84837" aria-label="Auction Form">
			<input type="text" placeholder="0.001 BTC" class="input input-bordered  rounded-none bg-white w-full"
				bind:value={amountSats} />
		</form>

		<button 
			class="btn _btn-disabled _cursor-not-allowed bg-orange-400 border-1 border-orange-400 rounded-none text-white w-full"
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

	</div>
</div>

