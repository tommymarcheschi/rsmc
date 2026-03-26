import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			maxDuration: 30
		}),
		alias: {
			$components: 'src/lib/components',
			$services: 'src/lib/services',
			$stores: 'src/lib/stores',
			$types: 'src/lib/types'
		}
	}
};

export default config;
