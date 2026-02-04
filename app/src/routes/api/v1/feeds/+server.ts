// GET /api/v1/feeds - User's subscribed feeds endpoint
// Returns feeds with metadata and unread counts (non-paginated)

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// Get userId from auth middleware (guaranteed to exist for /api/v1/* routes)
	const userId = locals.apiUser!.userId;

	const supabase = getSupabaseAdmin();

	// 1. Query user's subscribed feeds with metadata
	const { data: subscriptions, error: subError } = await supabase
		.from('user_subscriptions')
		.select(
			`
			feed_id,
			subscribed_at,
			feeds:feed_id (
				id,
				title,
				url,
				site_url,
				description,
				category,
				image
			)
		`
		)
		.eq('user_id', userId)
		.order('subscribed_at', { ascending: false });

	if (subError) {
		console.error('Feeds query error:', subError);
		return serverError();
	}

	// 2. Handle empty subscriptions - return empty array (not error)
	if (!subscriptions || subscriptions.length === 0) {
		return successResponse([]);
	}

	// 3. Get unread counts via existing RPC
	const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
		user_id_param: userId
	});

	if (unreadError) {
		console.error('Unread counts query error:', unreadError);
		return serverError();
	}

	// 4. Build unread count map for O(1) lookup
	const unreadMap = new Map<string, number>(
		unreadData?.map((u: { feed_id: string; unread_count: number }) => [
			u.feed_id,
			u.unread_count
		]) || []
	);

	// 5. Transform to response shape
	const feeds = subscriptions
		.filter((sub) => sub.feeds) // Filter out any broken relations
		.map((sub) => {
			// Handle Supabase returning feed as array or object
			const feed = Array.isArray(sub.feeds) ? sub.feeds[0] : sub.feeds;

			return {
				id: feed.id,
				title: feed.title,
				url: feed.url,
				site_url: feed.site_url,
				description: feed.description,
				category: feed.category,
				image: feed.image,
				unread_count: unreadMap.get(feed.id) || 0,
				subscribed_at: sub.subscribed_at
			};
		});

	return successResponse(feeds);
};
