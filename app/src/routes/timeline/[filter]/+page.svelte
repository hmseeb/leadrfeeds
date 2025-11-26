<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/services/supabase';
	import { user } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import EntryCard from '$lib/components/EntryCard.svelte';
	import AIChat from '$lib/components/AIChat.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';
	import { MessageCircle, ChevronRight, Filter, X, Check, Search } from 'lucide-svelte';
	import { useDesktopLayout } from '$lib/stores/screenSize';
	import { sidebarStore } from '$lib/stores/sidebar';
	import type { Database } from '$lib/types/database';

	type TimelineEntry = Database['public']['Functions']['get_user_timeline']['Returns'][0];

	// Responsive state
	const isDesktopMode = $derived($useDesktopLayout);
	let isSidebarOpen = $state(false);
	let isChatOpen = $state(false);

	let entries = $state<TimelineEntry[]>([]);
	let loading = $state(true);
	let hasMore = $state(true);
	let offset = $state(0);
	const limit = 20;

	// Initialize filter from page params reactively to avoid flash of wrong title
	const filter = $derived($page.params.filter || 'all');
	let activeFeedId = $state<string | null>(null);
	let activeCategory = $state<string | null>(null);
	let selectedEntry = $state<TimelineEntry | null>(null);
	let feeds = $state<any[]>([]);
	let currentFeed = $state<{ feed_id: string; feed_title: string } | null>(null);
	let loadMoreElement = $state<HTMLElement | null>(null);
	let isSidebarCollapsed = $state(false);
	let timelineScrollContainer = $state<HTMLElement | null>(null);
	// Store scroll positions per view (filter)
	let scrollPositions = $state<Map<string, number>>(new Map());

	// Filter state
	let showFilterMenu = $state(false);
	let excludedFeedIds = $state<Set<string>>(new Set());
	let excludedCategories = $state<Set<string>>(new Set());

	// Search state
	let searchQuery = $state('');
	let showSearchInput = $state(false);
	let searchInputRef = $state<HTMLInputElement | null>(null);

	// Filtered entries based on search
	const filteredEntries = $derived(() => {
		if (!searchQuery.trim()) return entries;
		const query = searchQuery.toLowerCase().trim();
		return entries.filter(entry => {
			const title = (entry.entry_title || '').toLowerCase();
			const description = (entry.entry_description || '').toLowerCase();
			const author = (entry.entry_author || '').toLowerCase();
			const feedTitle = (entry.feed_title || '').toLowerCase();
			return title.includes(query) || description.includes(query) || author.includes(query) || feedTitle.includes(query);
		});
	});

	// Get unique categories from feeds
	const feedCategories = $derived(() => {
		const categories = new Map<string, { name: string; feeds: typeof feeds }>();
		for (const feed of feeds) {
			const cat = getDomainCategory(feed.url, feed.site_url);
			if (!categories.has(cat)) {
				categories.set(cat, { name: cat, feeds: [] });
			}
			categories.get(cat)!.feeds.push(feed);
		}
		return Array.from(categories.entries())
			.map(([name, data]) => ({ name, feeds: data.feeds }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	// Count active filters
	const activeFilterCount = $derived(excludedFeedIds.size + excludedCategories.size);

	// Load filter preferences from Supabase
	async function loadFilterPreferences() {
		if (!$user) return;
		try {
			const { data, error } = await supabase
				.from('user_settings')
				.select('timeline_filters')
				.eq('user_id', $user.id)
				.single();

			if (error && error.code !== 'PGRST116') {
				console.error('Error loading filter preferences:', error);
				return;
			}

			if (data?.timeline_filters) {
				const filters = data.timeline_filters as { excludedFeedIds?: string[]; excludedCategories?: string[] };
				excludedFeedIds = new Set(filters.excludedFeedIds || []);
				excludedCategories = new Set(filters.excludedCategories || []);
			}
		} catch (e) {
			console.error('Error loading filter preferences:', e);
		}
	}

	// Save filter preferences to Supabase
	async function saveFilterPreferences() {
		if (!$user) return;
		try {
			const filters = {
				excludedFeedIds: Array.from(excludedFeedIds),
				excludedCategories: Array.from(excludedCategories)
			};

			const { error } = await supabase
				.from('user_settings')
				.upsert({
					user_id: $user.id,
					timeline_filters: filters,
					updated_at: new Date().toISOString()
				}, { onConflict: 'user_id' });

			if (error) {
				console.error('Error saving filter preferences:', error);
			}
		} catch (e) {
			console.error('Error saving filter preferences:', e);
		}
	}

	function toggleFeedFilter(feedId: string) {
		if (excludedFeedIds.has(feedId)) {
			excludedFeedIds.delete(feedId);
		} else {
			excludedFeedIds.add(feedId);
		}
		excludedFeedIds = new Set(excludedFeedIds); // Trigger reactivity
		saveFilterPreferences();
		resetAndLoad();
	}

	function toggleCategoryFilter(categoryName: string) {
		if (excludedCategories.has(categoryName)) {
			excludedCategories.delete(categoryName);
		} else {
			excludedCategories.add(categoryName);
		}
		excludedCategories = new Set(excludedCategories); // Trigger reactivity
		saveFilterPreferences();
		resetAndLoad();
	}

	function clearAllFilters() {
		excludedFeedIds = new Set();
		excludedCategories = new Set();
		saveFilterPreferences();
		resetAndLoad();
	}

	function isCategoryFullyExcluded(categoryName: string): boolean {
		const category = feedCategories().find(c => c.name === categoryName);
		if (!category) return false;
		return category.feeds.every(f => excludedFeedIds.has(f.id));
	}

	function isCategoryPartiallyExcluded(categoryName: string): boolean {
		const category = feedCategories().find(c => c.name === categoryName);
		if (!category) return false;
		const excludedCount = category.feeds.filter(f => excludedFeedIds.has(f.id)).length;
		return excludedCount > 0 && excludedCount < category.feeds.length;
	}

	onMount(async () => {
		if (!$user) {
			goto('/auth/login');
			return;
		}

		// Ensure page starts at top on mobile
		window.scrollTo(0, 0);

		// Load filter preferences from Supabase
		await loadFilterPreferences();

		await loadFeeds();
		await loadEntries();
	});

	// Set up intersection observer when loadMoreElement is available
	$effect(() => {
		if (!loadMoreElement || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loading) {
					loadMore();
				}
			},
			{ threshold: 0.1 }
		);

		observer.observe(loadMoreElement);

		return () => {
			if (loadMoreElement) {
				observer.unobserve(loadMoreElement);
			}
		};
	});

	async function loadFeeds() {
		if (!$user) return;

		const { data, error } = await supabase
			.from('user_subscriptions')
			.select('feeds(id, title, url, site_url, description, category)')
			.eq('user_id', $user.id);

		if (!error && data) {
			feeds = data.map((sub: any) => sub.feeds).filter(Boolean);
		}
	}

	function getDomainCategory(url: string | null, siteUrl: string | null): string {
		const feedUrl = url || siteUrl;
		if (!feedUrl) return 'Other';

		try {
			const urlObj = new URL(feedUrl);
			let domain = urlObj.hostname.replace('www.', '');

			// Map common domains to readable names (same as sidebar)
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

	// Track the previous filter to detect changes
	let previousFilter = $state<string | null>(null);

	$effect(() => {
		// Watch for route changes (skip initial load which is handled by onMount)
		if (previousFilter !== null && filter !== previousFilter) {
			resetAndLoad();
		}
		previousFilter = filter;
	});

	async function resetAndLoad() {
		entries = [];
		offset = 0;
		hasMore = true;
		selectedEntry = null; // Clear selected entry when switching views
		searchQuery = ''; // Clear search when switching views
		showSearchInput = false;
		// Reset scroll to top when switching views
		if (timelineScrollContainer) {
			timelineScrollContainer.scrollTop = 0;
		}
		await loadEntries();
	}

	async function loadEntries() {
		if (!$user) return;

		loading = true;

		// Parse filter: "all", "starred", "category:CategoryName", or a feed UUID
		let feedIdFilter: string | undefined;
		let categoryFilter: string | undefined;
		let starredOnly = false;
		let unreadOnly = false;

		if (filter === 'starred') {
			starredOnly = true;
			activeFeedId = null;
			activeCategory = null;
			currentFeed = null;
		} else if (filter === 'unread') {
			unreadOnly = true;
			activeFeedId = null;
			activeCategory = null;
			currentFeed = null;
		} else if (filter.startsWith('category:')) {
			// Category filter
			categoryFilter = decodeURIComponent(filter.substring(9));
			activeFeedId = null;
			activeCategory = categoryFilter;
			currentFeed = null;
		} else if (filter !== 'all') {
			// Assume it's a feed UUID
			feedIdFilter = filter;
			activeFeedId = feedIdFilter;
			activeCategory = null;
			// Find the feed from the loaded feeds
			const feed = feeds.find((f) => f.id === feedIdFilter);
			currentFeed = feed ? { feed_id: feed.id, feed_title: feed.title } : null;
		} else {
			// Clear feed ID in "all" view
			activeFeedId = null;
			activeCategory = null;
			currentFeed = null;
		}

		if (categoryFilter) {
			// Filter feeds by domain category, excluding any filtered feeds
			const categoryFeeds = feeds.filter(f => {
				const domainCat = getDomainCategory(f.url, f.site_url);
				return domainCat === categoryFilter && !excludedFeedIds.has(f.id);
			});
			const feedIds = categoryFeeds.map(f => f.id);

			if (feedIds.length === 0) {
				// No feeds in this category
				loading = false;
				return;
			}

			// Query entries for feeds in this domain category
			const { data, error } = await supabase
				.from('entries')
				.select(`
					id,
					title,
					url,
					description,
					content,
					author,
					published_at,
					feed:feed_id (
						id,
						title,
						category,
						image,
						site_url
					)
				`)
				.in('feed_id', feedIds)
				.order('published_at', { ascending: false })
				.range(offset, offset + limit - 1);

			if (error) {
				console.error('Error loading category entries:', error);
			} else if (data) {
				// Transform data to match timeline entry format
				const transformedData = data.map(entry => {
					const feed = Array.isArray(entry.feed) ? entry.feed[0] : entry.feed;
					return {
						entry_id: entry.id,
						entry_title: entry.title,
						entry_url: entry.url,
						entry_description: entry.description,
						entry_content: entry.content,
						entry_author: entry.author,
						entry_published_at: entry.published_at || new Date().toISOString(),
						feed_id: feed.id,
						feed_title: feed.title,
						feed_category: feed.category,
						feed_image: feed.image?.replace(/\/+$/, '') || null,
						is_read: false,
						is_starred: false
					};
				});
				entries = [...entries, ...transformedData];
				hasMore = data.length === limit;
				offset += data.length;
			}
		} else {
			// Use the existing RPC function for other filters
			// Request more data to account for client-side filtering
			const hasFilters = excludedFeedIds.size > 0 || excludedCategories.size > 0;
			const requestLimit = hasFilters && !feedIdFilter ? limit * 2 : limit;

			const { data, error } = await supabase.rpc('get_user_timeline', {
				user_id_param: $user.id,
				feed_id_filter: feedIdFilter,
				starred_only: starredOnly,
				unread_only: unreadOnly,
				limit_param: requestLimit,
				offset_param: offset
			});

			if (error) {
				console.error('Error loading entries:', error);
			} else if (data) {
				// Clean up feed_image URLs by removing trailing slashes
				let cleanedData = data.map(entry => ({
					...entry,
					feed_image: entry.feed_image?.replace(/\/+$/, '') || null
				}));

				// Apply filters if not viewing a specific feed
				if (!feedIdFilter && (excludedFeedIds.size > 0 || excludedCategories.size > 0)) {
					cleanedData = cleanedData.filter(entry => {
						// Check if feed is excluded
						if (excludedFeedIds.has(entry.feed_id)) return false;

						// Check if category is excluded (need to find feed to get its category)
						const feed = feeds.find(f => f.id === entry.feed_id);
						if (feed) {
							const cat = getDomainCategory(feed.url, feed.site_url);
							if (excludedCategories.has(cat)) return false;
						}

						return true;
					});
				}

				entries = [...entries, ...cleanedData];
				hasMore = data.length === requestLimit;
				offset += data.length;
			}
		}

		loading = false;
	}

	async function handleToggleStar(entryId: string) {
		if (!$user) return;

		const { data, error } = await supabase.rpc('toggle_entry_star', {
			entry_id_param: entryId,
			user_id_param: $user.id
		});

		if (!error && typeof data === 'boolean') {
			// Update entries list
			entries = entries.map(e =>
				e.entry_id === entryId ? { ...e, is_starred: data } : e
			);

			// Update selected entry if it's the one being starred
			if (selectedEntry && selectedEntry.entry_id === entryId) {
				selectedEntry = { ...selectedEntry, is_starred: data };
			}
		}
	}

	async function handleMarkRead(entryId: string) {
		if (!$user) return;

		// Find the entry to check if it's already read
		const entry = entries.find(e => e.entry_id === entryId);
		const wasUnread = entry && !entry.is_read;

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

			// Update sidebar unread count immediately if the entry was unread
			if (wasUnread && entry) {
				sidebarStore.decrementUnreadCount(entry.feed_id);
			}
		}
	}

	function handleEntryClick(entry: TimelineEntry) {
		// Save scroll position for current view before viewing article
		if (timelineScrollContainer) {
			scrollPositions.set(filter, timelineScrollContainer.scrollTop);
		}
		selectedEntry = entry;
		// Reset scroll to top for the article view
		if (timelineScrollContainer && isDesktopMode) {
			requestAnimationFrame(() => {
				if (timelineScrollContainer) {
					timelineScrollContainer.scrollTop = 0;
				}
			});
		}
	}

	function closeEntryDetail() {
		selectedEntry = null;
		// Restore scroll position for current view after closing article
		if (timelineScrollContainer && isDesktopMode) {
			const savedPosition = scrollPositions.get(filter) || 0;
			requestAnimationFrame(() => {
				if (timelineScrollContainer) {
					timelineScrollContainer.scrollTop = savedPosition;
				}
			});
		}
	}

	// Compute the current view title for breadcrumbs
	const viewTitle = $derived(() => {
		if (filter === 'all') return 'All Posts';
		if (filter === 'starred') return 'Starred Posts';
		if (filter === 'unread') return 'Unread Posts';
		if (activeCategory) return activeCategory;
		if (currentFeed) return currentFeed.feed_title;
		return 'Feed Posts';
	});

	async function loadMore() {
		if (!loading && hasMore) {
			await loadEntries();
		}
	}
</script>

<!-- Mobile Header (only on mobile) - positioned fixed -->
{#if !isDesktopMode}
	<MobileHeader
		onMenuClick={() => isSidebarOpen = true}
	/>
{/if}

<!-- Mobile Sidebar (overlay - rendered outside main flex container) -->
{#if !isDesktopMode && isSidebarOpen}
	<Sidebar
		{activeFeedId}
		{activeCategory}
		isMobileOpen={true}
		onMobileClose={() => isSidebarOpen = false}
	/>
{/if}

<div class="flex h-screen bg-background overflow-hidden {!isDesktopMode ? 'pt-14' : ''}">
	<!-- Desktop Sidebar -->
	{#if isDesktopMode}
		<Sidebar {activeFeedId} {activeCategory} onCollapseChange={(collapsed) => isSidebarCollapsed = collapsed} />
	{/if}

	<!-- Main Content -->
	<div class="flex-1 flex overflow-hidden">
		<!-- Timeline / Article Content Area -->
		<div bind:this={timelineScrollContainer} class="flex-1 overflow-y-auto bg-secondary">
			<div class="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-4 md:px-6 mx-auto py-4 md:py-6">
				{#if selectedEntry && isDesktopMode}
					<!-- Desktop Article View with Breadcrumbs -->
					<!-- Breadcrumb Navigation - Sticky -->
					<nav class="sticky top-0 z-10 bg-secondary/95 backdrop-blur-sm -mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-4">
						<button
							onclick={closeEntryDetail}
							class="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group"
						>
							<span class="group-hover:underline">{viewTitle()}</span>
							<ChevronRight size={16} class="text-muted-foreground/50" />
							<span class="text-foreground font-medium truncate max-w-md">
								{selectedEntry.entry_title || 'Article'}
							</span>
						</button>
					</nav>

					<!-- Article Content -->
					<article class="bg-card border border-border rounded-lg p-6 md:p-8">
						<!-- Feed Info -->
						<div class="flex items-center gap-3 mb-4">
							{#if selectedEntry.feed_image}
								<img
									src={selectedEntry.feed_image}
									alt={selectedEntry.feed_title}
									class="w-8 h-8 rounded object-cover"
									onerror={(e) => { const target = e.target as HTMLImageElement;
										if (!target.dataset.fallbackAttempted) {
											target.dataset.fallbackAttempted = 'true';
											target.src = selectedEntry!.entry_url
												? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry!.entry_url)}&size=64`
												: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
										} else {
											target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
										}
									}}
								/>
							{:else if selectedEntry.entry_url}
								<img
									src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry.entry_url)}&size=64`}
									alt={selectedEntry.feed_title}
									class="w-8 h-8 rounded object-cover"
									onerror={(e) => { const target = e.target as HTMLImageElement;
										target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
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
						<div class="prose prose-invert max-w-none article-content">
							{#if selectedEntry.entry_content}
								{@html selectedEntry.entry_content}
							{:else if selectedEntry.entry_description}
								<p>{selectedEntry.entry_description}</p>
							{:else}
								<p class="text-muted-foreground">No content available</p>
							{/if}
						</div>
					</article>
				{:else}
					<!-- Posts List View -->
					<!-- Header with Search and Filter -->
					<div class="mb-4 md:mb-6 flex items-center justify-between gap-2">
						{#if showSearchInput}
							<!-- Search Input -->
							<div class="flex-1 flex items-center gap-2">
								<div class="relative flex-1 max-w-md">
									<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
									<input
										bind:this={searchInputRef}
										bind:value={searchQuery}
										type="text"
										placeholder="Search {viewTitle().toLowerCase()}..."
										class="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
										onkeydown={(e) => e.key === 'Escape' && (showSearchInput = false, searchQuery = '')}
									/>
									{#if searchQuery}
										<button
											onclick={() => searchQuery = ''}
											class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										>
											<X size={14} />
										</button>
									{/if}
								</div>
								<button
									onclick={() => { showSearchInput = false; searchQuery = ''; }}
									class="p-1.5 text-muted-foreground hover:text-foreground"
								>
									<X size={18} />
								</button>
							</div>
						{:else}
							<h1 class="text-xl md:text-2xl font-bold text-foreground tracking-tight">
								{viewTitle()}
							</h1>
						{/if}

						<!-- Search and Filter Buttons -->
						<div class="flex items-center gap-2">
							{#if !showSearchInput}
								<button
									onclick={() => { showSearchInput = true; requestAnimationFrame(() => searchInputRef?.focus()); }}
									class="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
									title="Search"
								>
									<Search size={18} />
								</button>
							{/if}

							<!-- Filter Button (only show in all posts, starred, unread, or category views) -->
							{#if filter === 'all' || filter === 'starred' || filter === 'unread' || filter.startsWith('category:')}
							<div class="relative">
								<button
									onclick={() => showFilterMenu = !showFilterMenu}
									class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors {activeFilterCount > 0 ? 'bg-primary/10 border-primary/50 text-primary' : 'text-muted-foreground'}"
								>
									<Filter size={16} />
									<span class="hidden sm:inline">Filter</span>
									{#if activeFilterCount > 0}
										<span class="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
											{activeFilterCount}
										</span>
									{/if}
								</button>

								<!-- Filter Dropdown -->
								{#if showFilterMenu}
									<!-- Backdrop -->
									<button
										class="fixed inset-0 z-40"
										onclick={() => showFilterMenu = false}
										aria-label="Close filter menu"
									></button>

									<div class="absolute right-0 top-full mt-2 w-72 max-h-96 flex flex-col bg-card border border-border rounded-lg shadow-lg z-50">
										<!-- Header -->
										<div class="flex-shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
											<span class="font-medium text-foreground">Filter Feeds</span>
											{#if activeFilterCount > 0}
												<button
													onclick={clearAllFilters}
													class="text-xs text-primary hover:underline"
												>
													Clear all
												</button>
											{/if}
										</div>

										<!-- Filter Options - scrollable -->
										<div class="flex-1 overflow-y-auto p-2">
											{#if filter.startsWith('category:')}
												<!-- Show feeds in this category -->
												{@const currentCategoryName = decodeURIComponent(filter.substring(9))}
												{@const categoryData = feedCategories().find(c => c.name === currentCategoryName)}
												{#if categoryData}
													<div class="text-xs text-muted-foreground px-2 py-1 mb-1">
														Feeds in {currentCategoryName}
													</div>
													{#each categoryData.feeds as feed}
														<button
															onclick={() => toggleFeedFilter(feed.id)}
															class="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left"
														>
															<div class="w-5 h-5 rounded border flex items-center justify-center {excludedFeedIds.has(feed.id) ? 'bg-muted border-muted-foreground/30' : 'border-primary bg-primary'}">
																{#if !excludedFeedIds.has(feed.id)}
																	<Check size={14} class="text-primary-foreground" />
																{/if}
															</div>
															<span class="text-sm {excludedFeedIds.has(feed.id) ? 'text-muted-foreground line-through' : 'text-foreground'}">
																{feed.title || 'Untitled Feed'}
															</span>
														</button>
													{/each}
												{/if}
											{:else}
												<!-- Show categories with nested feeds -->
												{#each feedCategories() as category}
													<!-- Category Header -->
													<button
														onclick={() => toggleCategoryFilter(category.name)}
														class="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left"
													>
														<div class="w-5 h-5 rounded border flex items-center justify-center {excludedCategories.has(category.name) ? 'bg-muted border-muted-foreground/30' : isCategoryPartiallyExcluded(category.name) ? 'border-primary bg-primary/50' : 'border-primary bg-primary'}">
															{#if !excludedCategories.has(category.name) && !isCategoryFullyExcluded(category.name)}
																<Check size={14} class="text-primary-foreground" />
															{/if}
														</div>
														<span class="text-sm font-medium {excludedCategories.has(category.name) ? 'text-muted-foreground line-through' : 'text-foreground'}">
															{category.name}
														</span>
														<span class="text-xs text-muted-foreground ml-auto">
															{category.feeds.length} feed{category.feeds.length !== 1 ? 's' : ''}
														</span>
													</button>

													<!-- Feeds in Category (indented) -->
													{#if !excludedCategories.has(category.name)}
														{#each category.feeds as feed}
															<button
																onclick={() => toggleFeedFilter(feed.id)}
																class="w-full flex items-center gap-2 px-2 py-1.5 pl-8 rounded-md hover:bg-accent transition-colors text-left"
															>
																<div class="w-4 h-4 rounded border flex items-center justify-center {excludedFeedIds.has(feed.id) ? 'bg-muted border-muted-foreground/30' : 'border-primary bg-primary'}">
																	{#if !excludedFeedIds.has(feed.id)}
																		<Check size={12} class="text-primary-foreground" />
																	{/if}
																</div>
																<span class="text-sm truncate {excludedFeedIds.has(feed.id) ? 'text-muted-foreground line-through' : 'text-foreground'}">
																	{feed.title || 'Untitled Feed'}
																</span>
															</button>
														{/each}
													{/if}
												{/each}
											{/if}
										</div>

										<!-- Footer hint - always visible -->
										<div class="flex-shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
											Unchecked items are hidden from view
										</div>
									</div>
								{/if}
							</div>
							{/if}
						</div>
					</div>

					<!-- Entries -->
					{#if loading && entries.length === 0}
						<div class="space-y-2">
							{#each Array(5) as _, i}
								<div class="bg-card border border-border rounded-lg p-4">
									<div class="flex items-start gap-4">
										<Skeleton variant="circular" width="40px" height="40px" />
										<div class="flex-1 space-y-3">
											<Skeleton width="70%" height="20px" />
											<Skeleton width="100%" height="16px" />
											<Skeleton width="90%" height="16px" />
											<Skeleton width="60%" height="16px" />
											<div class="flex gap-2 mt-4">
												<Skeleton width="80px" height="32px" />
												<Skeleton width="80px" height="32px" />
											</div>
										</div>
									</div>
								</div>
							{/each}
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
					{:else if filteredEntries().length === 0 && searchQuery}
						<div class="text-center py-12">
							<p class="text-muted-foreground">No results for "{searchQuery}"</p>
							<button
								onclick={() => searchQuery = ''}
								class="text-primary hover:text-primary/90 mt-2 inline-block"
							>
								Clear search
							</button>
						</div>
					{:else}
						<!-- Search results count -->
						{#if searchQuery && filteredEntries().length > 0}
							<p class="text-sm text-muted-foreground mb-3">
								{filteredEntries().length} result{filteredEntries().length !== 1 ? 's' : ''} for "{searchQuery}"
							</p>
						{/if}

						<div class="space-y-2">
							{#each filteredEntries() as entry (entry.entry_id)}
								<EntryCard
									{entry}
									onToggleStar={handleToggleStar}
									onMarkRead={handleMarkRead}
									onClick={handleEntryClick}
									isSelected={false}
								/>
							{/each}
						</div>

						<!-- Infinite scroll sentinel and loading indicator -->
						{#if hasMore}
							<div
								bind:this={loadMoreElement}
								class="text-center py-6"
							>
								{#if loading}
									<div class="flex items-center justify-center gap-2 text-muted-foreground">
										<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
										<span>Loading more posts...</span>
									</div>
								{:else}
									<p class="text-muted-foreground text-sm">Scroll for more</p>
								{/if}
							</div>
						{:else if entries.length > 0}
							<div class="text-center py-6">
								<p class="text-muted-foreground text-sm">No more posts</p>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</div>

		<!-- Mobile Entry Detail Overlay -->
		{#if selectedEntry && !isDesktopMode}
			<div class="fixed inset-0 z-50 bg-card overflow-y-auto slide-in-right safe-area-inset-top">
				<div class="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-4 flex items-center z-10 safe-area-inset-top">
					<button
						onclick={closeEntryDetail}
						class="text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg p-2 transition-all -ml-2"
						title="Back"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="m15 18-6-6 6-6"/>
						</svg>
					</button>
					<h2 class="font-semibold text-lg text-foreground flex-1 text-center pr-10">Article</h2>
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
									const target = e.target as HTMLImageElement;
									if (!target.dataset.fallbackAttempted) {
										target.dataset.fallbackAttempted = 'true';
										target.src = selectedEntry!.entry_url
											? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry!.entry_url)}&size=64`
											: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
									} else {
										target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
									}
								}}
							/>
						{:else if selectedEntry.entry_url}
							<img
								src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(selectedEntry.entry_url)}&size=64`}
								alt={selectedEntry.feed_title}
								class="w-8 h-8 rounded object-cover"
								onerror={(e) => {
									const target = e.target as HTMLImageElement;
									target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
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
					<div class="prose prose-invert max-w-none article-content">
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

		<!-- AI Chat Panel (Desktop: always visible, Mobile: overlay with FAB trigger) -->
		{#if isDesktopMode}
			<AIChat
				contextType={selectedEntry ? 'entry' : 'feed'}
				contextId={selectedEntry?.entry_id || activeFeedId}
				currentView={filter === 'all' ? 'all' : filter === 'starred' ? 'starred' : filter === 'unread' ? 'unread' : 'feed'}
				currentCategory={activeCategory}
				{currentFeed}
				currentEntry={selectedEntry
					? {
							entry_id: selectedEntry.entry_id,
							entry_title: selectedEntry.entry_title,
							entry_content: selectedEntry.entry_content,
							entry_description: selectedEntry.entry_description,
							entry_author: selectedEntry.entry_author,
							entry_published_at: selectedEntry.entry_published_at,
							entry_url: selectedEntry.entry_url
						}
					: null}
				timelineEntries={entries}
				{feeds}
			/>
		{:else}
			<!-- Mobile FAB for AI Chat (hidden when chat is open) -->
			{#if !isChatOpen}
				<button
					onclick={() => isChatOpen = true}
					class="fab"
					aria-label="Open AI Chat"
				>
					<MessageCircle size={24} />
				</button>
			{/if}

			<!-- Mobile AI Chat Overlay -->
			{#if isChatOpen}
				<div class="fixed inset-0 z-50 bg-background slide-in-right safe-area-inset-top">
					<AIChat
						contextType={selectedEntry ? 'entry' : 'feed'}
						contextId={selectedEntry?.entry_id || activeFeedId}
						currentView={filter === 'all' ? 'all' : filter === 'starred' ? 'starred' : filter === 'unread' ? 'unread' : 'feed'}
						currentCategory={activeCategory}
						{currentFeed}
						currentEntry={selectedEntry
							? {
									entry_id: selectedEntry.entry_id,
									entry_title: selectedEntry.entry_title,
									entry_content: selectedEntry.entry_content,
									entry_description: selectedEntry.entry_description,
									entry_author: selectedEntry.entry_author,
									entry_published_at: selectedEntry.entry_published_at,
									entry_url: selectedEntry.entry_url
								}
							: null}
						timelineEntries={entries}
						{feeds}
						isMobileOverlay={true}
						onClose={() => isChatOpen = false}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* Override float styles on images in article content to display in normal flow */
	:global(.article-content img) {
		float: none !important;
		display: block !important;
		margin-left: auto !important;
		margin-right: auto !important;
		margin-top: 1rem !important;
		margin-bottom: 1rem !important;
		max-width: 100% !important;
		height: auto !important;
	}

	/* Also handle images that might be wrapped in align attributes */
	:global(.article-content [align]) {
		text-align: left !important;
	}

	/* Convert tables used for layout to block elements */
	:global(.article-content table) {
		display: block !important;
		width: 100% !important;
		float: none !important;
	}

	:global(.article-content tbody),
	:global(.article-content thead),
	:global(.article-content tfoot) {
		display: block !important;
	}

	:global(.article-content tr) {
		display: block !important;
	}

	:global(.article-content td),
	:global(.article-content th) {
		display: block !important;
		width: 100% !important;
		float: none !important;
	}

	:global(.article-content table img) {
		float: none !important;
		display: block !important;
	}

	/* Handle figure elements that might contain floated images */
	:global(.article-content figure) {
		float: none !important;
		margin-left: auto !important;
		margin-right: auto !important;
	}

	/* Handle divs with inline styles for alignment */
	:global(.article-content div) {
		float: none !important;
	}
</style>
