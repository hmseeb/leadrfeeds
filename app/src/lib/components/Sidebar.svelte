<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/services/supabase';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Settings, LogOut, Search, ChevronDown, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-svelte';

	// Check if current user is owner
	const isOwner = $derived($user?.email === 'hsbazr@gmail.com');

	interface FeedWithUnread {
		feed_id: string;
		feed_title: string;
		feed_category: string;
		feed_url: string | null;
		feed_image: string | null;
		feed_site_url: string | null;
		unread_count: number;
	}

	let { activeFeedId = null, activeCategory = null, onCollapseChange }: { activeFeedId?: string | null; activeCategory?: string | null; onCollapseChange?: (collapsed: boolean) => void } = $props();

	let isCollapsed = $state(false);

	$effect(() => {
		onCollapseChange?.(isCollapsed);
	});

	let feeds = $state<FeedWithUnread[]>([]);
	let totalUnread = $state(0);
	let expandedFeeds = $state<Set<string>>(new Set());
	let pendingSuggestionsCount = $state(0);

	// Reactive current path from page store
	const currentPath = $derived($page.url.pathname);

	function getDomainCategory(url: string | null): string {
		if (!url) return 'Other';

		try {
			const urlObj = new URL(url);
			let domain = urlObj.hostname.replace('www.', '');

			// Map common domains to readable names
			if (domain.includes('youtube.com')) return 'YouTube';
			if (domain.includes('reddit.com')) return 'Reddit';
			if (domain.includes('github.com')) return 'GitHub';
			if (domain.includes('medium.com')) return 'Medium';
			if (domain.includes('substack.com')) return 'Substack';

			// Extract main domain (e.g., "google" from "blog.google.com")
			const parts = domain.split('.');
			// Get second-to-last part for multi-level domains (blog.google.com -> google)
			// or first part for simple domains (example.com -> example)
			const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
			return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
		} catch (e) {
			return 'Other';
		}
	}

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		await loadFeeds();
		if (isOwner) {
			await loadPendingSuggestionsCount();
		}

		// Reload feeds every 30 seconds
		const interval = setInterval(async () => {
			await loadFeeds();
			if (isOwner) {
				await loadPendingSuggestionsCount();
			}
		}, 30000);
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
					url,
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

		// Build feeds list with domain-based categories
		feeds = userFeeds
			.filter(uf => uf.feeds)
			.map(uf => {
				const feed = Array.isArray(uf.feeds) ? uf.feeds[0] : uf.feeds;
				const feedUrl = feed.url || feed.site_url;
				const domainCategory = getDomainCategory(feedUrl);
				return {
					feed_id: feed.id,
					feed_title: feed.title || domainCategory,
					feed_category: domainCategory,
					feed_url: feedUrl,
					feed_image: feed.image?.replace(/\/+$/, '') || null,
					feed_site_url: feed.site_url || null,
					unread_count: unreadMap.get(feed.id) || 0
				};
			});

		totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0);
	}

	async function loadPendingSuggestionsCount() {
		if (!$user || !isOwner) return;

		const { data, error } = await supabase.rpc('get_pending_suggestions_count');

		if (error) {
			console.error('Error loading pending suggestions count:', error);
			return;
		}

		pendingSuggestionsCount = data || 0;
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

	function getRepresentativeFeeds() {
		// Get one representative feed per category
		const categoryMap = new Map<string, FeedWithUnread>();
		feeds.forEach(feed => {
			if (!categoryMap.has(feed.feed_category)) {
				categoryMap.set(feed.feed_category, feed);
			}
		});
		return Array.from(categoryMap.values());
	}
</script>

<div class="{isCollapsed ? 'w-16' : 'w-64'} bg-[#121212] flex flex-col h-screen text-gray-200 overflow-visible transition-all duration-300 relative">
	<!-- Toggle Button -->
	<button
		onclick={() => isCollapsed = !isCollapsed}
		class="absolute -right-3 top-1/2 -translate-y-1/2 z-[60] bg-gray-800 hover:bg-gray-700 rounded-full p-1.5 shadow-lg transition-colors border border-gray-700"
		title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
	>
		{#if isCollapsed}
			<ChevronRight size={16} class="text-gray-300" />
		{:else}
			<ChevronLeft size={16} class="text-gray-300" />
		{/if}
	</button>

	<!-- Header -->
	<div class="px-6 py-5 flex items-center justify-between border-b border-gray-800/50 flex-shrink-0">
		{#if !isCollapsed}
			<h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">LeadrFeeds</h1>
		{:else}
			<div class="w-full flex justify-center">
				<span class="text-xl font-bold text-blue-400">L</span>
			</div>
		{/if}
	</div>

	<!-- Navigation -->
	<nav class="flex-1 overflow-y-auto scrollbar-overlay">
		<!-- Main Navigation -->
		<div class="px-3 py-4 space-y-1">
			<a
				href="/timeline/all"
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'bg-gray-800/70 shadow-md shadow-black/10 text-blue-400' : 'text-gray-300'}"
				title={isCollapsed ? 'All Posts' : ''}
			>
				<Home size={18} class="{currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">All Posts</span>
					{#if totalUnread > 0}
						<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400 flex-shrink-0">
							{totalUnread}
						</span>
					{/if}
				{/if}
			</a>

			<a
				href="/timeline/starred"
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
				title={isCollapsed ? 'Starred' : ''}
			>
				<Star size={18} class="{currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Starred</span>
				{/if}
			</a>

			<a
				href="/discover"
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
				title={isCollapsed ? 'Discover' : ''}
			>
				<Search size={18} class="{currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Discover</span>
				{/if}
			</a>

			<!-- Suggestions Link (Owner Only) -->
			{#if isOwner}
				<a
					href="/discover/suggestions"
					class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath.includes('/discover/suggestions') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
					title={isCollapsed ? 'Suggestions' : ''}
				>
					<Lightbulb size={18} class="{currentPath.includes('/discover/suggestions') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
					{#if !isCollapsed}
						<span class="flex-1 min-w-0 truncate">Suggestions</span>
						{#if pendingSuggestionsCount > 0}
							<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0">
								{pendingSuggestionsCount}
							</span>
						{/if}
					{/if}
				</a>
			{/if}
		</div>

		<!-- Divider -->
		<div class="mx-4 my-2 border-t border-gray-800"></div>

		{#if !isCollapsed}
			<!-- Feeds Section Header -->
			<div class="px-4 py-2">
				<h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Feeds</h2>
			</div>
		{/if}

		<!-- Feed List (One per Domain Category) -->
		{#if feeds.length > 0}
			{#if !isCollapsed}
			<div class="px-2 space-y-0.5">
				{#each getRepresentativeFeeds() as feed}
					{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
					{@const isMultiFeedCategory = categoryFeeds.length > 1}
					{@const totalCategoryUnread = categoryFeeds.reduce((sum, f) => sum + f.unread_count, 0)}
					<div class="flex items-center">
						<a
							href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
							class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0 {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800 shadow-sm shadow-black/10' : ''}"
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
							<span class="flex-1 truncate text-sm min-w-0">
								{isMultiFeedCategory ? feed.feed_category : feed.feed_title}
							</span>
						</a>

						<!-- Chevron button OR badge - same width for alignment -->
						<div class="flex-shrink-0 px-2">
							{#if isMultiFeedCategory}
								<button
									onclick={() => toggleFeedCategory(feed.feed_id)}
									class="p-1 hover:bg-gray-800 rounded-md transition-colors"
									aria-label="Expand category"
								>
									<ChevronDown
										size={16}
										class="text-gray-400 transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}"
									/>
								</button>
							{:else if feed.unread_count > 0}
								<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400 inline-block">
									{feed.unread_count}
								</span>
							{/if}
						</div>
					</div>

					<!-- Expanded Category Feeds -->
					{#if expandedFeeds.has(feed.feed_id)}
						{@const allCategoryFeeds = getCategoryFeeds(feed.feed_category)}
						<div class="ml-8 mt-0.5 mb-1 space-y-0.5 overflow-hidden">
							<!-- All Feeds in Category -->
							{#each allCategoryFeeds as categoryFeed}
								<a
									href="/timeline/{categoryFeed.feed_id}"
									class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-gray-800 transition-colors min-w-0 {activeFeedId === categoryFeed.feed_id ? 'bg-gray-800 text-gray-200' : 'text-gray-400'}"
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
									<span class="flex-1 truncate min-w-0">{categoryFeed.feed_title}</span>
									{#if categoryFeed.unread_count > 0}
										<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400 flex-shrink-0">
											{categoryFeed.unread_count}
										</span>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
			{:else}
				<!-- Collapsed Feed Icons -->
				<div class="px-2 space-y-1">
					{#each getRepresentativeFeeds() as feed}
						{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
						{@const isMultiFeedCategory = categoryFeeds.length > 1}
						{@const totalCategoryUnread = categoryFeeds.reduce((sum, f) => sum + f.unread_count, 0)}
						<a
							href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
							class="flex items-center justify-center p-2 rounded-md hover:bg-gray-800 transition-colors relative {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800 shadow-sm shadow-black/10' : ''}"
							title={isMultiFeedCategory ? feed.feed_category : feed.feed_title}
						>
							{#if feed.feed_image}
								<img
									src={feed.feed_image}
									alt={feed.feed_title}
									class="w-6 h-6 rounded object-cover"
									onerror={(e) => {
										if (!e.target.dataset.fallbackAttempted) {
											e.target.dataset.fallbackAttempted = 'true';
											e.target.src = feed.feed_site_url
												? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`
												: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
										}
									}}
								/>
							{:else if feed.feed_site_url}
								<img
									src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`}
									alt={feed.feed_title}
									class="w-6 h-6 rounded object-cover"
									onerror={(e) => {
										e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
									}}
								/>
							{:else}
								<div class="w-6 h-6 rounded flex items-center justify-center bg-gray-700">
									<div class="w-3 h-3 rounded-full bg-gray-500"></div>
								</div>
							{/if}

							<!-- Unread badge -->
							{#if totalCategoryUnread > 0}
								<span class="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold rounded-full bg-blue-500 text-white flex items-center justify-center">
									{totalCategoryUnread > 9 ? '9+' : totalCategoryUnread}
								</span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</nav>

	<!-- Footer -->
	<div class="p-2 border-t border-gray-800 space-y-0.5 flex-shrink-0">
		<a
			href="/settings"
			class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
			title={isCollapsed ? 'Settings' : ''}
		>
			<Settings size={18} class="text-gray-400 flex-shrink-0" />
			{#if !isCollapsed}
				<span class="flex-1 min-w-0 truncate">Settings</span>
			{/if}
		</a>

		<button
			onclick={handleSignOut}
			class="w-full flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md text-sm hover:bg-gray-800 transition-colors text-left"
			title={isCollapsed ? 'Sign Out' : ''}
		>
			<LogOut size={18} class="text-gray-400 flex-shrink-0" />
			{#if !isCollapsed}
				<span class="flex-1 min-w-0 truncate">Sign Out</span>
			{/if}
		</button>
	</div>
</div>

<style>
	/* Overlay scrollbar - only visible on hover, never shifts content */
	.scrollbar-overlay {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		scrollbar-gutter: stable; /* Reserve space to prevent layout shift */
		overflow-y: auto;
	}

	/* Show scrollbar on hover */
	.scrollbar-overlay:hover {
		scrollbar-color: #374151 transparent;
	}

	/* Webkit browsers (Chrome, Edge, Safari) */
	.scrollbar-overlay::-webkit-scrollbar {
		width: 8px;
		background: transparent;
	}

	.scrollbar-overlay::-webkit-scrollbar-track {
		background: transparent;
	}

	.scrollbar-overlay::-webkit-scrollbar-thumb {
		background: transparent;
		border-radius: 4px;
	}

	/* Show scrollbar thumb on hover */
	.scrollbar-overlay:hover::-webkit-scrollbar-thumb {
		background: #374151;
	}

	.scrollbar-overlay::-webkit-scrollbar-thumb:hover {
		background: #4b5563;
	}

	/* Force scrollbar to overlay on Webkit */
	.scrollbar-overlay::-webkit-scrollbar-button {
		display: none;
	}
</style>
