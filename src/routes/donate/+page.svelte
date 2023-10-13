<script>
  import logowithtype from "$lib/images/RSMC-logo-white-type.svg";
  import QRCode from "$lib/components/Qrcode.svelte";
  let selectedPaymentMethod = 'BTC'; // Default to BTC

</script>


<div class="flex flex-col items-center justify-center ">
  <div class="flex flex-col mt-32 text-left w-3/5">  
    <h1 class="font-rocks text-white text-left uppercase text-6xl mb-2">Donate Rsmc</h1>
    <span class="font-incon text-white text-left text-sm mb-4">Buy us a coffee. It makes us buidl more.</span>
  </div>

  <div class="flex flex-col items-center justify-center w-3/5 mt-2 text-left">
    <div class="w-3/5 mb-10 mt-8">

    <h2 class="text-white font-incon text-2xl tracking-widest uppercase mt-0 mb-2 antialiased">// ANON DONATION FORM</h2>
    <h3 class="text-white subpixel-antialiased font-incon text-2xl tracking-wider uppercase text-left mt-2 mb-2">
      <button class="link {selectedPaymentMethod === 'BTC' ? 'no-underline' : ''}" 
    on:click={() => selectedPaymentMethod = 'BTC'}>Bitcoin</button> or <button class="link {selectedPaymentMethod === 'BTC-LightningNetwork' ? 'no-underline' : ''}" on:click={() => selectedPaymentMethod = 'BTC-LightningNetwork'}>Lightning</button>:</h3>
    <QRCode paymentMethod={selectedPaymentMethod} />
    <p class="text-white antialiased font-incon text-base tracking-wider text-center leading-loose px-14">Thank you.
    </p>
  </div>
</div>

</div>
