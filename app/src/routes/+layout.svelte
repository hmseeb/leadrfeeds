<script lang="ts">
	import '../app.css';
	import { loading } from '$lib/stores/auth';
	import Toast from '$lib/components/Toast.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		document.documentElement.classList.add('dark');
	});
</script>

<svelte:head>
	<title>LeadrFeeds</title>
</svelte:head>

{#if $loading}
	<div class="flex items-center justify-center h-screen bg-background">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else}
	{@render children()}
{/if}

<Toast />
