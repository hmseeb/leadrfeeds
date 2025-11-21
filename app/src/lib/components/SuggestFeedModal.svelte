<script lang="ts">
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { X } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		onSuccess?: () => void;
	}

	let { isOpen = $bindable(), onSuccess }: Props = $props();

	let feedUrl = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	async function handleSubmit() {
		if (!$user) return;

		// Basic validation
		if (!feedUrl.trim()) {
			errorMessage = 'Feed URL is required';
			return;
		}

		// Validate URL format
		try {
			new URL(feedUrl);
		} catch (e) {
			errorMessage = 'Please enter a valid URL (e.g., https://example.com/feed.xml)';
			return;
		}

		submitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const { error } = await supabase.rpc('submit_feed_suggestion' as any, {
				p_feed_url: feedUrl.trim(),
				p_feed_title: null,
				p_feed_description: null,
				p_reason: null
			});

			if (error) throw error;

			successMessage = 'Feed suggestion submitted successfully!';

			// Reset form after short delay
			setTimeout(() => {
				feedUrl = '';
				successMessage = '';
				isOpen = false;
				onSuccess?.();
			}, 1500);
		} catch (err: any) {
			console.error('Error submitting suggestion:', err);
			errorMessage = err.message || 'Failed to submit suggestion';
		} finally {
			submitting = false;
		}
	}

	function closeModal() {
		if (!submitting) {
			errorMessage = '';
			successMessage = '';
			isOpen = false;
		}
	}

	// Reset form when modal opens
	$effect(() => {
		if (isOpen) {
			feedUrl = '';
			errorMessage = '';
			successMessage = '';
		}
	});
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={closeModal}
		role="dialog"
		aria-modal="true"
		aria-labelledby="suggest-feed-title"
	>
		<div
			class="bg-card border border-border rounded-lg w-full max-w-lg mx-4 p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<h2 id="suggest-feed-title" class="text-2xl font-bold text-foreground">
					Suggest a Feed
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
					<!-- Feed URL (Required) -->
					<div>
						<label for="feedUrl" class="block text-sm font-medium text-foreground mb-2">
							Feed URL <span class="text-red-500">*</span>
						</label>
						<input
							id="feedUrl"
							type="url"
							bind:value={feedUrl}
							placeholder="https://example.com/feed.xml"
							required
							disabled={submitting}
							class="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Enter the RSS/URL you'd like to suggest
						</p>
					</div>

					<!-- Success Message -->
					{#if successMessage}
						<div class="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
							<p class="text-sm text-green-500 flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
									<polyline points="22 4 12 14.01 9 11.01" />
								</svg>
								{successMessage}
							</p>
						</div>
					{/if}

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
							disabled={submitting || !feedUrl.trim()}
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
								Submitting...
							{:else}
								Submit Suggestion
							{/if}
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
