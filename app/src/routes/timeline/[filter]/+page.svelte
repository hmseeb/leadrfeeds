<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import EntryCard from '$lib/components/EntryCard.svelte';
	import AIChat from '$lib/components/AIChat.svelte';
	import type { Database } from '$lib/types/database';

	type TimelineEntry = Database['public']['Functions']['get_user_timeline']['Returns'][0];

	let entries = $state<TimelineEntry[]>([]);
	let loading = $state(true);
	let hasMore = $state(true);
	let offset = $state(0);
	const limit = 20;

	let filter = $state('');
	let activeFeedId = $state<string | null>(null);
	let selectedEntry = $state<TimelineEntry | null>(null);
	let feeds = $state<any[]>([]);
	let currentFeed = $state<{ feed_id: string; feed_title: string } | null>(null);

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		filter = $page.params.filter;
		await loadFeeds();
		await loadEntries();
	});

	async function loadFeeds() {
		if (!$user) return;

		const { data, error } = await supabase
			.from('user_subscriptions')
			.select('feeds(id, title, description, category)')
			.eq('user_id', $user.id);

		if (!error && data) {
			feeds = data.map((sub: any) => sub.feeds).filter(Boolean);
		}
	}

	$effect(() => {
		// Watch for route changes (skip initial load which is handled by onMount)
		const currentFilter = $page.params.filter;
		if (currentFilter && currentFilter !== filter && filter !== '') {
			filter = currentFilter;
			resetAndLoad();
		}
	});

	async function resetAndLoad() {
		entries = [];
		offset = 0;
		hasMore = true;
		selectedEntry = null; // Clear selected entry when switching views
		await loadEntries();
	}

	async function loadEntries() {
		if (!$user) return;

		loading = true;

		// Parse filter: "all", "starred", or a feed UUID
		let feedIdFilter: string | undefined;
		let starredOnly = false;
		let unreadOnly = false;

		if (filter === 'starred') {
			starredOnly = true;
			activeFeedId = null; // Clear feed ID in starred view
			currentFeed = null;
		} else if (filter !== 'all') {
			// Assume it's a feed UUID
			feedIdFilter = filter;
			activeFeedId = feedIdFilter;
			// Find the feed from the loaded feeds
			const feed = feeds.find((f) => f.id === feedIdFilter);
			currentFeed = feed ? { feed_id: feed.id, feed_title: feed.title } : null;
		} else {
			// Clear feed ID in "all" view
			activeFeedId = null;
			currentFeed = null;
		}

		const { data, error } = await supabase.rpc('get_user_timeline', {
			user_id_param: $user.id,
			feed_id_filter: feedIdFilter,
			starred_only: starredOnly,
			unread_only: unreadOnly,
			limit_param: limit,
			offset_param: offset
		});

		if (error) {
			console.error('Error loading entries:', error);
		} else if (data) {
			// Clean up feed_image URLs by removing trailing slashes
			const cleanedData = data.map(entry => ({
				...entry,
				feed_image: entry.feed_image?.replace(/\/+$/, '') || null
			}));
			entries = [...entries, ...cleanedData];
			hasMore = data.length === limit;
			offset += data.length;
		}

		loading = false;
	}

	async function handleToggleStar(entryId: string) {
		if (!$user) return;

		const { data, error } = await supabase.rpc('toggle_entry_star', {
			entry_id_param: entryId,
			user_id_param: $user.id
		});

		if (!error && data !== null) {
			// Update local state
			entries = entries.map(e =>
				e.entry_id === entryId ? { ...e, is_starred: data } : e
			);

			if (selectedEntry?.entry_id === entryId) {
				selectedEntry = { ...selectedEntry, is_starred: data };
			}
		}
	}

	async function handleMarkRead(entryId: string) {
		if (!$user) return;

		const { error } = await supabase.rpc('mark_entry_read', {
			entry_id_param: entryId,
			user_id_param: $user.id
		});

		if (!error) {
			// Update local state
			entries = entries.map(e =>
				e.entry_id === entryId ? { ...e, is_read: true } : e
			);

			if (selectedEntry?.entry_id === entryId) {
				selectedEntry = { ...selectedEntry, is_read: true };
			}
		}
	}

	function handleEntryClick(entry: TimelineEntry) {
		selectedEntry = entry;
	}

	function closeEntryDetail() {
		selectedEntry = null;
	}

	async function loadMore() {
		if (!loading && hasMore) {
			await loadEntries();
		}
	}
</script>

