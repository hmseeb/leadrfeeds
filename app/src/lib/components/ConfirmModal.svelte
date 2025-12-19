<script lang="ts">
	import { X, AlertTriangle } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		title?: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'warning' | 'default';
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		isOpen = $bindable(),
		title = 'Confirm',
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'default',
		onConfirm,
		onCancel
	}: Props = $props();

	function handleConfirm() {
		isOpen = false;
		onConfirm();
	}

	function handleCancel() {
		isOpen = false;
		onCancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCancel();
		}
	}

	const variantStyles = {
		danger: {
			icon: 'text-destructive',
			iconBg: 'bg-destructive/10',
			button: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none'
		},
		warning: {
			icon: 'text-secondary',
			iconBg: 'bg-secondary/10',
			button: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none'
		},
		default: {
			icon: 'text-primary',
			iconBg: 'bg-primary/10',
			button: 'bg-primary hover:bg-primary/90 text-primary-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none'
		}
	};

	const styles = $derived(variantStyles[variant]);
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={handleCancel}
		onkeydown={handleKeydown}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-modal-title"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-card border-2 border-border w-full max-w-md mx-4 p-6 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-start gap-4">
				<div class="flex-shrink-0 w-10 h-10 rounded-full {styles.iconBg} flex items-center justify-center">
					<AlertTriangle size={20} class={styles.icon} />
				</div>
				<div class="flex-1 min-w-0">
					<h2 id="confirm-modal-title" class="text-lg font-semibold text-foreground">
						{title}
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						{message}
					</p>
				</div>
				<button
					onclick={handleCancel}
					class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
					aria-label="Close modal"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Buttons -->
			<div class="flex gap-3 mt-6 justify-end">
				<button
					type="button"
					onclick={handleCancel}
					class="px-4 py-2 border-2 border-border text-foreground hover:bg-accent transition-all shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
				>
					{cancelText}
				</button>
				<button
					type="button"
					onclick={handleConfirm}
					class="px-4 py-2 transition-all {styles.button}"
				>
					{confirmText}
				</button>
			</div>
		</div>
	</div>
{/if}
