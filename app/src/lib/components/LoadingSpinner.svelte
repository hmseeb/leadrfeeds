<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 24, class: className = '' }: Props = $props();
</script>

<div
	class="inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite] {className}"
	style="width: {size}px; height: {size}px;"
	role="status"
>
	<span class="sr-only">Loading...</span>
</div>
