import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit'


export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			manifest: {
			icons: [
			{
			src: '/RsmcFavicon-192x192.png', // replace this with the path to your icon file
            sizes: '192x192',
            type: 'image/png',
            },

          ],
        },
      }),
    ]
  });
