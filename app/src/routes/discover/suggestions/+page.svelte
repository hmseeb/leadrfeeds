<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { ThumbsUp, ThumbsDown, Trash2, Users, Link, Search, ChevronDown } from 'lucide-svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';

	// Responsive state
	const isDesktopMode = $derived($useDesktopLayout);
	let isSidebarOpen = $state(false);

	let suggestions = $state<any[]>([]);
	let loading = $state(true);
	let approvingIds = $state<Set<string>>(new Set());
	let rejectingIds = $state<Set<string>>(new Set());
	let deletingIds = $state<Set<string>>(new Set());
	let rejectingWithReasonId = $state<string | null>(null);
	let rejectionReason = $state('');
	let deletingConfirmId = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'pending' | 'approved' | 'rejected'>('pending');

	// Feed ID linking
	let linkingFeedId = $state<string | null>(null);
	let feedIdInput = $state('');
	let linkingInProgress = $state(false);
	let linkError = $state('');

	// Approval with feed ID
	let approvingWithFeedId = $state<string | null>(null);
	let approvalFeedIdInput = $state('');
	let approvalError = $state('');

	// Existing feeds for dropdown
	let existingFeeds = $state<{ id: string; title: string | null; url: string }[]>([]);

	// Searchable dropdown state
	let feedSearchQuery = $state('');
	let dropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Close dropdown when clicking outside
	function handleGlobalClick(event: MouseEvent) {
		if (dropdownOpen && dropdownRef && !dropdownRef.contains(event.target as Node)) {
			dropdownOpen = false;
		}
	}

	// Filtered feeds based on search query
	const filteredFeeds = $derived(
		feedSearchQuery.trim()
			? existingFeeds.filter(feed => {
				const query = feedSearchQuery.toLowerCase();
				return (feed.title?.toLowerCase().includes(query) ||
					feed.url.toLowerCase().includes(query) ||
					feed.id.toLowerCase().includes(query));
			})
			: existingFeeds
	);

	// Waitlist and feed status tracking
	let feedStatusMap = $state<Map<string, { feedId: string | null; feedTitle: string | null; waitlistCount: number; subscribedCount: number; isFeedCreated: boolean }>>(new Map());

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

	onMount(() => {
		// Add global click handler to close dropdown
		document.addEventListener('click', handleGlobalClick);

		// Load data asynchronously
		(async () => {
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
			await loadExistingFeeds();
		})();

		return () => {
			document.removeEventListener('click', handleGlobalClick);
		};
	});

	async function loadExistingFeeds() {
		const { data, error } = await supabase
			.from('feeds')
			.select('id, title, url')
			.order('title', { ascending: true });

		if (!error && data) {
			existingFeeds = data;
		}
	}

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
			// Load feed status for each suggestion
			await loadFeedStatuses(data);
		}

		loading = false;
	}

	async function loadFeedStatuses(suggestionsList: any[]) {
		const newStatusMap = new Map<string, { feedId: string | null; feedTitle: string | null; waitlistCount: number; subscribedCount: number; isFeedCreated: boolean }>();

		// Load status for each suggestion in parallel
		await Promise.all(
			suggestionsList.map(async (suggestion) => {
				try {
					const { data, error } = await supabase.rpc('get_suggestion_feed_status', {
						p_suggestion_id: suggestion.id
					});

					if (!error && data && data.length > 0) {
						newStatusMap.set(suggestion.id, {
							feedId: data[0].feed_id,
							feedTitle: data[0].feed_title,
							waitlistCount: data[0].waitlist_count,
							subscribedCount: data[0].subscribed_count,
							isFeedCreated: data[0].is_feed_created ?? false
						});
					} else {
						// Try to get just the waitlist count
						const { data: countData } = await supabase.rpc('get_waitlist_count', {
							p_feed_url: suggestion.feed_url
						});
						newStatusMap.set(suggestion.id, {
							feedId: null,
							feedTitle: null,
							waitlistCount: countData || 0,
							subscribedCount: 0,
							isFeedCreated: false
						});
					}
				} catch (err) {
					console.error('Error loading feed status:', err);
				}
			})
		);

		feedStatusMap = newStatusMap;
	}

	function showApproveForm(suggestionId: string) {
		approvingWithFeedId = suggestionId;
		approvalFeedIdInput = '';
		approvalError = '';
		feedSearchQuery = '';
		dropdownOpen = false;
	}

	function selectFeed(feedId: string) {
		approvalFeedIdInput = feedId;
		dropdownOpen = false;
		feedSearchQuery = '';
	}

	function getSelectedFeedDisplay(): string {
		if (!approvalFeedIdInput) return '';
		const feed = existingFeeds.find(f => f.id === approvalFeedIdInput);
		if (!feed) return approvalFeedIdInput;
		return `${feed.title || feed.url} (${feed.id.slice(0, 8)}...)`;
	}

	function openFoloForFeed(feedUrl: string) {
		window.open(
			`https://app.folo.is/discover?type=rss&url=${encodeURIComponent(feedUrl)}`,
			'_blank'
		);
	}

	function cancelApprove() {
		approvingWithFeedId = null;
		approvalFeedIdInput = '';
		approvalError = '';
		feedSearchQuery = '';
		dropdownOpen = false;
	}

	async function confirmApprove(suggestionId: string) {
		if (!approvalFeedIdInput.trim()) {
			approvalError = 'Feed ID is required before approving';
			return;
		}

		approvingIds = new Set(approvingIds).add(suggestionId);
		approvalError = '';

		try {
			// Find the suggestion to get the URL
			const suggestion = suggestions.find((s) => s.id === suggestionId);
			if (!suggestion) {
				approvalError = 'Suggestion not found';
				return;
			}

			// First, link the feed ID to the waitlist (with title from suggestion)
			const { error: linkError } = await supabase.rpc('link_feed_to_waitlist', {
				p_feed_url: suggestion.feed_url,
				p_feed_id: approvalFeedIdInput.trim(),
				p_feed_title: suggestion.feed_title || null
			});

			if (linkError) throw linkError;

			// Then approve the suggestion
			const { error } = await supabase.rpc('approve_feed_suggestion', {
				p_suggestion_id: suggestionId
			});

			if (error) throw error;

			// Reload suggestions
			await loadSuggestions();
			approvingWithFeedId = null;
			approvalFeedIdInput = '';
		} catch (err: any) {
			console.error('Error approving suggestion:', err);
			approvalError = err.message || 'Failed to approve suggestion';
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

	function showLinkFeedForm(suggestionId: string) {
		linkingFeedId = suggestionId;
		feedIdInput = '';
		linkError = '';
	}

	function cancelLinkFeed() {
		linkingFeedId = null;
		feedIdInput = '';
		linkError = '';
	}

	async function confirmLinkFeed(suggestionId: string) {
		if (!feedIdInput.trim()) {
			linkError = 'Please enter a feed ID';
			return;
		}

		linkingInProgress = true;
		linkError = '';

		try {
			// Find the suggestion to get the URL
			const suggestion = suggestions.find((s) => s.id === suggestionId);
			if (!suggestion) {
				linkError = 'Suggestion not found';
				return;
			}

			const { data, error } = await supabase.rpc('link_feed_to_waitlist', {
				p_feed_url: suggestion.feed_url,
				p_feed_id: feedIdInput.trim(),
				p_feed_title: suggestion.feed_title || null
			});

			if (error) throw error;

			// Reload to show updated status
			await loadSuggestions();
			linkingFeedId = null;
			feedIdInput = '';
		} catch (err: any) {
			console.error('Error linking feed:', err);
			linkError = err.message || 'Failed to link feed';
		} finally {
			linkingInProgress = false;
		}
	}
</script>

<!-- Mobile Header -->
{#if !isDesktopMode}
	<MobileHeader onMenuClick={() => (isSidebarOpen = true)} />
{/if}

<!-- Mobile Sidebar -->
{#if !isDesktopMode && isSidebarOpen}
	<Sidebar isMobileOpen={true} onMobileClose={() => (isSidebarOpen = false)} />
{/if}

<div class="flex h-screen bg-background {!isDesktopMode ? 'pt-14' : ''}">
	<!-- Desktop Sidebar -->
	{#if isDesktopMode}
		<Sidebar />
	{/if}

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-7xl mx-auto px-4 py-8">
			<!-- Header -->
			<div class="mb-8">
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
								<div class="flex items-center gap-2 mb-2 flex-wrap">
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
									<!-- Waitlist count badge -->
									{#if feedStatusMap.get(suggestion.id)?.waitlistCount}
										<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-secondary/20 text-secondary flex items-center gap-1">
											<Users size={12} />
											{feedStatusMap.get(suggestion.id)?.waitlistCount} waiting
										</span>
									{/if}
									<!-- Linked/Feed status badge -->
									{#if feedStatusMap.get(suggestion.id)?.feedId}
										{#if feedStatusMap.get(suggestion.id)?.isFeedCreated}
											<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-green-500/20 text-green-400 flex items-center gap-1">
												<Link size={12} />
												Feed created
												{#if feedStatusMap.get(suggestion.id)?.subscribedCount}
													({feedStatusMap.get(suggestion.id)?.subscribedCount} subscribed)
												{/if}
											</span>
										{:else}
											<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-purple-500/20 text-purple-400 flex items-center gap-1" title="Feed ID: {feedStatusMap.get(suggestion.id)?.feedId}">
												<Link size={12} />
												Linked (pending)
											</span>
										{/if}
									{/if}
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
										onclick={() => showApproveForm(suggestion.id)}
										disabled={approvingIds.has(suggestion.id) ||
											rejectingIds.has(suggestion.id) ||
											approvingWithFeedId === suggestion.id}
										class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
										title="Approve with feed ID"
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

								<!-- Link Feed Button (for approved suggestions - both new and edit) -->
								{#if suggestion.status === 'approved' && !feedStatusMap.get(suggestion.id)?.isFeedCreated}
									<button
										onclick={() => {
											linkingFeedId = suggestion.id;
											feedIdInput = feedStatusMap.get(suggestion.id)?.feedId || '';
											linkError = '';
										}}
										disabled={linkingFeedId === suggestion.id}
										class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
										title={feedStatusMap.get(suggestion.id)?.feedId ? "Edit linked feed ID" : "Link feed ID"}
									>
										<Link size={16} />
										{feedStatusMap.get(suggestion.id)?.feedId ? 'Edit Link' : 'Link Feed'}
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

						<!-- Inline Approval Form with Feed ID -->
						{#if approvingWithFeedId === suggestion.id}
							<div class="mt-4 p-4 bg-green-500/5 rounded-lg border border-green-500/20">
								<span class="block text-sm font-medium text-foreground mb-3">
									Link to Feed
								</span>

								<!-- Option 1: Select from existing feeds -->
								<div class="mb-4">
									<p class="text-xs text-muted-foreground mb-2">Select from existing feeds:</p>
									<div class="relative" bind:this={dropdownRef}>
										<!-- Selected value display / trigger -->
										<button
											type="button"
											onclick={() => dropdownOpen = !dropdownOpen}
											class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center justify-between text-left"
										>
											<span class={approvalFeedIdInput ? 'text-foreground' : 'text-muted-foreground'}>
												{approvalFeedIdInput ? getSelectedFeedDisplay() : 'Select a feed...'}
											</span>
											<ChevronDown size={16} class="text-muted-foreground transition-transform {dropdownOpen ? 'rotate-180' : ''}" />
										</button>

										<!-- Dropdown panel -->
										{#if dropdownOpen}
											<div class="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
												<!-- Search input -->
												<div class="p-2 border-b border-border">
													<div class="relative">
														<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
														<input
															type="text"
															bind:value={feedSearchQuery}
															placeholder="Search feeds..."
															class="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
														/>
													</div>
												</div>

												<!-- Scrollable feed list -->
												<div class="max-h-60 overflow-y-auto">
													{#if filteredFeeds.length === 0}
														<div class="px-3 py-4 text-sm text-muted-foreground text-center">
															No feeds found
														</div>
													{:else}
														{#each filteredFeeds as feed}
															<button
																type="button"
																onclick={() => selectFeed(feed.id)}
																class="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex flex-col gap-0.5 {approvalFeedIdInput === feed.id ? 'bg-accent/50' : ''}"
															>
																<span class="text-sm text-foreground truncate">
																	{feed.title || feed.url}
																</span>
																<span class="text-xs text-muted-foreground truncate">
																	{feed.id}
																</span>
															</button>
														{/each}
													{/if}
												</div>
											</div>
										{/if}
									</div>
								</div>

								<!-- Divider -->
								<div class="flex items-center gap-3 mb-4">
									<div class="flex-1 border-t border-border"></div>
									<span class="text-xs text-muted-foreground">OR</span>
									<div class="flex-1 border-t border-border"></div>
								</div>

								<!-- Option 2: Add via Folo -->
								<div class="mb-4">
									<p class="text-xs text-muted-foreground mb-2">Add new feed via Folo:</p>
									<div class="flex gap-2 items-center">
										<button
											type="button"
											onclick={() => openFoloForFeed(suggestion.feed_url)}
											class="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors font-medium flex items-center gap-2 text-sm"
										>
											<Link size={16} />
											Open in Folo
										</button>
										<input
											type="text"
											bind:value={approvalFeedIdInput}
											placeholder="Paste feed ID here..."
											class="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
										/>
										<button
											type="button"
											onclick={loadExistingFeeds}
											class="px-3 py-2 text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors text-sm"
											title="Refresh feed list"
										>
											↻
										</button>
									</div>
								</div>

								{#if approvalError}
									<p class="text-sm text-red-500 mb-3">{approvalError}</p>
								{/if}
								<p class="text-xs text-muted-foreground mb-3">
									Users will be auto-subscribed immediately after approval.
								</p>
								<div class="flex gap-2 mt-3">
									<button
										onclick={() => confirmApprove(suggestion.id)}
										disabled={approvingIds.has(suggestion.id)}
										class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
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
											Approving...
										{:else}
											<ThumbsUp size={16} />
											Confirm Approve
										{/if}
									</button>
									<button
										onclick={cancelApprove}
										disabled={approvingIds.has(suggestion.id)}
										class="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}

						<!-- Inline Link Feed Form (for editing after approval) -->
						{#if linkingFeedId === suggestion.id}
							<div class="mt-4 p-4 bg-purple-500/5 rounded-lg border border-purple-500/20">
								<label for="feedIdInput-{suggestion.id}" class="block text-sm font-medium text-foreground mb-2">
									Feed ID from Folo
								</label>
								<input
									id="feedIdInput-{suggestion.id}"
									type="text"
									bind:value={feedIdInput}
									placeholder="Paste the feed ID here..."
									class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
								/>
								{#if linkError}
									<p class="text-sm text-red-500 mt-2">{linkError}</p>
								{/if}
								<p class="text-xs text-muted-foreground mt-2">
									{#if feedStatusMap.get(suggestion.id)?.feedId}
										Currently linked to: <code class="bg-background px-1 rounded">{feedStatusMap.get(suggestion.id)?.feedId}</code>
									{:else}
										When the feed is created in Supabase, users will be auto-subscribed.
									{/if}
								</p>
								<div class="flex gap-2 mt-3">
									<button
										onclick={() => confirmLinkFeed(suggestion.id)}
										disabled={linkingInProgress}
										class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
									>
										{#if linkingInProgress}
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
											{feedStatusMap.get(suggestion.id)?.feedId ? 'Updating...' : 'Linking...'}
										{:else}
											<Link size={16} />
											{feedStatusMap.get(suggestion.id)?.feedId ? 'Update Link' : 'Link Feed'}
										{/if}
									</button>
									<button
										onclick={cancelLinkFeed}
										disabled={linkingInProgress}
										class="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}

						<!-- Inline Rejection Form -->
						{#if rejectingWithReasonId === suggestion.id}
							<div class="mt-4 p-4 bg-red-500/5 rounded-lg border border-red-500/20">
								<label for="rejectionReason-{suggestion.id}" class="block text-sm font-medium text-foreground mb-2">
									Rejection Reason (optional)
								</label>
								<textarea
									id="rejectionReason-{suggestion.id}"
									bind:value={rejectionReason}
									rows="3"
									placeholder="Why are you rejecting this suggestion?"
									class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								></textarea>
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
</div>
