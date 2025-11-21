<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Search, Plus, Check } from 'lucide-svelte';
	import SuggestFeedModal from '$lib/components/SuggestFeedModal.svelte';
	import type { Database } from '$lib/types/database';

	type DiscoveryFeed = Database['public']['Functions']['get_discovery_feeds']['Returns'][0];

	let feeds = $state<DiscoveryFeed[]>([]);
	let subscribedFeedIds = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let selectedCategory = $state<string>('');
	let categories = $state<string[]>([]);
	let allCategories = $state<string[]>([]); // Store all categories regardless of filters
	let loading = $state(true);
	let subscribingIds = $state<Set<string>>(new Set());

	// Suggestion feature
	let suggestModalOpen = $state(false);

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		await loadFeeds();
	});

	async function loadFeeds() {
		loading = true;

		// Load all categories (without filter) if not already loaded
		if (allCategories.length === 0) {
			const { data: allFeedsData } = await supabase.rpc('get_discovery_feeds', {
				search_query: undefined,
				category_filter: undefined,
				limit_param: 1000,
				offset_param: 0
			});

			if (allFeedsData) {
				const uniqueCategories = new Set(allFeedsData.map(f => f.feed_category).filter(Boolean));
				allCategories = Array.from(uniqueCategories).sort();
			}
		}

		// Load discovery feeds with filters
		const { data: feedsData, error: feedsError } = await supabase.rpc('get_discovery_feeds', {
			search_query: searchQuery || undefined,
			category_filter: selectedCategory || undefined,
			limit_param: 100,
			offset_param: 0
		});

		if (feedsError) {
			console.error('Error loading feeds:', feedsError);
		} else if (feedsData) {
			feeds = feedsData;
		}

		// Load user's subscriptions
		if ($user) {
			const { data: subs } = await supabase
				.from('user_subscriptions')
				.select('feed_id')
				.eq('user_id', $user.id);

			if (subs) {
				subscribedFeedIds = new Set(subs.map(s => s.feed_id));
			}
		}

		loading = false;
	}

	async function toggleSubscription(feedId: string) {
		if (!$user) return;

		// Add to subscribing set
		subscribingIds = new Set(subscribingIds).add(feedId);

		const isSubscribed = subscribedFeedIds.has(feedId);

		if (isSubscribed) {
			// Unsubscribe
			const { error } = await supabase
				.from('user_subscriptions')
				.delete()
				.eq('user_id', $user.id)
				.eq('feed_id', feedId);

			if (!error) {
				const newSet = new Set(subscribedFeedIds);
				newSet.delete(feedId);
				subscribedFeedIds = newSet;
			}
		} else {
			// Subscribe
			const { error } = await supabase
				.from('user_subscriptions')
				.insert({
					user_id: $user.id,
					feed_id: feedId
				});

			if (!error) {
				subscribedFeedIds = new Set(subscribedFeedIds).add(feedId);
			}
		}

		// Remove from subscribing set
		const newSubscribingSet = new Set(subscribingIds);
		newSubscribingSet.delete(feedId);
		subscribingIds = newSubscribingSet;
	}

	async function handleSearch() {
		await loadFeeds();
	}

	async function filterByCategory(category: string) {
		selectedCategory = category === selectedCategory ? '' : category;
		await loadFeeds();
	}
</script>

