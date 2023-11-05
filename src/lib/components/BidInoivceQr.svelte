<script>
  import { onMount } from 'svelte';
  import * as qr from '@bitjson/qr-code';
  import qrcodeLogo from '$lib/images/RSMC-secondarylogo.svg';


  let btcAddress = "bitcoin:bc1qrsmca2c8xxnl5f0ddsddeekcysn77069885cgm";
  let lightningInvoice = "lnurlp://btcpay0.voltageapp.io/BTC/UILNURL/HtJkhjgZHfL9fKwzcr9cmVECCxUKWNR81qeKEBU87Qiz/pay?currency=USD";

  export let paymentMethod = 'BTC'; // Default to BTC

  $: qrContents = paymentMethod === 'BTC' ? btcAddress : lightningInvoice;

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
</script>
<qr-code
  id="qr1"
  on:codeRendered={handleCodeRendered}
  contents="{qrContents}"
  moduleColor="#000000" 
  positionRingColor="#ffffff" 
  positionCenterColor="#ffffff" 
  style="width: 200px; height: 200px; margin: 0em auto; background-color: #ffffff; filter: invert(2);"> 
  <img src="{qrcodeLogo}" slot="icon" alt="QR Code Icon" class="invert"/>
</qr-code>