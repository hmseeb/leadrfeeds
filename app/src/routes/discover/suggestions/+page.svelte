<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { ThumbsUp, ThumbsDown, ArrowLeft, Trash2 } from 'lucide-svelte';

	let suggestions = $state<any[]>([]);
	let loading = $state(true);
	let approvingIds = $state<Set<string>>(new Set());
	let rejectingIds = $state<Set<string>>(new Set());
	let deletingIds = $state<Set<string>>(new Set());
	let rejectingWithReasonId = $state<string | null>(null);
	let rejectionReason = $state('');
	let deletingConfirmId = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'pending' | 'approved' | 'rejected'>('pending');

	// Check if current user is owner
	const isOwner = $derived($user?.email === 'hsbazr@gmail.com');

	// Filter suggestions based on selected filter
	const filteredSuggestions = $derived(
		selectedFilter === 'all'
			? suggestions
			: suggestions.filter((s) => s.status === selectedFilter)
	);

	// Get a readable feed title from URL if no title exists
	function getFeedTitle(suggestion: any): string {
		if (suggestion.feed_title) return suggestion.feed_title;

		const url = suggestion.feed_url;
		if (!url) return 'Feed';

		try {
			const urlObj = new URL(url);
			let domain = urlObj.hostname.replace('www.', '');

			// Map common domains to readable names
			if (domain.includes('youtube.com')) return 'YouTube';
			if (domain.includes('reddit.com')) return 'Reddit';
			if (domain.includes('github.com')) return 'GitHub';
			if (domain.includes('medium.com')) return 'Medium';
			if (domain.includes('substack.com')) return 'Substack';
			if (domain.includes('twitter.com') || domain.includes('x.com')) return 'Twitter/X';
			if (domain.includes('linkedin.com')) return 'LinkedIn';
			if (domain.includes('techcrunch.com')) return 'TechCrunch';
			if (domain.includes('theverge.com')) return 'The Verge';
			if (domain.includes('arstechnica.com')) return 'Ars Technica';
			if (domain.includes('hackernews') || domain.includes('ycombinator.com')) return 'Hacker News';

			// Extract main domain name and capitalize
			const parts = domain.split('.');
			const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
			return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
		} catch {
			return 'Feed';
		}
	}

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		// Redirect non-owners to discover page
		if (!isOwner) {
			goto('/discover');
			return;
		}

		await loadSuggestions();
	});

	async function loadSuggestions() {
		loading = true;

		const { data, error } = await supabase
			.from('feed_suggestions')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading suggestions:', error);
		} else if (data) {
			suggestions = data;
		}

		loading = false;
	}

	async function approveSuggestion(suggestionId: string) {
		approvingIds = new Set(approvingIds).add(suggestionId);

		try {
			const { error } = await supabase.rpc('approve_feed_suggestion', {
				p_suggestion_id: suggestionId
			});

			if (error) throw error;

			// Find the suggestion to get the URL
			const suggestion = suggestions.find((s) => s.id === suggestionId);
			if (suggestion?.feed_url) {
				// Redirect to folo.is with the feed URL
				window.open(
					`https://app.folo.is/discover?type=rss&url=${encodeURIComponent(suggestion.feed_url)}`,
					'_blank'
				);
			}

			// Reload suggestions
			await loadSuggestions();
		} catch (err: any) {
			console.error('Error approving suggestion:', err);
		} finally {
			const newSet = new Set(approvingIds);
			newSet.delete(suggestionId);
			approvingIds = newSet;
		}
	}

	function showRejectForm(suggestionId: string) {
		rejectingWithReasonId = suggestionId;
		rejectionReason = '';
	}

	function cancelReject() {
		rejectingWithReasonId = null;
		rejectionReason = '';
	}

	async function confirmReject(suggestionId: string) {
		rejectingIds = new Set(rejectingIds).add(suggestionId);

		try {
			const { error } = await supabase.rpc('reject_feed_suggestion', {
				p_suggestion_id: suggestionId,
				p_rejection_reason: rejectionReason.trim() || null
			});

			if (error) throw error;

			// Reload suggestions
			await loadSuggestions();
			rejectingWithReasonId = null;
			rejectionReason = '';
		} catch (err: any) {
			console.error('Error rejecting suggestion:', err);
		} finally {
			const newSet = new Set(rejectingIds);
			newSet.delete(suggestionId);
			rejectingIds = newSet;
		}
	}

	function showDeleteConfirm(suggestionId: string) {
		deletingConfirmId = suggestionId;
	}

	function cancelDelete() {
		deletingConfirmId = null;
	}

	async function confirmDelete(suggestionId: string) {
		deletingIds = new Set(deletingIds).add(suggestionId);

		try {
			const { error } = await supabase.rpc('delete_feed_suggestion' as any, {
				p_suggestion_id: suggestionId
			});

			if (error) throw error;

			// Reload suggestions
			await loadSuggestions();
			deletingConfirmId = null;
		} catch (err: any) {
			console.error('Error deleting suggestion:', err);
		} finally {
			const newSet = new Set(deletingIds);
			newSet.delete(suggestionId);
			deletingIds = newSet;
		}
	}

	// Get pending count
	const pendingCount = $derived(
		suggestions.filter((s) => s.status === 'pending').length
	);
