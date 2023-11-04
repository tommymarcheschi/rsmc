<script>
  import Countdown from "$lib/components/Countdown.svelte";
import CountDown from "$lib/components/Countdown.svelte"

</script>



<a href="/auctions" class="no-underline w-inline-block mt-32">
  <div class="w-[80vw] h-[60vh] flex flex-col justify-end items-start transition-all duration-300 ease-in mb-20 p-5" style="background-image: url(/auction/end-fiat/main.jpeg)">
    <h1 class="heading text-5xl text-white font-bold mb-4">Auction Live!</h1>
    <div class="p white text-lg text-white mb-2">END FIAT! by Tommy Marcheschi</div>
    <div class="p white text-lg text-white mb-4"><CountDown /></div>
    <a href="/auctions" class="btn hover:bg-btcorange bg-white text-black font-anon text-lg md:text-2xl rounded-none mb-4 uppercase py-2 px-4 transition duration-300 ease-in-out cursor-pointer">
      Bid Now
    </a>
  </div>
</a>

