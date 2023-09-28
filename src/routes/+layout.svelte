<script>
  import "../app.css";
  import Navbar from "$lib/components/Navbar.svelte";
  import Newsletter from "$lib/components/Newsletter.svelte";
  import Footer from "$lib/components/Footer.svelte";

</script>

  <div class="bg-black h-screen w-screen -z-20 fixed"> </div>
  
  <div class="w-screen h-full bg-black">
  <div class="w-full h-auto ">
    <Navbar />
  </div>
  <div class="bg-black">
    <slot />
  </div>
  <Newsletter />
  <Footer />
</div>
