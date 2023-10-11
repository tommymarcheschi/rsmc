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
			src: '/favicon.png', // replace this with the path to your icon file
            sizes: '32x32',
            type: 'image/png',
            },

          ],
        },
      }),
    ]
  });
