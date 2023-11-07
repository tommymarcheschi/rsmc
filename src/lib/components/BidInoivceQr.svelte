<script>
  import { onMount } from 'svelte';
  import * as qr from '@bitjson/qr-code';
  import qrcodeLogo from '$lib/images/RSMC-secondarylogo.svg';

  export let amount = 0
  export let paymentLink = ''

  // Remove protocol and query params:
  $: addressOrInvoice = paymentLink?.split(':')?.[1]?.replace(/\?.*/, '') || ''

  // let btcAddress = "bitcoin:bc1qrsmca2c8xxnl5f0ddsddeekcysn77069885cgm";
  // let lightningInvoice = "lnurlp://btcpay0.voltageapp.io/BTC/UILNURL/HtJkhjgZHfL9fKwzcr9cmVECCxUKWNR81qeKEBU87Qiz/pay?currency=USD";
  // export let paymentMethod = 'BTC'; // Default to BTC
  // let qrContents;
  // let addressOrInvoice;
  // $: {
  //   qrContents = paymentMethod === 'BTC' ? btcAddress : lightningInvoice;
  //   addressOrInvoice = qrContents.split(':')[1];
  // }

  onMount(() => {
    qr.defineCustomElements(window);
  });

  function fadeIn(qrElement) {
    qrElement.animateQRCode((targets, _x, _y, _count, entity) => ({
      targets,
      from: entity === 'module' ? Math.random() * 200 : 200,
      duration: 500,
      easing: 'cubic-bezier(1,1,0,.5)',
      web: {
        opacity: [0, 1],
        scale: [0.3, 1.13, 0.93, 1],
      },
    }));
  }

  function handleCodeRendered(event) {
    const qrElement = event.currentTarget;
    fadeIn(qrElement);
  }
  // Function to copy the full address or invoice to the clipboard
  function copyAddressOrInvoice() {
    navigator.clipboard.writeText(addressOrInvoice);
  }
</script>

<div class="flex flex-col justify-center items-center ">  
  <qr-code
    id="qr1"
    on:codeRendered={handleCodeRendered}
    contents={paymentLink}
    moduleColor="#000000" 
    positionRingColor="#ffffff" 
    positionCenterColor="#ffffff" 
    style="width: 200px; height: 200px; margin: 0.2em auto; background-color: #ffffff; filter: invert(2);"> 

    <img src="{qrcodeLogo}" slot="icon" alt="QR Code Icon" class="invert"/>
  </qr-code>

  <div class="text-2xl font-bold my-2">Your paying {amount} sats</div>

  <!-- Display the truncated address or invoice -->
  <span class="text-xs mb-1" on:click={copyAddressOrInvoice}>
    {addressOrInvoice.substring(0, 8)}...{addressOrInvoice.substring(addressOrInvoice.length - 8)}
  </span>

  <button on:click={copyAddressOrInvoice} class="hover:text-btcorange hover:bg-black mx-4  px-2 bg-white text-black font-rocks text-lg md:text-xl">
    copy invoice
  </button>
</div>
