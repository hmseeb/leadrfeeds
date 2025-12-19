<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
		value?: string;
	}

	let { class: className = '', value = $bindable(''), ...restProps }: Props = $props();
</script>

<textarea
	class="flex min-h-[80px] w-full bg-background px-3 py-2 text-sm text-foreground border-2 border-input placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 {className}"
	bind:value
	{...restProps}
></textarea>
