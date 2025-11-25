<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/services/supabase';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Settings, LogOut, Search, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import { sidebarStore, type FeedWithUnread } from '$lib/stores/sidebar';

	// Check if current user is owner
	const isOwner = $derived($user?.email === 'hsbazr@gmail.com');

	let {
		activeFeedId = null,
		activeCategory = null,
		onCollapseChange,
		isMobileOpen = false,
		onMobileClose
	}: {
		activeFeedId?: string | null;
		activeCategory?: string | null;
		onCollapseChange?: (collapsed: boolean) => void;
		isMobileOpen?: boolean;
		onMobileClose?: () => void;
	} = $props();

	// Use desktop layout store for responsive behavior
	const isDesktopMode = $derived($useDesktopLayout);

	// Get feeds data from store
	const feeds = $derived($sidebarStore.feeds);
	const totalUnread = $derived($sidebarStore.totalUnread);
	const pendingSuggestionsCount = $derived($sidebarStore.pendingSuggestionsCount);

	let isCollapsed = $state(true);
	let isLoadingSettings = $state(true);
	let expandedFeeds = $state<Set<string>>(new Set());

	$effect(() => {
		onCollapseChange?.(isCollapsed);
	});

	// Save sidebar collapsed state to database when it changes
	async function saveSidebarState(collapsed: boolean) {
		if (!$user || isLoadingSettings) return;

		await supabase
			.from('user_settings')
			.upsert({
				user_id: $user.id,
				sidebar_collapsed: collapsed,
				updated_at: new Date().toISOString()
			}, { onConflict: 'user_id' });
	}

	// Load sidebar state from database
	async function loadSidebarState() {
		if (!$user) return;

		const { data } = await supabase
			.from('user_settings')
			.select('sidebar_collapsed')
			.eq('user_id', $user.id)
			.single();

		if (data?.sidebar_collapsed !== null && data?.sidebar_collapsed !== undefined) {
			isCollapsed = data.sidebar_collapsed;
		}
		isLoadingSettings = false;
	}

	function toggleSidebar() {
		isCollapsed = !isCollapsed;
		saveSidebarState(isCollapsed);
	}

	// Reactive current path from page store
	const currentPath = $derived($page.url.pathname);

	onMount(() => {
		// Load data asynchronously
		(async () => {
			if (!$user) {
				goto('/auth/login');
				return;
			}

			// Load sidebar state (local preference)
			await loadSidebarState();

			// Load feeds from store (will skip if recently loaded)
			await sidebarStore.loadFeeds();

			if (isOwner) {
				await sidebarStore.loadPendingSuggestionsCount();
			}

			// Start refresh interval
			sidebarStore.startRefreshInterval();
		})();

		return () => {
			sidebarStore.stopRefreshInterval();
		};
	});

	async function handleSignOut() {
		sidebarStore.reset();
		await signOut();
		goto('/auth/login');
	}

	// Handle navigation click - close mobile sidebar
	function handleNavClick() {
		if (!isDesktopMode && onMobileClose) {
			onMobileClose();
		}
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

<!-- MOBILE SIDEBAR -->
{#if !isDesktopMode && isMobileOpen}
	<div class="fixed inset-0 z-40">
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/50"
			onclick={onMobileClose}
			aria-label="Close menu"
		></button>

		<!-- Sidebar Panel -->
		<div class="absolute inset-y-0 left-0 w-72 bg-[#121212] flex flex-col h-full text-gray-200 z-10 slide-in-left">
			<!-- Header -->
			<div class="px-4 pt-6 pb-4 flex items-center justify-center border-b border-gray-800/50 flex-shrink-0 safe-area-inset-top">
				<div class="flex items-center gap-2 justify-center">
					<img src="/logo.png" alt="LeadrFeeds" class="h-8 object-contain" />
					<span class="text-xl font-bold tracking-tight text-white">LeadrFeeds</span>
				</div>
				<button
					onclick={onMobileClose}
					class="absolute right-3 p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-gray-200"
					aria-label="Close menu"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Navigation -->
			<nav class="flex-1 overflow-y-auto scrollbar-overlay">
				<!-- Main Navigation -->
				<div class="px-3 py-4 space-y-1">
					<a
						href="/timeline/all"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'bg-gray-800/70 shadow-md shadow-black/10 text-blue-400' : 'text-gray-300'}"
					>
						<Home size={18} class="{currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">All Posts</span>
						{#if totalUnread > 0}
							<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400 flex-shrink-0">
								{totalUnread}
							</span>
						{/if}
					</a>

					<a
						href="/timeline/starred"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
					>
						<Star size={18} class="{currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Starred</span>
					</a>

					<a
						href="/discover"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
					>
						<Search size={18} class="{currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Discover</span>
					</a>

					<!-- Suggestions Link (Owner Only) -->
					{#if isOwner}
						<a
							href="/discover/suggestions"
							onclick={handleNavClick}
							class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800/70 hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath.includes('/discover/suggestions') ? 'bg-gray-800 shadow-sm shadow-black/10 text-blue-400' : 'text-gray-300'}"
						>
							<Lightbulb size={18} class="{currentPath.includes('/discover/suggestions') ? 'text-blue-400' : 'text-gray-400'} flex-shrink-0" />
							<span class="flex-1 min-w-0 truncate">Suggestions</span>
							{#if pendingSuggestionsCount > 0}
								<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0">
									{pendingSuggestionsCount}
								</span>
							{/if}
						</a>
					{/if}
				</div>

				<!-- Divider -->
				<div class="mx-4 my-2 border-t border-gray-800"></div>

				<!-- Feeds Section Header -->
				<div class="px-4 py-2">
					<h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Feeds</h2>
				</div>

				<!-- Feed List -->
				{#if feeds.length > 0}
					<div class="px-2 space-y-0.5">
						{#each getRepresentativeFeeds() as feed}
							{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
							{@const isMultiFeedCategory = categoryFeeds.length > 1}
							<div class="flex items-center">
								<a
									href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
									onclick={handleNavClick}
									class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0 {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800 shadow-sm shadow-black/10' : ''}"
								>
									{#if feed.feed_image}
										<img src={feed.feed_image} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
									{:else if feed.feed_site_url}
										<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
									{:else}
										<div class="w-5 h-5 rounded flex items-center justify-center bg-gray-700 flex-shrink-0">
											<div class="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
										</div>
									{/if}
									<span class="flex-1 truncate text-sm min-w-0">
										{isMultiFeedCategory ? feed.feed_category : feed.feed_title}
									</span>
								</a>

								<div class="flex-shrink-0 px-2">
									{#if isMultiFeedCategory}
										<button
											onclick={() => toggleFeedCategory(feed.feed_id)}
											class="p-1 hover:bg-gray-800 rounded-md transition-colors"
											aria-label="Expand category"
										>
											<ChevronDown size={16} class="text-gray-400 transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}" />
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
									{#each allCategoryFeeds as categoryFeed}
										<a
											href="/timeline/{categoryFeed.feed_id}"
											onclick={handleNavClick}
											class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-gray-800 transition-colors min-w-0 {activeFeedId === categoryFeed.feed_id ? 'bg-gray-800 text-gray-200' : 'text-gray-400'}"
										>
											{#if categoryFeed.feed_image}
												<img src={categoryFeed.feed_image} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
											{:else if categoryFeed.feed_site_url}
												<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
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
				{/if}
			</nav>

			<!-- Footer -->
			<div class="p-2 border-t border-gray-800 space-y-0.5 flex-shrink-0 safe-area-inset-bottom">
				<a
					href="/settings"
					onclick={handleNavClick}
					class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
				>
					<Settings size={18} class="text-gray-400 flex-shrink-0" />
					<span class="flex-1 min-w-0 truncate">Settings</span>
				</a>

				<button
					onclick={handleSignOut}
					class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors text-left"
				>
					<LogOut size={18} class="text-gray-400 flex-shrink-0" />
					<span class="flex-1 min-w-0 truncate">Sign Out</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- DESKTOP SIDEBAR -->
{#if isDesktopMode}
<div
	class="{isCollapsed ? 'w-16' : ''} bg-[#121212] flex flex-col h-screen text-gray-200 transition-all duration-300 relative overflow-visible"
	style:width={!isCollapsed ? 'clamp(220px, 16vw, 320px)' : undefined}
>
	<!-- Header -->
	<div class="{isCollapsed ? 'px-2' : 'px-4'} pt-6 pb-4 flex items-center justify-center border-b border-gray-800/50 flex-shrink-0">
		{#if !isCollapsed}
			<div class="flex items-center gap-2 justify-center">
				<img src="/logo.png" alt="LeadrFeeds" class="h-8 object-contain" />
				<span class="text-xl font-bold tracking-tight text-white">LeadrFeeds</span>
			</div>
		{:else}
			<img src="/logo.png" alt="LeadrFeeds" class="h-6 w-6 object-contain" />
		{/if}
	</div>

	<!-- Collapse/Expand Toggle -->
	<button
		onclick={toggleSidebar}
		class="absolute top-1/2 -translate-y-1/2 -right-3 z-10 p-1.5 bg-gray-800/70 hover:bg-gray-700/80 rounded-full shadow-lg transition-all text-gray-400 hover:text-gray-200 border border-gray-700/50"
		title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
	>
		{#if isCollapsed}
			<ChevronRight size={16} />
		{:else}
			<ChevronLeft size={16} />
		{/if}
	</button>

	<!-- Navigation -->
	<nav class="flex-1 overflow-y-auto scrollbar-overlay">
		<!-- Main Navigation -->
		<div class="px-3 py-4 space-y-1">
			<a
				href="/timeline/all"
				onclick={handleNavClick}
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
				onclick={handleNavClick}
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
				onclick={handleNavClick}
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
					onclick={handleNavClick}
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

		<!-- Feed List -->
		{#if feeds.length > 0}
			{#if !isCollapsed}
			<div class="px-2 space-y-0.5">
				{#each getRepresentativeFeeds() as feed}
					{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
					{@const isMultiFeedCategory = categoryFeeds.length > 1}
					<div class="flex items-center">
						<a
							href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
							onclick={handleNavClick}
							class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-800 hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0 {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800 shadow-sm shadow-black/10' : ''}"
						>
							{#if feed.feed_image}
								<img src={feed.feed_image} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
							{:else if feed.feed_site_url}
								<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
							{:else}
								<div class="w-5 h-5 rounded flex items-center justify-center bg-gray-700 flex-shrink-0">
									<div class="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
								</div>
							{/if}
							<span class="flex-1 truncate text-sm min-w-0">
								{isMultiFeedCategory ? feed.feed_category : feed.feed_title}
							</span>
						</a>

						<div class="flex-shrink-0 px-2">
							{#if isMultiFeedCategory}
								<button
									onclick={() => toggleFeedCategory(feed.feed_id)}
									class="p-1 hover:bg-gray-800 rounded-md transition-colors"
									aria-label="Expand category"
								>
									<ChevronDown size={16} class="text-gray-400 transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}" />
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
							{#each allCategoryFeeds as categoryFeed}
								<a
									href="/timeline/{categoryFeed.feed_id}"
									onclick={handleNavClick}
									class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-gray-800 transition-colors min-w-0 {activeFeedId === categoryFeed.feed_id ? 'bg-gray-800 text-gray-200' : 'text-gray-400'}"
								>
									{#if categoryFeed.feed_image}
										<img src={categoryFeed.feed_image} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
									{:else if categoryFeed.feed_site_url}
										<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
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
						<a
							href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
							onclick={handleNavClick}
							class="flex items-center justify-center p-2 rounded-md hover:bg-gray-800 transition-colors {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-gray-800 shadow-sm shadow-black/10' : ''}"
							title={isMultiFeedCategory ? feed.feed_category : feed.feed_title}
						>
							{#if feed.feed_image}
								<img src={feed.feed_image} alt={feed.feed_title} class="w-6 h-6 rounded object-cover" />
							{:else if feed.feed_site_url}
								<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-6 h-6 rounded object-cover" />
							{:else}
								<div class="w-6 h-6 rounded flex items-center justify-center bg-gray-700">
									<div class="w-3 h-3 rounded-full bg-gray-500"></div>
								</div>
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
			onclick={handleNavClick}
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
{/if}

<style>
	/* Overlay scrollbar - only visible on hover, never shifts content */
	.scrollbar-overlay {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		scrollbar-gutter: stable;
		overflow-y: auto;
	}

	.scrollbar-overlay:hover {
		scrollbar-color: #374151 transparent;
	}

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

	.scrollbar-overlay:hover::-webkit-scrollbar-thumb {
		background: #374151;
	}

	.scrollbar-overlay::-webkit-scrollbar-thumb:hover {
		background: #4b5563;
	}

	.scrollbar-overlay::-webkit-scrollbar-button {
		display: none;
	}
</style>
