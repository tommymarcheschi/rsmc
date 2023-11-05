<script>
import CountDown from "$lib/components/Countdown.svelte"

</script>



<a href="/auctions/end-fiat" class="no-underline w-inline-block mt-32">
  <div class="w-[80vw] h-[40vh] md:h-[60vh] flex flex-col justify-end items-start p-2 mb-14 md:mb-20 transition-all duration-300 ease-in bg-hero-pattern bg-[auto,_120%] hover:bg-[auto,_115%] scale-100 hover:p-5 hover:scale-[101%]" style="background-position: 0 0, 20% 30%; background-image: linear-gradient(to right, #000 5%, rgba(219, 219, 219, .14) 55%, rgba(255, 255, 255, 0)), url(/auction/end-fiat/ENDFIAT-inscribe.png)">
    <div class="absolute left-5 top-5"><span class="loading loading-ring loading-sm md:loading-lg bg-btcorange"></span></div>

    <h1 class=" text-5xl text-white font-bold font-rocks mb-4 tracking-wide">Auction Live!</h1>
    <p class="text-sm md:text-base text-white font-anon ">END FIAT! by Tommy Marcheschi</p>
    <p class="text-sm md:text-base text-white font-anon "><CountDown /></p>
    <a href="/auctions/end-fiat" class="btn hover:bg-btcorange bg-white text-black font-anon text-lg md:text-2xl rounded-none mb-4 uppercase py-2 px-4 transition duration-300 ease-in-out cursor-pointer">
      Bid Now
    </a>
  </div>
</a>