<div class="flex h-screen bg-background">
	<!-- Sidebar -->
	<Sidebar {activeFeedId} />

	<!-- Main Content -->
	<div class="flex-1 flex overflow-hidden">
		<!-- Timeline -->
		<div class="flex-1 overflow-y-auto">
			<div class="max-w-3xl mx-auto p-6">
				<!-- Header -->
				<div class="mb-6">
					<h1 class="text-2xl font-bold text-foreground">
						{#if filter === 'all'}
							All Posts
						{:else if filter === 'starred'}
							Starred Posts
						{:else}
							Feed Posts
						{/if}
					</h1>
				</div>

				<!-- Entries -->
				{#if loading && entries.length === 0}
					<div class="text-center py-12">
						<p class="text-muted-foreground">Loading posts...</p>
					</div>
				{:else if entries.length === 0}
					<div class="text-center py-12">
						<p class="text-muted-foreground">No posts found</p>
						{#if filter !== 'all'}
							<a href="/timeline/all" class="text-primary hover:text-primary/90 mt-2 inline-block">
								View all posts
							</a>
						{/if}
					</div>
				{:else}
					<div class="space-y-4">
						{#each entries as entry (entry.entry_id)}
							<EntryCard
								{entry}
								onToggleStar={handleToggleStar}
								onMarkRead={handleMarkRead}
								onClick={handleEntryClick}
							/>
						{/each}
					</div>

					{#if hasMore}
						<div class="text-center py-6">
							<button
								onclick={loadMore}
								disabled={loading}
								class="px-6 py-2 bg-card border border-border rounded-lg text-foreground hover:border-primary transition-colors disabled:opacity-50"
							>
								{loading ? 'Loading...' : 'Load More'}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Entry Detail Panel -->
		{#if selectedEntry}
			<div class="w-[600px] border-l border-border bg-card overflow-y-auto">
				<div class="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
					<h2 class="font-semibold text-foreground">Article</h2>
					<button
						onclick={closeEntryDetail}
						class="text-muted-foreground hover:text-foreground transition-colors"
					>
						✕
					</button>
				</div>

				<div class="p-6">
					<!-- Feed Info -->
					<div class="flex items-center gap-3 mb-4">
						{#if selectedEntry.feed_image}
							<img
								src={selectedEntry.feed_image}
								alt={selectedEntry.feed_title}
								class="w-8 h-8 rounded object-cover"
								onerror={(e) => {
									if (!e.target.dataset.fallbackAttempted) {
										e.target.dataset.fallbackAttempted = 'true';
										e.target.src = selectedEntry.entry_url
											? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry.entry_url)}&size=64`
											: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
									} else {
										e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
									}
								}}
							/>
						{:else if selectedEntry.entry_url}
							<img
								src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry.entry_url)}&size=64`}
								alt={selectedEntry.feed_title}
								class="w-8 h-8 rounded object-cover"
								onerror={(e) => {
									e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
								}}
							/>
						{:else}
							<div class="w-8 h-8 rounded flex items-center justify-center bg-accent/10">
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2">
									<path d="M4 11a9 9 0 0 1 9 9"/>
									<path d="M4 4a16 16 0 0 1 16 16"/>
									<circle cx="5" cy="19" r="1"/>
								</svg>
							</div>
						{/if}
						<div>
							<div class="font-medium text-foreground">{selectedEntry.feed_title}</div>
							<div class="text-sm text-muted-foreground">
								{selectedEntry.feed_category}
							</div>
						</div>
					</div>

					<!-- Title -->
					<h1 class="text-2xl font-bold text-foreground mb-4">
						{selectedEntry.entry_title || 'Untitled Entry'}
					</h1>

					<!-- Metadata -->
					<div class="flex items-center gap-3 text-sm text-muted-foreground mb-6">
						{#if selectedEntry.entry_author}
							<span>{selectedEntry.entry_author}</span>
							<span>•</span>
						{/if}
						<span>{new Date(selectedEntry.entry_published_at).toLocaleDateString()}</span>
					</div>

					<!-- Actions -->
					<div class="flex gap-2 mb-6">
						<button
							onclick={() => handleToggleStar(selectedEntry!.entry_id)}
							class="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors flex items-center gap-2"
						>
							<span class={selectedEntry.is_starred ? 'text-accent' : ''}>★</span>
							{selectedEntry.is_starred ? 'Unstar' : 'Star'}
						</button>

						{#if selectedEntry.entry_url}
							<a
								href={selectedEntry.entry_url}
								target="_blank"
								rel="noopener noreferrer"
								class="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							>
								Open Original →
							</a>
						{/if}
					</div>

					<!-- Content -->
					<div class="prose prose-invert max-w-none">
						{#if selectedEntry.entry_content}
							{@html selectedEntry.entry_content}
						{:else if selectedEntry.entry_description}
							<p>{selectedEntry.entry_description}</p>
						{:else}
							<p class="text-muted-foreground">No content available</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- AI Chat Panel -->
		<AIChat
			contextType={selectedEntry ? 'entry' : 'feed'}
			contextId={selectedEntry?.entry_id || activeFeedId}
			currentView={filter === 'all' ? 'all' : filter === 'starred' ? 'starred' : 'feed'}
			currentCategory={activeFeedId ? entries[0]?.feed_category || null : null}
			{currentFeed}
			currentEntry={selectedEntry
				? {
						entry_id: selectedEntry.entry_id,
						entry_title: selectedEntry.entry_title,
						entry_content: selectedEntry.entry_content,
						entry_description: selectedEntry.entry_description,
						entry_author: selectedEntry.entry_author,
						entry_published_at: selectedEntry.entry_published_at
					}
				: null}
			timelineEntries={entries}
			{feeds}
		/>
	</div>
</div>
