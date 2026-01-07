<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		children?: Snippet;
	}

	let {
		variant = 'default',
		size = 'default',
		class: className = '',
		children,
		...restProps
	}: Props = $props();

	const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed';

	const variantClasses = {
		default: 'bg-primary text-primary-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px]',
		destructive: 'bg-destructive text-destructive-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
		outline: 'border-2 border-border bg-background text-foreground shadow-md hover:bg-accent hover:text-accent-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
		secondary: 'bg-secondary text-secondary-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
		ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses = {
		default: 'h-10 px-4 py-2',
		sm: 'h-8 px-3 text-sm',
		lg: 'h-12 px-6 text-lg',
		icon: 'h-10 w-10'
	};

	const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
</script>

<button class={classes} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</button>
