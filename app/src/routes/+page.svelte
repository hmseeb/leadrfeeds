<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, loading } from '$lib/stores/auth';

	onMount(() => {
		// Wait for auth to load, then redirect immediately
		const unsubscribe = loading.subscribe((isLoading) => {
			if (!isLoading) {
				// Direct redirect - no additional API calls
				// Timeline handles empty state, discover is accessible from sidebar
				goto($user ? '/timeline/all' : '/auth/login', { replaceState: true });
				unsubscribe();
			}
		});
	});
</script>

<!-- Minimal content - layout already shows loading state -->
<div class="min-h-screen bg-background"></div>