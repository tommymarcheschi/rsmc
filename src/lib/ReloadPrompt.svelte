<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte'
	
	const { updateServiceWorker } = useRegisterSW({
		immediate: true,
		onRegistered(r) {
			console.log(`SW Registered: ${r}`)
		},
		onRegisterError(error) {
			console.log('SW registration error', error)
		},
	})
</script>