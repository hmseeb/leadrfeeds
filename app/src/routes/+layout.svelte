<script lang="ts">
	import '../app.css';
	import { loading } from '$lib/stores/auth';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>LeadrFeeds</title>
</svelte:head>

{#if $loading}
	<div class="flex flex-col items-center justify-center h-screen bg-background gap-4">
		<img src="/logo.png" alt="LeadrFeeds" class="h-16 animate-pulse" />
		<div class="flex items-center gap-2">
			<div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0ms"></div>
			<div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 150ms"></div>
			<div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 300ms"></div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<Toast />
