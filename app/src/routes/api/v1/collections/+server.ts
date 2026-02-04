// GET /api/v1/collections - User's collections with nested feeds
// Returns collections with feed_count, unread_count, and feeds array

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// Get userId from auth middleware (guaranteed to exist for /api/v1/* routes)
	const userId = locals.apiUser!.userId;

	const supabase = getSupabaseAdmin();

	// 1. Get collections with counts via RPC
	const { data: collections, error: collError } = await supabase.rpc(
		'get_user_collections_with_counts',
		{ user_id_param: userId }
	);

	if (collError) {
		console.error('Collections query error:', collError);
		return serverError();
	}

	// Handle no collections - return empty array
	if (!collections || collections.length === 0) {
		return successResponse([]);
	}

	// 2. Batch query all feeds for all collections (avoid N+1)
	const collectionIds = collections.map(
		(c: { collection_id: string }) => c.collection_id
	);

	const { data: collectionFeeds, error: cfError } = await supabase
		.from('collection_feeds')
		.select(
			`
			collection_id,
			feeds:feed_id (
				id,
				title,
				url,
				site_url,
				image,
				category
			)
		`
		)
		.in('collection_id', collectionIds);

	if (cfError) {
		console.error('Collection feeds query error:', cfError);
		return serverError();
	}

	// 3. Group feeds by collection_id using Map for O(1) lookup
	const feedsByCollection = new Map<
		string,
		Array<{
			id: string;
			title: string | null;
			url: string;
			site_url: string | null;
			image: string | null;
			category: string | null;
		}>
	>();

	for (const cf of collectionFeeds || []) {
		if (!cf.feeds) continue;

		// Handle Supabase returning feed as array or object
		const feed = Array.isArray(cf.feeds) ? cf.feeds[0] : cf.feeds;

		if (!feedsByCollection.has(cf.collection_id)) {
			feedsByCollection.set(cf.collection_id, []);
		}
		feedsByCollection.get(cf.collection_id)!.push({
			id: feed.id,
			title: feed.title,
			url: feed.url,
			site_url: feed.site_url,
			image: feed.image,
			category: feed.category
		});
	}

	// 4. Build response with nested feeds
	const result = collections.map(
		(c: {
			collection_id: string;
			collection_name: string;
			icon_name: string;
			display_order: number;
			feed_count: number;
			unread_count: number;
		}) => ({
			id: c.collection_id,
			name: c.collection_name,
			icon_name: c.icon_name,
			display_order: c.display_order,
			feed_count: c.feed_count,
			unread_count: c.unread_count,
			feeds: feedsByCollection.get(c.collection_id) || []
		})
	);

	return successResponse(result);
};
