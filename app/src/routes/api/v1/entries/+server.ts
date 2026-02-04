// GET /api/v1/entries - Paginated feed entries endpoint
// Returns entries from user's subscribed feeds with read/starred status

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { badRequest, serverError, paginatedResponse } from '$lib/server/api-response';
import { parsePaginationParams, decodeCursor, buildPaginationMeta } from '$lib/server/pagination';

/**
 * Helper to validate ISO 8601 date string.
 * Returns the Date if valid, null if invalid.
 */
function parseDate(dateStr: string): Date | null {
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) {
		return null;
	}
	return date;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	// Get userId from auth middleware (guaranteed to exist for /api/v1/* routes)
	const userId = locals.apiUser!.userId;

	// Parse pagination parameters
	const { cursor, limit } = parsePaginationParams(url);

	// Parse filter parameters
	const feedId = url.searchParams.get('feed_id');
	const category = url.searchParams.get('category');
	const startDateParam = url.searchParams.get('start_date');
	const endDateParam = url.searchParams.get('end_date');

	// Validate date parameters
	let startDate: Date | null = null;
	let endDate: Date | null = null;

	if (startDateParam) {
		startDate = parseDate(startDateParam);
		if (!startDate) {
			return badRequest('Invalid start_date format. Use ISO 8601 format.', 'INVALID_DATE');
		}
	}

	if (endDateParam) {
		endDate = parseDate(endDateParam);
		if (!endDate) {
			return badRequest('Invalid end_date format. Use ISO 8601 format.', 'INVALID_DATE');
		}
	}

	// Get Supabase admin client
	const supabase = getSupabaseAdmin();

	// 1. Query user's subscribed feed IDs
	const { data: subscriptions, error: subError } = await supabase
		.from('user_subscriptions')
		.select('feed_id')
		.eq('user_id', userId);

	if (subError) {
		console.error('Subscriptions query error:', subError);
		return serverError();
	}

	const subscribedFeedIds = subscriptions?.map((s) => s.feed_id) || [];

	// Return empty result if no subscriptions
	if (subscribedFeedIds.length === 0) {
		return paginatedResponse([], { next_cursor: null, has_more: false, limit });
	}

	// 2. Validate feed_id filter if provided
	if (feedId && !subscribedFeedIds.includes(feedId)) {
		return badRequest('Feed not found in subscriptions', 'FEED_NOT_FOUND');
	}

	// 3. Build entries query with feed join
	let query = supabase
		.from('entries')
		.select(
			`
			id,
			title,
			url,
			description,
			content,
			author,
			published_at,
			feed_id,
			feeds!inner (
				id,
				title,
				category,
				image
			)
		`
		)
		.in('feed_id', subscribedFeedIds)
		.order('published_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(limit + 1);

	// 4. Apply cursor filter if provided
	if (cursor) {
		const cursorData = decodeCursor(cursor);
		if (!cursorData) {
			return badRequest('Invalid cursor format', 'INVALID_CURSOR');
		}
		query = query.or(
			`published_at.lt.${cursorData.p},and(published_at.eq.${cursorData.p},id.lt.${cursorData.i})`
		);
	}

	// 5. Apply filters
	if (feedId) {
		query = query.eq('feed_id', feedId);
	}

	if (category) {
		query = query.eq('feeds.category', category);
	}

	if (startDate) {
		query = query.gte('published_at', startDate.toISOString());
	}

	if (endDate) {
		query = query.lte('published_at', endDate.toISOString());
	}

	// 6. Execute query
	const { data: entries, error: queryError } = await query;

	if (queryError) {
		console.error('Entries query error:', queryError);
		return serverError();
	}

	// 7. Fetch user_entry_status for returned entries
	const entryIds = entries?.map((e) => e.id) || [];
	let statusMap = new Map<string, { is_read: boolean; is_starred: boolean }>();

	if (entryIds.length > 0) {
		const { data: statuses } = await supabase
			.from('user_entry_status')
			.select('entry_id, is_read, is_starred')
			.eq('user_id', userId)
			.in('entry_id', entryIds);

		statusMap = new Map(
			statuses?.map((s) => [
				s.entry_id,
				{ is_read: s.is_read ?? false, is_starred: s.is_starred ?? false }
			]) || []
		);
	}

	// 8. Transform entries to response shape
	const transformedEntries =
		entries?.map((entry) => {
			// Supabase returns feed as object or array depending on relationship
			const feed = Array.isArray(entry.feeds) ? entry.feeds[0] : entry.feeds;
			const status = statusMap.get(entry.id);

			return {
				id: entry.id,
				title: entry.title,
				url: entry.url,
				description: entry.description,
				content: entry.content,
				author: entry.author,
				published_at: entry.published_at,
				feed: {
					id: feed.id,
					title: feed.title,
					category: feed.category,
					image: feed.image
				},
				is_read: status?.is_read ?? false,
				is_starred: status?.is_starred ?? false
			};
		}) || [];

	// 9. Build pagination response
	const { items, meta } = buildPaginationMeta(transformedEntries, limit, (item) => ({
		p: item.published_at!,
		i: item.id
	}));

	return paginatedResponse(items, meta);
};
