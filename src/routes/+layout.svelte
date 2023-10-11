<script>
  import { onMount } from 'svelte'
  import "../app.css";
  import Navbar from "$lib/components/Navbar.svelte";
  import Newsletter from "$lib/components/Newsletter.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { pwaInfo } from 'virtual:pwa-info'; 
	import ReloadPrompt from '$lib/ReloadPrompt.svelte';

  
  onMount(async () => {
       if (pwaInfo) {
         const { registerSW } = await import('virtual:pwa-register')
         registerSW({
           immediate: true,
           onRegistered(r) {
             console.log(`SW Registered: ${r}`)
           },
           onRegisterError(error) {
             console.log('SW registration error', error)
           }
         })
       }
     })
     $: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '' 
</script>

<svelte:head> 
  {@html webManifestLink} 
</svelte:head>


  <div class="bg-black h-screen w-screen h-screen -z-20 fixed"> </div>

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


{#await import('$lib/ReloadPrompt.svelte') then { default: ReloadPrompt}}
  <ReloadPrompt />
{/await}