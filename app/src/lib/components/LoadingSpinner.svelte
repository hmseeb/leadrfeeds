<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 24, class: className = '' }: Props = $props();

	const sizeClass = `w-[${size}px] h-[${size}px]`;
</script>

<div
	class="inline-block animate-spin border-2 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite] {sizeClass} {className}"
	role="status"
>
	<span class="sr-only">Loading...</span>
</div>
