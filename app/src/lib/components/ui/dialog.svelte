<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onClose?: () => void;
		children?: Snippet;
	}

	let { open = false, onClose, children }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose?.();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/50"
			onclick={handleBackdropClick}
			aria-label="Close dialog"
		></button>

		<!-- Dialog content -->
		<div class="relative z-10 w-full max-w-lg mx-4 bg-card text-card-foreground border-2 border-border shadow-lg animate-fade-in">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
{/if}
