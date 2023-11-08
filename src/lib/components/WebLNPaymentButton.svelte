<script lang="ts">
  import { onMount } from 'svelte';
  import { weblnStatus } from '../../store/weblnStatus';
  export let lightningInvoice: string;

  let localWeblnStatus: WebLNStatus;

  // Subscribe to the store
  weblnStatus.subscribe((value) => {
    localWeblnStatus = value;
  });


  // Function to detect WebLN provider
  async function detectWebLNProvider(timeoutParam = 3000) {
    const timeout = timeoutParam;
    const interval = 100;
    let handled = false;

    return new Promise((resolve) => {
      if (window.webln) {
        handleWebLN();
      } else {
        document.addEventListener("webln:ready", handleWebLN, { once: true });

        let i = 0;
        const checkInterval = setInterval(function() {
          if (window.webln || i >= timeout / interval) {
            handleWebLN();
            clearInterval(checkInterval);
          }
          i++;
        }, interval);
      }

      function handleWebLN() {
        if (handled) {
          return;
        }
        handled = true;

        document.removeEventListener("webln:ready", handleWebLN);

        if (window.webln) {
          resolve(window.webln);
        } else {
          resolve(null);
        }
      }
    });
  }

  // Function to enable WebLN
  async function enableWebLN() {
    if (window.webln) {
      try {
        await window.webln.enable();
        weblnStatus.set({
          webln: window.webln,
          connected: true,
          providerName: window.webln.providerName || 'WebLN',
        });
      } catch (error) {
        console.error('WebLN enable failed:', error);
      }
    } else {
      console.error('WebLN is not available');
    }
  }

  async function payWithWebLN() {
    if (!localWeblnStatus.connected) {
      console.error('WebLN wallet is not connected');
      return;
    }
    try {
      const response = await localWeblnStatus.webln.sendPayment(lightningInvoice);
      console.log('Payment sent!', response);
      // Handle successful payment here
    } catch (error) {
      console.error('Payment failed', error);
      // Handle payment error here
    }
  }
</script>

{#if localWeblnStatus.webln && !localWeblnStatus.connected}
  <button on:click={enableWebLN} class="hover:text-btcorange hover:bg-black mx-4 px-2 bg-white text-black font-rocks text-lg md:text-xl">
    Connect with WebLN Wallet
  </button>
{:else if localWeblnStatus.connected}
  <button on:click={payWithWebLN} class="hover:text-btcorange hover:bg-black mx-4 px-2 bg-white text-black font-rocks text-lg md:text-xl">
    Pay with {localWeblnStatus.providerName}
  </button>
{:else}
  <button disabled class="opacity-50 cursor-not-allowed mx-4 px-2 bg-white text-black font-rocks text-lg md:text-xl">
    Connect with WebLN (Unavailable)
  </button>
{/if}

