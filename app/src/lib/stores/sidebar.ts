import { writable, get } from 'svelte/store';
import { supabase } from '$lib/services/supabase';
import { user } from '$lib/stores/auth';

export interface FeedWithUnread {
	feed_id: string;
	feed_title: string;
	feed_category: string;
	feed_url: string | null;
	feed_image: string | null;
	feed_site_url: string | null;
	unread_count: number;
}

interface SidebarState {
	feeds: FeedWithUnread[];
	totalUnread: number;
	pendingSuggestionsCount: number;
	isLoading: boolean;
	lastLoadedAt: number | null;
}

const initialState: SidebarState = {
	feeds: [],
	totalUnread: 0,
	pendingSuggestionsCount: 0,
	isLoading: false,
	lastLoadedAt: null
};

function createSidebarStore() {
	const { subscribe, set, update } = writable<SidebarState>(initialState);

	let refreshInterval: ReturnType<typeof setInterval> | null = null;

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
			const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
			return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
		} catch (e) {
			return 'Other';
		}
	}

	async function loadFeeds(forceReload = false) {
		const currentUser = get(user);
		if (!currentUser) return;

		const state = get({ subscribe });

		// Skip if already loading
		if (state.isLoading) return;

		// Skip if loaded recently (within 5 seconds) and not forcing reload
		const now = Date.now();
		if (!forceReload && state.lastLoadedAt && (now - state.lastLoadedAt) < 5000) {
			return;
		}

		update(s => ({ ...s, isLoading: true }));

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
			.eq('user_id', currentUser.id)
			.order('subscribed_at', { ascending: false });

		if (feedsError) {
			console.error('Error loading feeds:', feedsError);
			update(s => ({ ...s, isLoading: false }));
			return;
		}

		// Get unread counts
		const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
			user_id_param: currentUser.id
		});

		if (unreadError) {
			console.error('Error loading unread counts:', unreadError);
			update(s => ({ ...s, isLoading: false }));
			return;
		}

		const unreadMap = new Map(unreadData?.map((u: { feed_id: string; unread_count: number }) => [u.feed_id, u.unread_count]) || []);

		// Build feeds list with domain-based categories
		const genericTitles = ['YouTube', 'GitHub', 'Reddit', 'Medium', 'Substack', 'Twitter/X', 'LinkedIn', 'Feed'];

		const feeds = (userFeeds || [])
			.filter((uf: any) => uf.feeds)
			.map((uf: any) => {
				const feed = Array.isArray(uf.feeds) ? uf.feeds[0] : uf.feeds;
				const feedUrl = feed.url || feed.site_url;
				const domainCategory = getDomainCategory(feedUrl);
				const hasGenericTitle = !feed.title || genericTitles.includes(feed.title);
				const hasImage = !!feed.image;
				const isPendingSync = hasGenericTitle && !hasImage;
				return {
					feed_id: feed.id,
					feed_title: feed.title || domainCategory,
					feed_category: domainCategory,
					feed_url: feedUrl,
					feed_image: feed.image?.replace(/\/+$/, '') || null,
					feed_site_url: feed.site_url || null,
					unread_count: unreadMap.get(feed.id) || 0,
					_isPendingSync: isPendingSync
				};
			})
			.filter((f: any) => !f._isPendingSync) as FeedWithUnread[];

		const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0);

		update(s => ({
			...s,
			feeds,
			totalUnread,
			isLoading: false,
			lastLoadedAt: Date.now()
		}));
	}

	async function loadPendingSuggestionsCount() {
		const currentUser = get(user);
		if (!currentUser || currentUser.email !== 'hsbazr@gmail.com') return;

		const { data, error } = await supabase.rpc('get_pending_suggestions_count');

		if (error) {
			console.error('Error loading pending suggestions count:', error);
			return;
		}

		update(s => ({ ...s, pendingSuggestionsCount: data || 0 }));
	}

	function startRefreshInterval() {
		// Clear existing interval if any
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}

		// Refresh every 30 seconds
		refreshInterval = setInterval(async () => {
			await loadFeeds(true);
			await loadPendingSuggestionsCount();
		}, 30000);
	}

	function stopRefreshInterval() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	function reset() {
		stopRefreshInterval();
		set(initialState);
	}

	return {
		subscribe,
		loadFeeds,
		loadPendingSuggestionsCount,
		startRefreshInterval,
		stopRefreshInterval,
		reset
	};
}

export const sidebarStore = createSidebarStore();