</script>

<div class="min-h-screen bg-background">
	<div class="max-w-7xl mx-auto px-4 py-8">
		<!-- Header -->
		<div class="mb-8">
			<a
				href="/timeline/all"
				class="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
			>
				<ArrowLeft size={20} />
				Back to Timeline
			</a>
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-foreground mb-2">Feed Suggestions</h1>
					<p class="text-muted-foreground">
						Review and manage feed suggestions from users
						{#if pendingCount > 0}
							<span class="ml-2 px-2 py-0.5 bg-primary/20 text-primary rounded-full text-sm font-medium">
								{pendingCount} pending
							</span>
						{/if}
					</p>
				</div>
			</div>
		</div>

		<!-- Filter tabs -->
		<div class="mb-6 flex gap-2">
			<button
				onclick={() => (selectedFilter = 'all')}
				class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {selectedFilter ===
				'all'
					? 'bg-primary text-primary-foreground'
					: 'bg-card text-foreground hover:bg-accent'}"
			>
				All ({suggestions.length})
			</button>
			<button
				onclick={() => (selectedFilter = 'pending')}
				class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {selectedFilter ===
				'pending'
					? 'bg-primary text-primary-foreground'
					: 'bg-card text-foreground hover:bg-accent'}"
			>
				Pending ({pendingCount})
			</button>
			<button
				onclick={() => (selectedFilter = 'approved')}
				class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {selectedFilter ===
				'approved'
					? 'bg-primary text-primary-foreground'
					: 'bg-card text-foreground hover:bg-accent'}"
			>
				Approved ({suggestions.filter((s) => s.status === 'approved').length})
			</button>
			<button
				onclick={() => (selectedFilter = 'rejected')}
				class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {selectedFilter ===
				'rejected'
					? 'bg-primary text-primary-foreground'
					: 'bg-card text-foreground hover:bg-accent'}"
			>
				Rejected ({suggestions.filter((s) => s.status === 'rejected').length})
			</button>
		</div>

		<!-- Suggestions List -->
		<div class="space-y-4">
			{#if loading}
				<div class="text-center py-12">
					<p class="text-muted-foreground">Loading suggestions...</p>
				</div>
			{:else if filteredSuggestions.length === 0}
				<div class="text-center py-12">
					<p class="text-muted-foreground">
						{#if selectedFilter === 'all'}
							No feed suggestions yet
						{:else}
							No {selectedFilter} suggestions
						{/if}
					</p>
					{#if selectedFilter === 'all'}
						<p class="text-sm text-muted-foreground mt-2">
							Users can suggest new feeds from the Discover page
						</p>
					{/if}
				</div>
			{:else}
				{#each filteredSuggestions as suggestion}
					<div class="bg-card border border-border rounded-lg p-6">
						<div class="flex items-start justify-between gap-4">
							<!-- Suggestion Details -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-2">
									<h3 class="font-semibold text-foreground text-lg">
										{getFeedTitle(suggestion)}
									</h3>
									<span
										class="px-2 py-0.5 text-xs rounded-full font-medium {suggestion.status ===
										'pending'
											? 'bg-yellow-500/20 text-yellow-500'
											: suggestion.status === 'approved'
												? 'bg-green-500/20 text-green-500'
												: 'bg-red-500/20 text-red-500'}"
									>
										{suggestion.status}
									</span>
								</div>

								<a
									href={suggestion.feed_url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm text-primary hover:text-primary/90 break-all block mb-3"
								>
									{suggestion.feed_url}
								</a>

								{#if suggestion.feed_description}
									<p class="text-sm text-muted-foreground mb-3">
										{suggestion.feed_description}
									</p>
								{/if}

								{#if suggestion.reason}
									<div class="mt-2 p-3 bg-accent/10 rounded border-l-2 border-primary">
										<p class="text-xs text-muted-foreground mb-1 font-medium">
											Why this feed?
										</p>
										<p class="text-sm text-foreground">{suggestion.reason}</p>
									</div>
								{/if}

								<div class="mt-3 text-xs text-muted-foreground flex items-center gap-2">
									<span>Suggested by: <strong>{suggestion.suggested_by_email}</strong></span>
									<span>•</span>
									<span>{new Date(suggestion.created_at).toLocaleDateString()}</span>
									{#if suggestion.reviewed_at}
										<span>•</span>
										<span>
											Reviewed by: <strong>{suggestion.reviewed_by_email}</strong> on {new Date(
												suggestion.reviewed_at
											).toLocaleDateString()}
										</span>
									{/if}
								</div>

								{#if suggestion.rejection_reason}
									<div class="mt-3 p-2 bg-red-500/10 rounded border border-red-500/20">
										<p class="text-xs text-red-500">
											<strong>Rejection reason:</strong>
											{suggestion.rejection_reason}
										</p>
									</div>
								{/if}
							</div>

							<!-- Action Buttons -->
							<div class="flex gap-2 flex-shrink-0">
								{#if suggestion.status === 'pending'}
									<button
										onclick={() => approveSuggestion(suggestion.id)}
										disabled={approvingIds.has(suggestion.id) ||
											rejectingIds.has(suggestion.id)}
										class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
										title="Approve and create feed"
									>
										{#if approvingIds.has(suggestion.id)}
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
										{:else}
											<ThumbsUp size={16} />
										{/if}
										Approve
									</button>
									<button
										onclick={() => showRejectForm(suggestion.id)}
										disabled={approvingIds.has(suggestion.id) ||
											rejectingIds.has(suggestion.id) ||
											rejectingWithReasonId === suggestion.id}
										class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
										title="Reject suggestion"
									>
										{#if rejectingIds.has(suggestion.id)}
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
										{:else}
											<ThumbsDown size={16} />
										{/if}
										Reject
									</button>
								{/if}

								<!-- Delete Button (always visible) -->
								<button
									onclick={() => showDeleteConfirm(suggestion.id)}
									disabled={deletingIds.has(suggestion.id) ||
										deletingConfirmId === suggestion.id}
									class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
									title="Delete suggestion"
								>
									{#if deletingIds.has(suggestion.id)}
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
									{:else}
										<Trash2 size={16} />
									{/if}
									Delete
								</button>
							</div>
						</div>

						<!-- Inline Rejection Form -->
						{#if rejectingWithReasonId === suggestion.id}
							<div class="mt-4 p-4 bg-red-500/5 rounded-lg border border-red-500/20">
								<label class="block text-sm font-medium text-foreground mb-2">
									Rejection Reason (optional)
								</label>
								<textarea
									bind:value={rejectionReason}
									rows="3"
									placeholder="Why are you rejecting this suggestion?"
									class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
								<div class="flex gap-2 mt-3">
									<button
										onclick={() => confirmReject(suggestion.id)}
										disabled={rejectingIds.has(suggestion.id)}
										class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
									>
										{#if rejectingIds.has(suggestion.id)}
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
											Rejecting...
										{:else}
											Confirm Reject
										{/if}
									</button>
									<button
										onclick={cancelReject}
										disabled={rejectingIds.has(suggestion.id)}
										class="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}

						<!-- Inline Delete Confirmation -->
						{#if deletingConfirmId === suggestion.id}
							<div class="mt-4 p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
								<p class="text-sm font-medium text-foreground mb-3">
									Are you sure you want to delete this suggestion? This action cannot be undone.
								</p>
								<div class="flex gap-2">
									<button
										onclick={() => confirmDelete(suggestion.id)}
										disabled={deletingIds.has(suggestion.id)}
										class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
									>
										{#if deletingIds.has(suggestion.id)}
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
											Deleting...
										{:else}
											<Trash2 size={16} />
											Yes, Delete
										{/if}
									</button>
									<button
										onclick={cancelDelete}
										disabled={deletingIds.has(suggestion.id)}
										class="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
