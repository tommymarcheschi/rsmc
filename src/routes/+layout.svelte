<script>
  import "../app.css";
  import Navbar from "$lib/components/Navbar.svelte";
  import Newsletter from "$lib/components/Newsletter.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<div class="w-full h-full bg-black">
  <Navbar />
  <slot />
  <Newsletter />
  <Footer />
</div>