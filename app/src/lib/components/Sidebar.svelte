<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Settings, LogOut, Search, ChevronRight } from 'lucide-svelte';

	interface FeedWithUnread {
		feed_id: string;
		feed_title: string;
		feed_category: string;
		feed_image: string | null;
		feed_site_url: string | null;
		unread_count: number;
	}

	interface CategoryGroup {
		category: string;
		feeds: FeedWithUnread[];
		totalUnread: number;
	}

	let { activeFeedId = null, activeCategory = null }: { activeFeedId?: string | null; activeCategory?: string | null } = $props();

	let feeds = $state<FeedWithUnread[]>([]);
	let categorizedFeeds = $state<CategoryGroup[]>([]);
	let totalUnread = $state(0);
	let currentPath = $state('');
	let expandedCategories = $state<Set<string>>(new Set());

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

		// Group by category
		const categoryMap = new Map<string, FeedWithUnread[]>();
		let total = 0;

		feeds.forEach(feed => {
			if (!categoryMap.has(feed.feed_category)) {
				categoryMap.set(feed.feed_category, []);
			}
			categoryMap.get(feed.feed_category)!.push(feed);
			total += feed.unread_count;
		});

		categorizedFeeds = Array.from(categoryMap.entries())
			.map(([category, feeds]) => ({
				category,
				feeds,
				totalUnread: feeds.reduce((sum, f) => sum + f.unread_count, 0)
			}))
			.sort((a, b) => a.category.localeCompare(b.category));

		totalUnread = total;
	}

	async function handleSignOut() {
		await signOut();
		goto('/auth/login');
	}

	function toggleCategory(category: string) {
		const newExpanded = new Set(expandedCategories);
		if (newExpanded.has(category)) {
			newExpanded.delete(category);
		} else {
			newExpanded.add(category);
		}
		expandedCategories = newExpanded;
	}

	function handleCategoryClick(category: string, event: MouseEvent) {
		event.preventDefault();
		goto(`/timeline/category:${encodeURIComponent(category)}`);
	}
</script>

<div class="w-64 bg-card border-r border-border flex flex-col h-screen">
	<!-- Header -->
	<div class="p-4 border-b border-border">
		<h1 class="text-xl font-bold text-foreground">LeadrFeeds</h1>
	</div>

	<!-- Navigation -->
	<nav class="flex-1 overflow-y-auto">
		<!-- Main Navigation -->
		<div class="p-3 space-y-0.5">
			<a
				href="/timeline/all"
				class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all {currentPath === '/timeline/all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-accent/50'}"
			>
				<Home size={18} />
				<span class="flex-1">All Posts</span>
				{#if totalUnread > 0}
					<span class="px-2 py-0.5 text-xs font-semibold rounded-md bg-primary/20 text-primary {currentPath === '/timeline/all' ? 'bg-primary-foreground/20 text-primary-foreground' : ''}">
						{totalUnread}
					</span>
				{/if}
			</a>

			<a
				href="/timeline/starred"
				class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all {currentPath === '/timeline/starred' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-accent/50'}"
			>
				<Star size={18} />
				<span>Starred</span>
			</a>

			<a
				href="/discover"
				class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all {currentPath === '/discover' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-accent/50'}"
			>
				<Search size={18} />
				<span>Discover</span>
			</a>
		</div>

		<!-- Divider -->
		<div class="mx-3 my-2 border-t border-border"></div>

		<!-- Feeds by Category -->
		{#if categorizedFeeds.length > 0}
			<div class="p-3 space-y-1">
				{#each categorizedFeeds as group}
					<div>
						<!-- Category Header -->
						<button
							onclick={() => toggleCategory(group.category)}
							class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-accent/50 group"
						>
							<ChevronRight
								size={14}
								class="text-muted-foreground transition-transform duration-200 {expandedCategories.has(group.category) ? 'rotate-90' : ''}"
							/>
							<span class="flex-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{group.category}
							</span>
							{#if group.totalUnread > 0}
								<span class="px-1.5 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary">
									{group.totalUnread}
								</span>
							{/if}
						</button>

						<!-- Category Feeds (Collapsed by default) -->
						{#if expandedCategories.has(group.category)}
							<div class="mt-0.5 ml-4 space-y-0.5">
								<!-- "All in Category" option -->
								<a
									href="/timeline/category:{encodeURIComponent(group.category)}"
									class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all {activeCategory === group.category ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground'}"
								>
									<div class="w-4 h-4 rounded flex items-center justify-center bg-primary/10">
										<div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
									</div>
									<span class="flex-1 text-xs font-medium">All {group.category}</span>
									{#if group.totalUnread > 0}
										<span class="px-1.5 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary">
											{group.totalUnread}
										</span>
									{/if}
								</a>

								<!-- Individual Feeds -->
								{#each group.feeds as feed}
									<a
										href="/timeline/{feed.feed_id}"
										class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all {activeFeedId === feed.feed_id ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground'}"
									>
										{#if feed.feed_image}
											<img
												src={feed.feed_image}
												alt={feed.feed_title}
												class="w-4 h-4 rounded object-cover flex-shrink-0"
												onerror={(e) => {
													if (!e.target.dataset.fallbackAttempted) {
														e.target.dataset.fallbackAttempted = 'true';
														e.target.src = feed.feed_site_url
															? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`
															: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
													}
												}}
											/>
										{:else if feed.feed_site_url}
											<img
												src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=32`}
												alt={feed.feed_title}
												class="w-4 h-4 rounded object-cover flex-shrink-0"
												onerror={(e) => {
													e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3C/svg%3E';
												}}
											/>
										{:else}
											<div class="w-4 h-4 rounded flex items-center justify-center bg-accent/20 flex-shrink-0">
												<div class="w-2 h-2 rounded-full bg-muted-foreground/40"></div>
											</div>
										{/if}
										<span class="flex-1 truncate text-xs">{feed.feed_title}</span>
										{#if feed.unread_count > 0}
											<span class="px-1.5 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary">
												{feed.unread_count}
											</span>
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
	<div class="p-3 border-t border-border space-y-0.5">
		<a
			href="/settings"
			class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent/50 transition-all"
		>
			<Settings size={18} />
			<span>Settings</span>
		</a>

		<button
			onclick={handleSignOut}
			class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent/50 transition-all"
		>
			<LogOut size={18} />
			<span>Sign Out</span>
		</button>
	</div>
</div>

<style>
	/* Smooth transitions */
	* {
		transition-property: background-color, color, transform;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 150ms;
	}
</style>
