<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/services/supabase';
	import { user, signOut } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Home, Star, Settings, LogOut, Search, ChevronRight, ChevronDown } from 'lucide-svelte';

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
	<nav class="flex-1 overflow-y-auto p-4">
		<div class="space-y-1 mb-6">
			<a
				href="/timeline/all"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath === '/timeline/all' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'}"
			>
				<Home size={18} />
				<span class="flex-1">All Posts</span>
				{#if totalUnread > 0}
					<span class="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
						{totalUnread}
					</span>
				{/if}
			</a>

			<a
				href="/timeline/starred"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath === '/timeline/starred' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'}"
			>
				<Star size={18} />
				<span>Starred</span>
			</a>

			<a
				href="/discover"
				class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath === '/discover' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'}"
			>
				<Search size={18} />
				<span>Discover</span>
			</a>
		</div>

		<!-- Categorized Feeds -->
		{#if categorizedFeeds.length > 0}
			<div class="space-y-4">
				{#each categorizedFeeds as group}
					<div>
						<div class="flex items-center gap-1">
							<button
								onclick={() => toggleCategory(group.category)}
								class="p-2 hover:bg-accent rounded-md transition-colors"
								aria-label="Toggle category"
							>
								{#if expandedCategories.has(group.category)}
									<ChevronDown size={16} class="text-muted-foreground" />
								{:else}
									<ChevronRight size={16} class="text-muted-foreground" />
								{/if}
							</button>
							<button
								onclick={(e) => handleCategoryClick(group.category, e)}
								class="flex-1 flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent transition-colors text-left {activeCategory === group.category ? 'bg-accent' : ''}"
							>
								<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									{group.category}
								</h3>
								{#if group.totalUnread > 0}
									<span class="text-xs text-muted-foreground">
										{group.totalUnread}
									</span>
								{/if}
							</button>
						</div>

						{#if expandedCategories.has(group.category)}
							<div class="space-y-1 ml-2">
								{#each group.feeds as feed}
									<a
										href="/timeline/{feed.feed_id}"
										class="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors {activeFeedId === feed.feed_id ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent'}"
									>
									{#if feed.feed_image}
										<img
											src={feed.feed_image}
											alt={feed.feed_title}
											class="w-5 h-5 rounded object-cover"
											onerror={(e) => {
												if (!e.target.dataset.fallbackAttempted) {
													e.target.dataset.fallbackAttempted = 'true';
													e.target.src = feed.feed_site_url
														? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=64`
														: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
												} else {
													e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
												}
											}}
										/>
									{:else if feed.feed_site_url}
										<img
											src={`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(feed.feed_site_url)}&size=64`}
											alt={feed.feed_title}
											class="w-5 h-5 rounded object-cover"
											onerror={(e) => {
												e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22%3E%3Cpath d=%22M4 11a9 9 0 0 1 9 9%22/%3E%3Cpath d=%22M4 4a16 16 0 0 1 16 16%22/%3E%3Ccircle cx=%225%22 cy=%2219%22 r=%221%22/%3E%3C/svg%3E';
											}}
										/>
									{:else}
										<div class="w-5 h-5 rounded flex items-center justify-center bg-accent/10">
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2">
												<path d="M4 11a9 9 0 0 1 9 9"/>
												<path d="M4 4a16 16 0 0 1 16 16"/>
												<circle cx="5" cy="19" r="1"/>
											</svg>
										</div>
									{/if}
									<span class="flex-1 truncate">{feed.feed_title}</span>
									{#if feed.unread_count > 0}
										<span class="px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
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
	<div class="p-4 border-t border-border space-y-1">
		<a
			href="/settings"
			class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
		>
			<Settings size={18} />
			<span>Settings</span>
		</a>

		<button
			onclick={handleSignOut}
			class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
		>
			<LogOut size={18} />
			<span>Sign Out</span>
		</button>
	</div>
</div>
