<script lang="ts">
	interface Props {
		class?: string;
		variant?: 'text' | 'circular' | 'rectangular';
		width?: string;
		height?: string;
	}

	let { class: className = '', variant = 'rectangular', width, height }: Props = $props();

	const variantClasses = {
		text: 'rounded',
		circular: 'rounded-full',
		rectangular: 'rounded-lg'
	};
</script>

<div
	class="animate-shimmer bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 bg-[length:200%_100%] {variantClasses[
		variant
	]} {className}"
	style:width
	style:height
></div>

<style>
	@keyframes shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	.animate-shimmer {
		animation: shimmer 1.5s ease-in-out infinite;
	}
</style>
