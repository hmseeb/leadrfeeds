<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Settings, LogOut, Search, ChevronDown } from 'lucide-svelte';

	interface FeedWithUnread {
		feed_id: string;
		feed_title: string;
		feed_category: string;
		feed_image: string | null;
		feed_site_url: string | null;
		unread_count: number;
	}

	let { activeFeedId = null, activeCategory = null }: { activeFeedId?: string | null; activeCategory?: string | null } = $props();

	let feeds = $state<FeedWithUnread[]>([]);
	let totalUnread = $state(0);
	let currentPath = $state('');
	let expandedFeeds = $state<Set<string>>(new Set());

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		currentPath = window.location.pathname;
		await loadFeeds();

		// Reload feeds every 30 seconds
		const interval = setInterval(loadFeeds, 30000);
		return () => clearInterval(interval);
	});

	async function loadFeeds() {
		if (!$user) return;

		// Get user's subscribed feeds with unread counts
		const { data: userFeeds, error: feedsError } = await supabase
			.from('user_subscriptions')
			.select(`
				feed_id,
				feeds:feed_id (
					id,
					title,
					category,
					image,
					site_url
				)
			`)
			.eq('user_id', $user.id)
			.order('subscribed_at', { ascending: false });

		if (feedsError) {
			console.error('Error loading feeds:', feedsError);
			return;
		}

		// Get unread counts
		const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
			user_id_param: $user.id
		});

		if (unreadError) {
			console.error('Error loading unread counts:', unreadError);
			return;
		}

		const unreadMap = new Map(unreadData?.map(u => [u.feed_id, u.unread_count]) || []);

		// Build feeds list
		feeds = userFeeds
			.filter(uf => uf.feeds)
			.map(uf => {
				const feed = Array.isArray(uf.feeds) ? uf.feeds[0] : uf.feeds;
				return {
					feed_id: feed.id,
					feed_title: feed.title || 'Untitled Feed',
					feed_category: feed.category || 'Other',
					feed_image: feed.image?.replace(/\/+$/, '') || null,
					feed_site_url: feed.site_url || null,
					unread_count: unreadMap.get(feed.id) || 0
				};
			});

		totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0);
	}

	async function handleSignOut() {
		await signOut();
		goto('/auth/login');
	}

	function toggleFeedCategory(feedId: string) {
		const newExpanded = new Set(expandedFeeds);
		if (newExpanded.has(feedId)) {
			newExpanded.delete(feedId);
		} else {
			newExpanded.add(feedId);
		}
		expandedFeeds = newExpanded;
	}

	function getCategoryFeeds(category: string) {
		return feeds.filter(f => f.feed_category === category);
	}

	function getOtherCategoryFeeds(category: string, excludeFeedId: string) {
		return feeds.filter(f => f.feed_category === category && f.feed_id !== excludeFeedId);
	}
</script>

