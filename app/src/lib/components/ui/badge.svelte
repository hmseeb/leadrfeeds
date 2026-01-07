<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: 'default' | 'secondary' | 'destructive' | 'outline';
		children?: Snippet;
	}

	let { variant = 'default', class: className = '', children, ...restProps }: Props = $props();

	const baseClasses = 'inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

	const variantClasses = {
		default: 'border-transparent bg-primary text-primary-foreground',
		secondary: 'border-transparent bg-secondary text-secondary-foreground',
		destructive: 'border-transparent bg-destructive text-destructive-foreground',
		outline: 'border-border text-foreground'
	};

	const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;
</script>

<div class={classes} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>
