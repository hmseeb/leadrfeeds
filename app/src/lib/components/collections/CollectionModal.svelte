<script lang="ts">
	import { X } from 'lucide-svelte';
	import IconPicker from './IconPicker.svelte';
	import type { Collection } from '$lib/stores/collections';

	interface Props {
		isOpen: boolean;
		collection?: Collection | null;
		onSave: (name: string, iconName: string) => Promise<void>;
		onClose: () => void;
	}

	let { isOpen = $bindable(), collection = null, onSave, onClose }: Props = $props();

	let name = $state('');
	let iconName = $state('Folder');
	let submitting = $state(false);
	let errorMessage = $state('');

	// Initialize form when modal opens or collection changes
	$effect(() => {
		if (isOpen) {
			if (collection) {
				name = collection.collection_name;
				iconName = collection.icon_name;
			} else {
				name = '';
				iconName = 'Folder';
			}
			errorMessage = '';
		}
	});

	async function handleSubmit() {
		if (!name.trim()) {
			errorMessage = 'Collection name is required';
			return;
		}

		submitting = true;
		errorMessage = '';

		try {
			await onSave(name.trim(), iconName);
			submitting = false;
			closeModal();
		} catch (err: any) {
			console.error('Error saving collection:', err);
			errorMessage = err.message || 'Failed to save collection';
			submitting = false;
		}
	}

	function closeModal() {
		if (!submitting) {
			isOpen = false;
			onClose();
		}
	}

	function handleIconSelect(newIconName: string) {
		iconName = newIconName;
	}

	const isEditing = $derived(!!collection);
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="collection-modal-title"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-card border border-border rounded-lg w-full max-w-md mx-4 p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<h2 id="collection-modal-title" class="text-xl font-bold text-foreground">
					{isEditing ? 'Edit Collection' : 'New Collection'}
				</h2>
				<button
					onclick={closeModal}
					disabled={submitting}
					class="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					aria-label="Close modal"
				>
					<X size={24} />
				</button>
			</div>

			<!-- Form -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div class="space-y-4">
					<!-- Collection Name -->
					<div>
						<label for="collectionName" class="block text-sm font-medium text-foreground mb-2">
							Name <span class="text-red-500">*</span>
						</label>
						<input
							id="collectionName"
							type="text"
							bind:value={name}
							placeholder="e.g., Tech News, Morning Reads"
							required
							disabled={submitting}
							class="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
						/>
					</div>

					<!-- Icon Picker -->
					<div>
						<span class="block text-sm font-medium text-foreground mb-2">Icon</span>
						<div class="border border-border rounded-lg bg-background">
							<IconPicker selectedIcon={iconName} onSelect={handleIconSelect} />
						</div>
					</div>

					<!-- Error Message -->
					{#if errorMessage}
						<div class="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
							<p class="text-sm text-red-500">{errorMessage}</p>
						</div>
					{/if}

					<!-- Buttons -->
					<div class="flex gap-3 pt-2">
						<button
							type="button"
							onclick={closeModal}
							disabled={submitting}
							class="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={submitting || !name.trim()}
							class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							{#if submitting}
								<svg
									class="animate-spin h-4 w-4"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								Saving...
							{:else}
								{isEditing ? 'Save Changes' : 'Create Collection'}
							{/if}
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