<div class="w-64 bg-[#1a1a1a] flex flex-col h-screen text-gray-200">
	<!-- Header -->
	<div class="p-4 flex items-center justify-between border-b border-gray-800">
		<h1 class="text-lg font-semibold">LeadrFeeds</h1>
	</div>

	<!-- Navigation -->
	<nav class="flex-1 overflow-y-auto">
		<!-- Main Navigation -->
		<div class="px-2 py-3 space-y-0.5">
			<a
				href="/timeline/all"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors {currentPath === '/timeline/all' ? 'bg-gray-800' : ''}"
			>
				<Home size={18} class="text-gray-400" />
				<span class="flex-1">All Posts</span>
				{#if totalUnread > 0}
					<span class="text-xs text-gray-400">{totalUnread}</span>
				{/if}
			</a>

			<a
				href="/timeline/starred"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors {currentPath === '/timeline/starred' ? 'bg-gray-800' : ''}"
			>
				<Star size={18} class="text-gray-400" />
				<span>Starred</span>
			</a>

			<a
				href="/discover"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors {currentPath === '/discover' ? 'bg-gray-800' : ''}"
			>
				<Search size={18} class="text-gray-400" />
				<span>Discover</span>
			</a>
		</div>

		<!-- Divider -->
		<div class="mx-4 my-2 border-t border-gray-800"></div>

		<!-- Feeds Section Header -->
		<div class="px-4 py-2">
			<h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Feeds</h2>
		</div>

		<!-- Flat Feed List -->
		{#if feeds.length > 0}
			<div class="px-2 space-y-0.5">
				{#each feeds as feed}
					{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
					{@const isMultiFeedCategory = categoryFeeds.length > 1}
					<div>
						<!-- Main Feed Item -->
						<div class="flex items-center gap-2 group">
							<a
								href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
								class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800' : ''}"
							>
								{#if feed.feed_image}
									<img
										src={feed.feed_image}
										alt={feed.feed_title}
										class="w-5 h-5 rounded object-cover flex-shrink-0"
										onerror={(e) => {
											if (!e.target.dataset.fallbackAttempted) {
												e.target.dataset.fallbackAttempted = 'true';
												e.target.src = feed.feed_site_url
													? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`
													: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
											}
										}}
									/>
								{:else if feed.feed_site_url}
									<img
										src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`}
										alt={feed.feed_title}
										class="w-5 h-5 rounded object-cover flex-shrink-0"
										onerror={(e) => {
											e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
										}}
									/>
								{:else}
									<div class="w-5 h-5 rounded flex items-center justify-center bg-gray-700 flex-shrink-0">
										<div class="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
									</div>
								{/if}
								<span class="flex-1 truncate text-sm">{feed.feed_title}</span>
								{#if feed.unread_count > 0}
									<span class="text-xs text-gray-400 min-w-[20px] text-right">{feed.unread_count}</span>
								{/if}
							</a>

							<!-- More Button (show only if there are other feeds in the same category) -->
							{#if isMultiFeedCategory}
								<button
									onclick={() => toggleFeedCategory(feed.feed_id)}
									class="p-1.5 hover:bg-gray-800 rounded-md transition-colors opacity-0 group-hover:opacity-100"
									title="Show individual feeds"
								>
									<ChevronDown
										size={14}
										class="text-gray-400 transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}"
									/>
								</button>
							{/if}
						</div>

						<!-- Expanded Category Feeds -->
						{#if expandedFeeds.has(feed.feed_id)}
							{@const allCategoryFeeds = getCategoryFeeds(feed.feed_category)}
							<div class="ml-10 mt-0.5 mb-1 space-y-0.5">
								<!-- All Feeds in Category -->
								{#each allCategoryFeeds as categoryFeed}
									<a
										href="/timeline/{categoryFeed.feed_id}"
										class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-gray-800 transition-colors text-gray-400 {activeFeedId === categoryFeed.feed_id ? 'bg-gray-800 text-gray-200' : ''}"
									>
										{#if categoryFeed.feed_image}
											<img
												src={categoryFeed.feed_image}
												alt={categoryFeed.feed_title}
												class="w-4 h-4 rounded object-cover flex-shrink-0"
												onerror={(e) => {
													if (!e.target.dataset.fallbackAttempted) {
														e.target.dataset.fallbackAttempted = 'true';
														e.target.src = categoryFeed.feed_site_url
															? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`
															: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
													}
												}}
											/>
										{:else if categoryFeed.feed_site_url}
											<img
												src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`}
												alt={categoryFeed.feed_title}
												class="w-4 h-4 rounded object-cover flex-shrink-0"
												onerror={(e) => {
													e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
												}}
											/>
										{:else}
											<div class="w-4 h-4 rounded flex items-center justify-center bg-gray-700 flex-shrink-0">
												<div class="w-2 h-2 rounded-full bg-gray-500"></div>
											</div>
										{/if}
										<span class="flex-1 truncate">{categoryFeed.feed_title}</span>
										{#if categoryFeed.unread_count > 0}
											<span class="text-xs">{categoryFeed.unread_count}</span>
										{/if}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</nav>

	<!-- Footer -->
	<div class="p-2 border-t border-gray-800 space-y-0.5">
		<a
			href="/settings"
			class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
		>
			<Settings size={18} class="text-gray-400" />
			<span>Settings</span>
		</a>

		<button
			onclick={handleSignOut}
			class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
		>
			<LogOut size={18} class="text-gray-400" />
			<span>Sign Out</span>
		</button>
	</div>
</div>
