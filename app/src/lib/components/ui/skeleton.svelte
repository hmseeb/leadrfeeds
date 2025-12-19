<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: 'text' | 'circular' | 'rectangular';
	}

	let { variant = 'rectangular', class: className = '', ...restProps }: Props = $props();

	const variantClasses = {
		text: '',
		circular: 'rounded-full',
		rectangular: ''
	};
</script>

<div
	class="animate-shimmer bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] {variantClasses[variant]} {className}"
	{...restProps}
></div>
