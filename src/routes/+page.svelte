<script>
  import logo from "$lib/images/RSMC-logo-NEW.svg?raw";
  import Hero from "$lib/components/Hero.svelte";
</script>


<div class="flex flex-col items-center justify-center w-full">
  <Hero />
  <div class="flex-initial items-center justify-center mt-12 mx-1 py-8 md:py-12 lg:py-0 md:mt-4 md:w-2/4 w-5/6">{@html logo}</div>
  <div><h1 class="font-rocks text-white text-center uppercase text-6xl mt-[-0.4em] mx-4">A bitcoin agency.</h1></div>
</div>