<div class="min-h-screen bg-background">
	<div class="max-w-7xl mx-auto px-4 py-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-foreground mb-2">Discover Feeds</h1>
			<p class="text-muted-foreground">Browse and subscribe to RSS feeds</p>
		</div>

		<!-- Search -->
		<div class="mb-6">
			<form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="relative">
				<Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
				<input
					type="text"
					bind:value={searchQuery}
					onkeyup={handleSearch}
					placeholder="Search feeds..."
					class="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				/>
			</form>
		</div>

		<!-- Categories -->
		{#if allCategories.length > 0}
			<div class="mb-8">
				<div class="flex flex-wrap gap-2">
					<button
						onclick={() => filterByCategory('')}
						class="px-4 py-2 rounded-full text-sm font-medium transition-colors {selectedCategory === '' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-accent'}"
					>
						All
					</button>
					{#each allCategories as category}
						<button
							onclick={() => filterByCategory(category)}
							class="px-4 py-2 rounded-full text-sm font-medium transition-colors {selectedCategory === category ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-accent'}"
						>
							{category}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Feeds Grid -->
		{#if loading}
			<div class="text-center py-12">
				<p class="text-muted-foreground">Loading feeds...</p>
			</div>
		{:else if feeds.length === 0}
			<div class="text-center py-12">
				<p class="text-muted-foreground">No feeds found</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each feeds as feed}
					<div class="bg-card border border-border rounded-lg p-6 hover:border-primary transition-colors flex flex-col">
						<div class="flex items-start justify-between mb-4">
							<div class="flex-1 min-w-0">
								{#if feed.feed_image}
									<img
										src={feed.feed_image}
										alt={feed.feed_title}
										class="w-12 h-12 rounded-lg object-cover mb-3"
										onerror={(e) => {
											if (!e.target.dataset.fallbackAttempted) {
												e.target.dataset.fallbackAttempted = 'true';
												e.target.src = feed.feed_site_url
													? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=128`
													: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
											} else {
												e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
											}
										}}
									/>
								{:else if feed.feed_site_url}
									<img
										src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=128`}
										alt={feed.feed_title}
										class="w-12 h-12 rounded-lg object-cover mb-3"
										onerror={(e) => {
											e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
										}}
									/>
								{:else}
									<div class="w-12 h-12 rounded-lg mb-3 flex items-center justify-center bg-accent/10">
										<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2">
											<path d="M4 11a9 9 0 0 1 9 9"/>
											<path d="M4 4a16 16 0 0 1 16 16"/>
											<circle cx="5" cy="19" r="1"/>
										</svg>
									</div>
								{/if}
								<h3 class="font-semibold text-foreground mb-1 truncate">
									{feed.feed_title || 'Untitled Feed'}
								</h3>
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									<span class="px-2 py-0.5 bg-accent/10 text-accent rounded">
										{feed.feed_category || 'Other'}
									</span>
									<span>
										{feed.subscriber_count || 0} subscribers
									</span>
								</div>
							</div>
						</div>

						<div class="flex-1 flex flex-col">
							{#if feed.feed_description}
								<p class="text-sm text-muted-foreground mb-4 line-clamp-2">
									{feed.feed_description}
								</p>
							{/if}

							{#if feed.feed_site_url}
								<a
									href={feed.feed_site_url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-xs text-primary hover:text-primary/90 mb-4 block truncate"
								>
									{feed.feed_site_url}
								</a>
							{/if}
						</div>

						<button
							onclick={() => toggleSubscription(feed.feed_id)}
							disabled={subscribingIds.has(feed.feed_id)}
							class="w-full py-2 px-4 rounded-md font-medium text-sm transition-all duration-200 {subscribedFeedIds.has(feed.feed_id) ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							{#if subscribingIds.has(feed.feed_id)}
								<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								{subscribedFeedIds.has(feed.feed_id) ? 'Unsubscribing...' : 'Subscribing...'}
							{:else if subscribedFeedIds.has(feed.feed_id)}
								<Check size={16} />
								Subscribed
							{:else}
								<Plus size={16} />
								Subscribe
							{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Can't find feed message -->
		<div class="mt-8 text-center py-8 border-t border-border">
			<p class="text-muted-foreground mb-3">Can't see the feed you're looking for?</p>
			<button
				onclick={() => (suggestModalOpen = true)}
				class="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
			>
				<Plus size={20} />
				Suggest a Feed
			</button>
		</div>

		<!-- Navigation to Timeline -->
		{#if subscribedFeedIds.size > 0}
			<div class="fixed bottom-8 right-8">
				<a
					href="/timeline/all"
					class="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium shadow-lg hover:bg-primary/90 transition-colors inline-block"
				>
					Go to Timeline →
				</a>
			</div>
		{/if}
	</div>
</div>

<!-- Suggest Feed Modal -->
<SuggestFeedModal bind:isOpen={suggestModalOpen} />
