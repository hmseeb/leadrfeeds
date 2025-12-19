<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children?: Snippet;
	}

	let { class: className = '', children, ...restProps }: Props = $props();
</script>

<div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0 {className}" {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>
