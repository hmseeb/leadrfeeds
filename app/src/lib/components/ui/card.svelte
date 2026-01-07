<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children?: Snippet;
	}

	let { class: className = '', children, ...restProps }: Props = $props();
</script>

<div
	class="bg-card text-card-foreground border-2 border-border shadow-md {className}"
	{...restProps}
>
	{#if children}
		{@render children()}
	{/if}
</div>
