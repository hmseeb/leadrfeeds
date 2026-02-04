// GET /api/v1/stats - User aggregate statistics
// Returns total_unread, total_starred, and per-feed unread counts

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// Get userId from auth middleware (guaranteed to exist for /api/v1/* routes)
	const userId = locals.apiUser!.userId;

	const supabase = getSupabaseAdmin();

	// 1. Get unread counts per feed via existing RPC
	const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
		user_id_param: userId
	});

	if (unreadError) {
		console.error('Unread counts error:', unreadError);
		return serverError();
	}

	// 2. Calculate total unread from per-feed counts
	const totalUnread = (unreadData || []).reduce(
		(sum: number, u: { unread_count: number }) => sum + u.unread_count,
		0
	);

	// 3. Get total starred count
	const { count: totalStarred, error: starredError } = await supabase
		.from('user_entry_status')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('is_starred', true);

	if (starredError) {
		console.error('Starred count error:', starredError);
		return serverError();
	}

	// 4. Build per-feed stats from RPC data
	const feedStats = (unreadData || []).map(
		(u: { feed_id: string; unread_count: number }) => ({
			feed_id: u.feed_id,
			unread_count: u.unread_count
		})
	);

	return successResponse({
		total_unread: totalUnread,
		total_starred: totalStarred || 0,
		feeds: feedStats
	});
};
