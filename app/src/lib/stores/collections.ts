import { writable, get } from 'svelte/store';
import { supabase } from '$lib/services/supabase';
import { user } from '$lib/stores/auth';

export interface Collection {
	collection_id: string;
	collection_name: string;
	icon_name: string;
	display_order: number;
	feed_count: number;
	unread_count: number;
}

export interface CollectionFeed {
	feed_id: string;
	feed_title: string;
	feed_image: string | null;
	feed_site_url: string | null;
}

interface CollectionsState {
	collections: Collection[];
	isLoading: boolean;
	lastLoadedAt: number | null;
}

const initialState: CollectionsState = {
	collections: [],
	isLoading: false,
	lastLoadedAt: null
};

function createCollectionsStore() {
	const { subscribe, set, update } = writable<CollectionsState>(initialState);

	async function loadCollections(forceReload = false) {
		const currentUser = get(user);
		if (!currentUser) return;

		const state = get({ subscribe });

		// Skip if already loading
		if (state.isLoading) return;

		// Skip if loaded recently (within 5 seconds) and not forcing reload
		const now = Date.now();
		if (!forceReload && state.lastLoadedAt && now - state.lastLoadedAt < 5000) {
			return;
		}

		update((s) => ({ ...s, isLoading: true }));

		const { data, error } = await supabase.rpc('get_user_collections_with_counts', {
			user_id_param: currentUser.id
		});

		if (error) {
			console.error('Error loading collections:', error);
			update((s) => ({ ...s, isLoading: false }));
			return;
		}

		update((s) => ({
			...s,
			collections: data || [],
			isLoading: false,
			lastLoadedAt: Date.now()
		}));
	}

	async function createCollection(name: string, iconName: string = 'Folder'): Promise<string | null> {
		const currentUser = get(user);
		if (!currentUser) return null;

		// Get current max display_order
		const state = get({ subscribe });
		const maxOrder = state.collections.reduce((max, c) => Math.max(max, c.display_order), -1);

		const { data, error } = await supabase
			.from('feed_collections')
			.insert({
				user_id: currentUser.id,
				name,
				icon_name: iconName,
				display_order: maxOrder + 1
			})
			.select('id')
			.single();

		if (error) {
			// Handle duplicate name error
			if (error.code === '23505') {
				throw new Error(`A collection named "${name}" already exists`);
			}
			console.error('Error creating collection:', error);
			throw new Error('Failed to create collection');
		}

		// Reload collections to get updated counts
		await loadCollections(true);
		return data.id;
	}

	async function updateCollection(
		collectionId: string,
		name: string,
		iconName: string
	): Promise<boolean> {
		const currentUser = get(user);
		if (!currentUser) return false;

		const { error } = await supabase
			.from('feed_collections')
			.update({
				name,
				icon_name: iconName,
				updated_at: new Date().toISOString()
			})
			.eq('id', collectionId)
			.eq('user_id', currentUser.id);

		if (error) {
			// Handle duplicate name error
			if (error.code === '23505') {
				throw new Error(`A collection named "${name}" already exists`);
			}
			console.error('Error updating collection:', error);
			throw new Error('Failed to update collection');
		}

		// Update local state
		update((s) => ({
			...s,
			collections: s.collections.map((c) =>
				c.collection_id === collectionId ? { ...c, collection_name: name, icon_name: iconName } : c
			)
		}));

		return true;
	}

	async function deleteCollection(collectionId: string): Promise<boolean> {
		const currentUser = get(user);
		if (!currentUser) return false;

		const { error } = await supabase
			.from('feed_collections')
			.delete()
			.eq('id', collectionId)
			.eq('user_id', currentUser.id);

		if (error) {
			console.error('Error deleting collection:', error);
			return false;
		}

		// Update local state
		update((s) => ({
			...s,
			collections: s.collections.filter((c) => c.collection_id !== collectionId)
		}));

		return true;
	}

	async function addFeedToCollection(collectionId: string, feedId: string): Promise<boolean> {
		const currentUser = get(user);
		if (!currentUser) return false;

		const { error } = await supabase.from('collection_feeds').insert({
			collection_id: collectionId,
			feed_id: feedId
		});

		if (error) {
			// Ignore unique constraint violations (feed already in collection)
			if (error.code === '23505') {
				return true;
			}
			console.error('Error adding feed to collection:', error);
			return false;
		}

		// Reload to get updated counts
		await loadCollections(true);
		return true;
	}

	async function removeFeedFromCollection(collectionId: string, feedId: string): Promise<boolean> {
		const currentUser = get(user);
		if (!currentUser) return false;

		const { error } = await supabase
			.from('collection_feeds')
			.delete()
			.eq('collection_id', collectionId)
			.eq('feed_id', feedId);

		if (error) {
			console.error('Error removing feed from collection:', error);
			return false;
		}

		// Reload to get updated counts
		await loadCollections(true);
		return true;
	}

	async function getCollectionFeeds(collectionId: string): Promise<CollectionFeed[]> {
		const currentUser = get(user);
		if (!currentUser) return [];

		// First get the feed IDs in this collection
		const { data: collectionFeedData, error: cfError } = await supabase
			.from('collection_feeds')
			.select('feed_id')
			.eq('collection_id', collectionId);

		if (cfError || !collectionFeedData?.length) {
			if (cfError) console.error('Error loading collection feeds:', cfError);
			return [];
		}

		const feedIds = collectionFeedData.map((cf) => cf.feed_id);

		// Then get the full feed details
		const { data: feedsData, error: feedsError } = await supabase
			.from('feeds')
			.select('id, title, image, site_url')
			.in('id', feedIds);

		if (feedsError) {
			console.error('Error loading feeds:', feedsError);
			return [];
		}

		return (feedsData || []).map((feed) => ({
			feed_id: feed.id,
			feed_title: feed.title || 'Untitled Feed',
			feed_image: feed.image,
			feed_site_url: feed.site_url
		}));
	}

	async function reorderCollections(orderedIds: string[]): Promise<boolean> {
		const currentUser = get(user);
		if (!currentUser) return false;

		// Update display_order for each collection
		const updates = orderedIds.map((id, index) =>
			supabase
				.from('feed_collections')
				.update({ display_order: index, updated_at: new Date().toISOString() })
				.eq('id', id)
				.eq('user_id', currentUser.id)
		);

		const results = await Promise.all(updates);
		const hasError = results.some((r) => r.error);

		if (hasError) {
			console.error('Error reordering collections');
			return false;
		}

		// Update local state
		update((s) => ({
			...s,
			collections: orderedIds
				.map((id, index) => {
					const collection = s.collections.find((c) => c.collection_id === id);
					return collection ? { ...collection, display_order: index } : null;
				})
				.filter((c): c is Collection => c !== null)
		}));

		return true;
	}

	function decrementUnreadCount(feedId: string) {
		// Find all collections that contain this feed and decrement their unread counts
		// This is called when an entry is marked as read
		update((s) => {
			// We need to reload to get accurate counts since we don't track feed membership locally
			// For now, just trigger a reload
			return s;
		});
		// Trigger async reload
		loadCollections(true);
	}

	function reset() {
		set(initialState);
	}

	return {
		subscribe,
		loadCollections,
		createCollection,
		updateCollection,
		deleteCollection,
		addFeedToCollection,
		removeFeedFromCollection,
		getCollectionFeeds,
		reorderCollections,
		decrementUnreadCount,
		reset
	};
}

export const collectionsStore = createCollectionsStore();
