<script lang="ts">
	import { AlertTriangle, Copy, Check } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		apiKey: string;
		label: string;
		onClose: () => void;
	}

	let {
		isOpen = $bindable(),
		apiKey,
		label,
		onClose
	}: Props = $props();

	let copied = $state(false);

	async function copyToClipboard() {
		await navigator.clipboard.writeText(apiKey);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	function handleClose() {
		isOpen = false;
		onClose();
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onkeydown={handleKeydown}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="api-key-modal-title"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-card border-2 border-border p-6 max-w-lg mx-4 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center"
				>
					<AlertTriangle size={20} class="text-secondary" />
				</div>
				<div class="flex-1 min-w-0">
					<h2 id="api-key-modal-title" class="text-lg font-semibold text-foreground">
						Save your API key now
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						This key will only be shown once. Copy it now and store it securely.
					</p>
				</div>
			</div>

			<!-- Key display -->
			<div class="mt-6">
				<div
					class="flex items-center gap-2 bg-background border border-border p-3 font-mono text-sm"
				>
					<code class="flex-1 break-all text-foreground">{apiKey}</code>
					<button
						type="button"
						onclick={copyToClipboard}
						class="flex-shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
						aria-label={copied ? 'Copied' : 'Copy to clipboard'}
					>
						{#if copied}
							<Check size={16} class="text-green-500" />
						{:else}
							<Copy size={16} />
						{/if}
					</button>
				</div>

				<!-- Label display -->
				<p class="mt-2 text-sm text-muted-foreground">
					Label: <span class="text-foreground">{label}</span>
				</p>
			</div>

			<!-- Acknowledge button -->
			<div class="mt-6">
				<button
					type="button"
					onclick={handleClose}
					class="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground border-2 border-border shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
				>
					I've saved my key
				</button>
			</div>
		</div>
	</div>
{/if}
