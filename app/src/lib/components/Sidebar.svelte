<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Circle, Settings, LogOut, Search, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, X, FolderHeart } from 'lucide-svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import { sidebarStore, type FeedWithUnread } from '$lib/stores/sidebar';
	import { collectionsStore } from '$lib/stores/collections';
	import CollectionItem from './collections/CollectionItem.svelte';
	import Skeleton from './Skeleton.svelte';

	// Check if current user is owner
	const isOwner = $derived($user?.email === 'hsbazr@gmail.com');

	let {
		activeFeedId = null,
		activeCategory = null,
		activeCollectionId = null,
		onCollapseChange,
		isMobileOpen = false,
		onMobileClose
	}: {
		activeFeedId?: string | null;
		activeCategory?: string | null;
		activeCollectionId?: string | null;
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
	const isLoadingFeeds = $derived($sidebarStore.isLoading);
	const hasLoadedFeeds = $derived($sidebarStore.lastLoadedAt !== null);
	// Show shimmer if loading OR if feeds haven't been loaded yet
	const showFeedsShimmer = $derived((isLoadingFeeds || !hasLoadedFeeds) && feeds.length === 0);

	// Get collections data from store
	const collections = $derived($collectionsStore.collections);
	const isLoadingCollections = $derived($collectionsStore.isLoading);
	const hasLoadedCollections = $derived($collectionsStore.lastLoadedAt !== null);
	const showCollectionsShimmer = $derived((isLoadingCollections || !hasLoadedCollections) && collections.length === 0);

	// Get collapsed state from store (persists across page navigations)
	const isCollapsed = $derived($sidebarStore.isCollapsed);
	const collapsedLoaded = $derived($sidebarStore.collapsedLoaded);
	let expandedFeeds = $state<Set<string>>(new Set());

	$effect(() => {
		onCollapseChange?.(isCollapsed);
	});

	function toggleSidebar() {
		sidebarStore.setCollapsed(!isCollapsed);
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

			// Load collapsed state from store (persists across navigations)
			await sidebarStore.loadCollapsedState();

			// Load feeds from store (will skip if recently loaded)
			await sidebarStore.loadFeeds();

			// Load collections from store
			await collectionsStore.loadCollections();

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
			class="absolute inset-0 bg-background/50"
			onclick={onMobileClose}
			aria-label="Close menu"
		></button>

		<!-- Sidebar Panel -->
		<div class="absolute inset-y-0 left-0 w-72 bg-sidebar flex flex-col h-full text-sidebar-foreground z-10 slide-in-left">
			<!-- Header -->
			<div class="px-4 pt-6 pb-4 flex items-center justify-center border-b border-sidebar-border/50 flex-shrink-0 safe-area-inset-top">
				<div class="flex items-center gap-2 justify-center">
					<img src="/logo.png" alt="LeadrFeeds" class="h-8 object-contain" />
					<span class="text-xl font-bold tracking-tight text-sidebar-foreground">LeadrFeeds</span>
				</div>
				<button
					onclick={onMobileClose}
					class="absolute right-3 p-1 hover:bg-sidebar-accent rounded transition-colors text-muted-foreground hover:text-sidebar-foreground"
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
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : 'text-sidebar-foreground/80'}"
					>
						<Home size={18} class="{currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">All Posts</span>
					</a>

					<a
						href="/timeline/starred"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
					>
						<Star size={18} class="{currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Starred</span>
					</a>

					<a
						href="/timeline/unread"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/unread' || currentPath.includes('/timeline/unread') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
					>
						<Circle size={18} class="{currentPath === '/timeline/unread' || currentPath.includes('/timeline/unread') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Unread</span>
						{#if totalUnread > 0}
							<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {currentPath === '/timeline/unread' || currentPath.includes('/timeline/unread') ? 'bg-white/30 text-white' : 'bg-sidebar-primary/20 text-sidebar-primary'}">
								{totalUnread}
							</span>
						{/if}
					</a>

					<a
						href="/discover"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
					>
						<Search size={18} class="{currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Discover</span>
					</a>

					<a
						href="/collections"
						onclick={handleNavClick}
						class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/collections' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
					>
						<FolderHeart size={18} class="{currentPath === '/collections' ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
						<span class="flex-1 min-w-0 truncate">Collections</span>
					</a>

					<!-- Suggestions Link (Owner Only) -->
					{#if isOwner}
						<a
							href="/discover/suggestions"
							onclick={handleNavClick}
							class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath.includes('/discover/suggestions') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
						>
							<Lightbulb size={18} class="{currentPath.includes('/discover/suggestions') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
							<span class="flex-1 min-w-0 truncate">Suggestions</span>
							{#if pendingSuggestionsCount > 0}
								<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {currentPath.includes('/discover/suggestions') ? 'bg-white/30 text-white' : 'bg-secondary/20 text-secondary'}">
									{pendingSuggestionsCount}
								</span>
							{/if}
						</a>
					{/if}
				</div>

				<!-- Collections Section -->
				{#if collections.length > 0 || showCollectionsShimmer}
					<!-- Divider -->
					<div class="mx-4 my-2 border-t border-sidebar-border"></div>

					<div class="px-4 py-2 flex items-center justify-between">
						<h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Collections</h2>
						<a
							href="/collections"
							onclick={handleNavClick}
							class="text-xs text-muted-foreground hover:text-sidebar-foreground transition-colors"
						>
							Manage
						</a>
					</div>

					{#if showCollectionsShimmer}
						<div class="px-2 space-y-0.5">
							{#each Array(2) as _}
								<div class="flex items-center gap-3 px-3 py-2">
									<Skeleton variant="circular" width="20px" height="20px" class="flex-shrink-0" />
									<Skeleton variant="text" height="16px" class="flex-1" />
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-2 space-y-0.5">
							{#each collections as collection}
								<CollectionItem
									{collection}
									isActive={activeCollectionId === collection.collection_id}
									isCollapsed={false}
									onNavigate={handleNavClick}
								/>
							{/each}
						</div>
					{/if}
				{/if}

				<!-- Divider -->
				<div class="mx-4 my-2 border-t border-sidebar-border"></div>

				<!-- Feeds Section Header -->
				<div class="px-4 py-2">
					<h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Feeds</h2>
				</div>

				<!-- Feed List -->
				{#if showFeedsShimmer}
					<!-- Loading Skeletons -->
					<div class="px-2 space-y-0.5">
						{#each Array(5) as _, i}
							<div class="flex items-center gap-3 px-3 py-2">
								<Skeleton variant="circular" width="20px" height="20px" class="flex-shrink-0" />
								<Skeleton variant="text" height="16px" class="flex-1" />
							</div>
						{/each}
					</div>
				{:else if feeds.length > 0}
					<div class="px-2 space-y-0.5">
						{#each getRepresentativeFeeds() as feed}
							{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
							{@const isMultiFeedCategory = categoryFeeds.length > 1}
							{@const isActive = (isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id)}
							<div class="flex items-center">
								<a
									href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
									onclick={handleNavClick}
									class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0 {isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
								>
									{#if feed.feed_image}
										<img src={feed.feed_image} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
									{:else if feed.feed_site_url}
										<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
									{:else}
										<div class="w-5 h-5 rounded flex items-center justify-center bg-muted/80 flex-shrink-0">
											<div class="w-2.5 h-2.5 rounded-full bg-muted-foreground"></div>
										</div>
									{/if}
									<span class="flex-1 truncate text-sm min-w-0">
										{isMultiFeedCategory ? feed.feed_category : feed.feed_title}
									</span>
									{#if !isMultiFeedCategory && feed.unread_count > 0}
										<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {isActive ? 'bg-white/30 text-white' : 'bg-sidebar-primary/20 text-sidebar-primary'}">
											{feed.unread_count}
										</span>
									{/if}
								</a>
								{#if isMultiFeedCategory}
									<button
										onclick={() => toggleFeedCategory(feed.feed_id)}
										class="flex-shrink-0 p-1 mx-1 hover:bg-sidebar-accent rounded-md transition-colors"
										aria-label="Expand category"
									>
										<ChevronDown size={16} class="text-muted-foreground transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}" />
									</button>
								{/if}
							</div>

							<!-- Expanded Category Feeds -->
							{#if expandedFeeds.has(feed.feed_id)}
								{@const allCategoryFeeds = getCategoryFeeds(feed.feed_category)}
								<div class="ml-8 mt-0.5 mb-1 space-y-0.5 overflow-hidden">
									{#each allCategoryFeeds as categoryFeed}
										{@const isCategoryFeedActive = activeFeedId === categoryFeed.feed_id}
										<a
											href="/timeline/{categoryFeed.feed_id}"
											onclick={handleNavClick}
											class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-sidebar-accent transition-colors min-w-0 {isCategoryFeedActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-muted-foreground'}"
										>
											{#if categoryFeed.feed_image}
												<img src={categoryFeed.feed_image} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
											{:else if categoryFeed.feed_site_url}
												<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
											{:else}
												<div class="w-4 h-4 rounded flex items-center justify-center bg-muted/80 flex-shrink-0">
													<div class="w-2 h-2 rounded-full bg-muted-foreground"></div>
												</div>
											{/if}
											<span class="flex-1 truncate min-w-0">{categoryFeed.feed_title}</span>
											{#if categoryFeed.unread_count > 0}
												<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {isCategoryFeedActive ? 'bg-white/30 text-white' : 'bg-sidebar-primary/20 text-sidebar-primary'}">
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
			<div class="p-2 border-t border-sidebar-border space-y-0.5 flex-shrink-0 safe-area-inset-bottom">
				<a
					href="/settings"
					onclick={handleNavClick}
					class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
				>
					<Settings size={18} class="text-muted-foreground flex-shrink-0" />
					<span class="flex-1 min-w-0 truncate">Settings</span>
				</a>

				<button
					onclick={handleSignOut}
					class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors text-left"
				>
					<LogOut size={18} class="text-muted-foreground flex-shrink-0" />
					<span class="flex-1 min-w-0 truncate">Sign Out</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- DESKTOP SIDEBAR -->
{#if isDesktopMode}
<div
	class="{isCollapsed ? 'w-16' : ''} bg-sidebar flex flex-col h-screen text-sidebar-foreground {collapsedLoaded ? 'transition-all duration-300' : ''} relative overflow-visible"
	style:width={!isCollapsed ? 'clamp(220px, 16vw, 320px)' : undefined}
>
	<!-- Header -->
	<div class="{isCollapsed ? 'px-2' : 'px-4'} pt-6 pb-4 flex items-center justify-center border-b border-sidebar-border/50 flex-shrink-0">
		{#if !isCollapsed}
			<div class="flex items-center gap-2 justify-center">
				<img src="/logo.png" alt="LeadrFeeds" class="h-8 object-contain" />
				<span class="text-xl font-bold tracking-tight text-sidebar-foreground">LeadrFeeds</span>
			</div>
		{:else}
			<img src="/logo.png" alt="LeadrFeeds" class="h-6 w-6 object-contain" />
		{/if}
	</div>

	<!-- Collapse/Expand Toggle -->
	<button
		onclick={toggleSidebar}
		class="absolute top-1/2 -translate-y-1/2 -right-3 z-10 p-1.5 bg-card hover:bg-sidebar-accent cursor-pointer rounded-full shadow-lg transition-all text-muted-foreground hover:text-sidebar-foreground border border-sidebar-border/50"
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
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : 'text-sidebar-foreground/80'}"
				title={isCollapsed ? 'All Posts' : ''}
			>
				<Home size={18} class="{currentPath === '/timeline/all' || currentPath.includes('/timeline/all') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">All Posts</span>
				{/if}
			</a>

			<a
				href="/timeline/starred"
				onclick={handleNavClick}
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
				title={isCollapsed ? 'Starred' : ''}
			>
				<Star size={18} class="{currentPath === '/timeline/starred' || currentPath.includes('/timeline/starred') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Starred</span>
				{/if}
			</a>

			<a
				href="/timeline/unread"
				onclick={handleNavClick}
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/timeline/unread' || currentPath.includes('/timeline/unread') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
				title={isCollapsed ? 'Unread' : ''}
			>
				<Circle size={18} class="{currentPath === '/timeline/unread' || currentPath.includes('/timeline/unread') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Unread</span>
					{#if totalUnread > 0}
						<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-sidebar-primary/20 text-sidebar-primary flex-shrink-0">
							{totalUnread}
						</span>
					{/if}
				{/if}
			</a>

			<a
				href="/discover"
				onclick={handleNavClick}
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
				title={isCollapsed ? 'Discover' : ''}
			>
				<Search size={18} class="{currentPath === '/discover' && !currentPath.includes('/suggestions') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Discover</span>
				{/if}
			</a>

			<a
				href="/collections"
				onclick={handleNavClick}
				class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath === '/collections' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
				title={isCollapsed ? 'Collections' : ''}
			>
				<FolderHeart size={18} class="{currentPath === '/collections' ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
				{#if !isCollapsed}
					<span class="flex-1 min-w-0 truncate">Collections</span>
				{/if}
			</a>

			<!-- Suggestions Link (Owner Only) -->
			{#if isOwner}
				<a
					href="/discover/suggestions"
					onclick={handleNavClick}
					class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-4'} py-2.5 rounded-lg text-sm font-medium hover:bg-sidebar-accent hover:shadow-lg hover:shadow-black/10 transition-all duration-200 {currentPath.includes('/discover/suggestions') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
					title={isCollapsed ? 'Suggestions' : ''}
				>
					<Lightbulb size={18} class="{currentPath.includes('/discover/suggestions') ? 'text-sidebar-primary-foreground' : 'text-muted-foreground'} flex-shrink-0" />
					{#if !isCollapsed}
						<span class="flex-1 min-w-0 truncate">Suggestions</span>
						{#if pendingSuggestionsCount > 0}
							<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-secondary/20 text-secondary flex-shrink-0">
								{pendingSuggestionsCount}
							</span>
						{/if}
					{/if}
				</a>
			{/if}
		</div>

		<!-- Collections Section -->
		{#if collections.length > 0 || showCollectionsShimmer}
			<!-- Divider -->
			<div class="mx-4 my-2 border-t border-sidebar-border"></div>

			{#if !isCollapsed}
				<div class="px-4 py-2 flex items-center justify-between">
					<h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Collections</h2>
					<a
						href="/collections"
						onclick={handleNavClick}
						class="text-xs text-muted-foreground hover:text-sidebar-foreground transition-colors"
					>
						Manage
					</a>
				</div>
			{/if}

			{#if showCollectionsShimmer}
				{#if !isCollapsed}
					<div class="px-2 space-y-0.5">
						{#each Array(2) as _}
							<div class="flex items-center gap-3 px-3 py-2">
								<Skeleton variant="circular" width="20px" height="20px" class="flex-shrink-0" />
								<Skeleton variant="text" height="16px" class="flex-1" />
							</div>
						{/each}
					</div>
				{:else}
					<div class="px-2 space-y-1">
						{#each Array(2) as _}
							<div class="flex items-center justify-center p-2">
								<Skeleton variant="circular" width="24px" height="24px" />
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="px-2 space-y-0.5">
					{#each collections as collection}
						<CollectionItem
							{collection}
							isActive={activeCollectionId === collection.collection_id}
							{isCollapsed}
							onNavigate={handleNavClick}
						/>
					{/each}
				</div>
			{/if}
		{/if}

		<!-- Divider -->
		<div class="mx-4 my-2 border-t border-sidebar-border"></div>

		{#if !isCollapsed}
			<!-- Feeds Section Header -->
			<div class="px-4 py-2">
				<h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Feeds</h2>
			</div>
		{/if}

		<!-- Feed List -->
		{#if showFeedsShimmer}
			<!-- Loading Skeletons -->
			{#if !isCollapsed}
				<div class="px-2 space-y-0.5">
					{#each Array(5) as _, i}
						<div class="flex items-center gap-3 px-3 py-2">
							<Skeleton variant="circular" width="20px" height="20px" class="flex-shrink-0" />
							<Skeleton variant="text" height="16px" class="flex-1" />
						</div>
					{/each}
				</div>
			{:else}
				<!-- Collapsed Loading Skeletons -->
				<div class="px-2 space-y-1">
					{#each Array(5) as _, i}
						<div class="flex items-center justify-center p-2">
							<Skeleton variant="circular" width="24px" height="24px" />
						</div>
					{/each}
				</div>
			{/if}
		{:else if feeds.length > 0}
			{#if !isCollapsed}
			<div class="px-2 space-y-0.5">
				{#each getRepresentativeFeeds() as feed}
					{@const categoryFeeds = getCategoryFeeds(feed.feed_category)}
					{@const isMultiFeedCategory = categoryFeeds.length > 1}
					{@const isActive = (isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id)}
					<div class="flex items-center">
						<a
							href={isMultiFeedCategory ? `/timeline/category:${encodeURIComponent(feed.feed_category)}` : `/timeline/${feed.feed_id}`}
							onclick={handleNavClick}
							class="flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:shadow-md hover:shadow-black/20 transition-all duration-200 min-w-0 {isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80'}"
						>
							{#if feed.feed_image}
								<img src={feed.feed_image} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
							{:else if feed.feed_site_url}
								<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-5 h-5 rounded object-cover flex-shrink-0" />
							{:else}
								<div class="w-5 h-5 rounded flex items-center justify-center bg-muted/80 flex-shrink-0">
									<div class="w-2.5 h-2.5 rounded-full bg-muted-foreground"></div>
								</div>
							{/if}
							<span class="flex-1 truncate text-sm min-w-0">
								{isMultiFeedCategory ? feed.feed_category : feed.feed_title}
							</span>
							{#if !isMultiFeedCategory && feed.unread_count > 0}
								<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {isActive ? 'bg-white/30 text-white' : 'bg-sidebar-primary/20 text-sidebar-primary'}">
									{feed.unread_count}
								</span>
							{/if}
						</a>
						{#if isMultiFeedCategory}
							<button
								onclick={() => toggleFeedCategory(feed.feed_id)}
								class="flex-shrink-0 p-1 mx-1 hover:bg-sidebar-accent rounded-md transition-colors"
								aria-label="Expand category"
							>
								<ChevronDown size={16} class="text-muted-foreground transition-transform duration-200 {expandedFeeds.has(feed.feed_id) ? 'rotate-180' : ''}" />
							</button>
						{/if}
					</div>

					<!-- Expanded Category Feeds -->
					{#if expandedFeeds.has(feed.feed_id)}
						{@const allCategoryFeeds = getCategoryFeeds(feed.feed_category)}
						<div class="ml-8 mt-0.5 mb-1 space-y-0.5 overflow-hidden">
							{#each allCategoryFeeds as categoryFeed}
								{@const isCategoryFeedActive = activeFeedId === categoryFeed.feed_id}
								<a
									href="/timeline/{categoryFeed.feed_id}"
									onclick={handleNavClick}
									class="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-sidebar-accent transition-colors min-w-0 {isCategoryFeedActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-muted-foreground'}"
								>
									{#if categoryFeed.feed_image}
										<img src={categoryFeed.feed_image} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
									{:else if categoryFeed.feed_site_url}
										<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(categoryFeed.feed_site_url)}&size=32`} alt={categoryFeed.feed_title} class="w-4 h-4 rounded object-cover flex-shrink-0" />
									{:else}
										<div class="w-4 h-4 rounded flex items-center justify-center bg-muted/80 flex-shrink-0">
											<div class="w-2 h-2 rounded-full bg-muted-foreground"></div>
										</div>
									{/if}
									<span class="flex-1 truncate min-w-0">{categoryFeed.feed_title}</span>
									{#if categoryFeed.unread_count > 0}
										<span class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 {isCategoryFeedActive ? 'bg-white/30 text-white' : 'bg-sidebar-primary/20 text-sidebar-primary'}">
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
							class="flex items-center justify-center p-2 rounded-md hover:bg-sidebar-accent transition-colors {(isMultiFeedCategory && activeCategory === feed.feed_category) || (!isMultiFeedCategory && activeFeedId === feed.feed_id) ? 'bg-sidebar-primary' : ''}"
							title={isMultiFeedCategory ? feed.feed_category : feed.feed_title}
						>
							{#if feed.feed_image}
								<img src={feed.feed_image} alt={feed.feed_title} class="w-6 h-6 rounded object-cover" />
							{:else if feed.feed_site_url}
								<img src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`} alt={feed.feed_title} class="w-6 h-6 rounded object-cover" />
							{:else}
								<div class="w-6 h-6 rounded flex items-center justify-center bg-muted/80">
									<div class="w-3 h-3 rounded-full bg-muted-foreground"></div>
								</div>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</nav>

	<!-- Footer -->
	<div class="p-2 border-t border-sidebar-border space-y-0.5 flex-shrink-0">
		<a
			href="/settings"
			onclick={handleNavClick}
			class="flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
			title={isCollapsed ? 'Settings' : ''}
		>
			<Settings size={18} class="text-muted-foreground flex-shrink-0" />
			{#if !isCollapsed}
				<span class="flex-1 min-w-0 truncate">Settings</span>
			{/if}
		</a>

		<button
			onclick={handleSignOut}
			class="w-full flex items-center gap-3 {isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors text-left"
			title={isCollapsed ? 'Sign Out' : ''}
		>
			<LogOut size={18} class="text-muted-foreground flex-shrink-0" />
			{#if !isCollapsed}
				<span class="flex-1 min-w-0 truncate">Sign Out</span>
			{/if}
		</button>
	</div>
</div>
{/if}

