import { writable } from 'svelte/store';

export interface WebLNStatus {
  webln: any; // You can replace 'any' with a more specific type if you have one
  connected: boolean;
  providerName: string;
}

function createWebLNStatus() {
  const { subscribe, set } = writable<WebLNStatus>({
    webln: null,
    connected: false,
    providerName: '',
  });

  return {
    subscribe,
    enable: async () => {
      if (window.webln) {
        try {
          await window.webln.enable();
          set({
            webln: window.webln,
            connected: true,
            providerName: window.webln.providerName || 'Connected Wallet',
          });
        } catch (error) {
          console.error('WebLN enable failed:', error);
        }
      }
    },
  };
}

export const weblnStatus = createWebLNStatus();