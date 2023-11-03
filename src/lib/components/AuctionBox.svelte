<script>
  import Countdown from '$lib/components/Countdown.svelte';
</script>


<div class="rounded-none bg-black flex flex-col mt-6 w-full">
	<div class="m-2">
		<h3 class="text-center text-xl text-orange-500"> Current bid: </h3>
		<p class="text-center text-lg font-anon text-white">( $highest bid username )</p>
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
			<input type="text" placeholder="Satoshi" class="input bg-white rounded-none w-full" />
		</div>
	<div class="px-2 w-full">
		<label class="label">
			<span class="label-text text-white font-anon text-xs md:text-sm">email address:</span>
		</label>
			<input type="text" placeholder="satoshi@rsmc.com" class="input bg-white rounded-none w-full" />
		</div>
	<div class="px-2 w-full">
		<label class="label">
		<span class="label-text text-white font-anon text-xs md:text-sm">bid:</span>
		</label>
		<form id="auction-form" name="auction-form" data-name="Auction Form" method="get" data-wf-page-id="65396d2c02ecf45338528637" data-wf-element-id="efc08962-f955-2525-ab9c-74c60fc84837" aria-label="Auction Form"><input type="text" placeholder="0.001 BTC" class="input input-bordered  rounded-none bg-white w-full" />
		</form>
		<button class="btn btn-disabled cursor-not-allowed bg-orange-400 border-1 border-orange-400 rounded-none text-white w-full">Bid soon!</button>
	</div>
</div>


