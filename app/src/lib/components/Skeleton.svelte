<script lang="ts">
	interface Props {
		class?: string;
		variant?: 'text' | 'circular' | 'rectangular';
		width?: string;
		height?: string;
	}

	let { class: className = '', variant = 'rectangular', width, height }: Props = $props();

	const variantClasses = {
		text: '',
		circular: 'rounded-full',
		rectangular: ''
	};
</script>

<div
	class="animate-shimmer bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] {variantClasses[variant]} {className}"
	style:width
	style:height
></div>
