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
	const collectionId = url.searchParams.get('collection_id');
	const category = url.searchParams.get('category');
	const startDateParam = url.searchParams.get('start_date');
	const endDateParam = url.searchParams.get('end_date');
	const isReadParam = url.searchParams.get('is_read');
	const isStarredParam = url.searchParams.get('is_starred');
	const search = url.searchParams.get('search');

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

	let subscribedFeedIds = subscriptions?.map((s) => s.feed_id) || [];

	// Return empty result if no subscriptions
	if (subscribedFeedIds.length === 0) {
		return paginatedResponse([], { next_cursor: null, has_more: false, limit });
	}

	// 2. If collection_id provided, intersect with collection feeds
	if (collectionId) {
		// Verify collection belongs to user (security: prevent accessing other users' collections)
		const { data: collection, error: collError } = await supabase
			.from('feed_collections')
			.select('id')
			.eq('id', collectionId)
			.eq('user_id', userId)
			.single();

		if (collError || !collection) {
			return badRequest('Collection not found', 'COLLECTION_NOT_FOUND');
		}

		// Get feed IDs in this collection
		const { data: collFeeds, error: cfError } = await supabase
			.from('collection_feeds')
			.select('feed_id')
			.eq('collection_id', collectionId);

		if (cfError) {
			console.error('Collection feeds error:', cfError);
			return serverError();
		}

		const collectionFeedIds = collFeeds?.map((cf) => cf.feed_id) || [];

		// Empty collection = empty result
		if (collectionFeedIds.length === 0) {
			return paginatedResponse([], { next_cursor: null, has_more: false, limit });
		}

		// Intersect collection feeds with subscribed feeds
		// (user may have unsubscribed from a feed that's still in collection)
		const collectionSet = new Set(collectionFeedIds);
		subscribedFeedIds = subscribedFeedIds.filter((id) => collectionSet.has(id));

		// If no overlap between collection and subscriptions, empty result
		if (subscribedFeedIds.length === 0) {
			return paginatedResponse([], { next_cursor: null, has_more: false, limit });
		}
	}

	// 3. Validate feed_id filter if provided
	if (feedId && !subscribedFeedIds.includes(feedId)) {
		return badRequest('Feed not found in subscriptions', 'FEED_NOT_FOUND');
	}

	// 4. Pre-query for status filters (is_starred, is_read)
	// Track entry IDs to include (null = no filter), and entry IDs to exclude
	let includeEntryIds: string[] | null = null;
	let excludeEntryIds: string[] | null = null;

	// Handle is_starred filter
	if (isStarredParam === 'true') {
		const { data: starred, error: starredError } = await supabase
			.from('user_entry_status')
			.select('entry_id')
			.eq('user_id', userId)
			.eq('is_starred', true);

		if (starredError) {
			console.error('Starred query error:', starredError);
			return serverError();
		}

		includeEntryIds = starred?.map((s) => s.entry_id) || [];

		// If no starred entries, return empty result immediately
		if (includeEntryIds.length === 0) {
			return paginatedResponse([], { next_cursor: null, has_more: false, limit });
		}
	}

	// Handle is_read filter
	if (isReadParam === 'true') {
		const { data: read, error: readError } = await supabase
			.from('user_entry_status')
			.select('entry_id')
			.eq('user_id', userId)
			.eq('is_read', true);

		if (readError) {
			console.error('Read query error:', readError);
			return serverError();
		}

		const readIds = read?.map((s) => s.entry_id) || [];

		// If combined with starred filter, intersect the sets
		if (includeEntryIds !== null) {
			const readSet = new Set(readIds);
			includeEntryIds = includeEntryIds.filter((id) => readSet.has(id));
		} else {
			includeEntryIds = readIds;
		}

		if (includeEntryIds.length === 0) {
			return paginatedResponse([], { next_cursor: null, has_more: false, limit });
		}
	}

	// Handle is_read=false (unread entries) - need to EXCLUDE read entries
	if (isReadParam === 'false') {
		const { data: read, error: readError } = await supabase
			.from('user_entry_status')
			.select('entry_id')
			.eq('user_id', userId)
			.eq('is_read', true);

		if (readError) {
			console.error('Read query error:', readError);
			return serverError();
		}

		const readIds = read?.map((s) => s.entry_id) || [];

		// If we already have includeEntryIds (from is_starred=true), filter those
		if (includeEntryIds !== null) {
			const readSet = new Set(readIds);
			includeEntryIds = includeEntryIds.filter((id) => !readSet.has(id));
			if (includeEntryIds.length === 0) {
				return paginatedResponse([], { next_cursor: null, has_more: false, limit });
			}
		} else if (readIds.length > 0) {
			// No includeEntryIds yet, so we need to exclude read entries in main query
			excludeEntryIds = readIds;
		}
		// If readIds is empty, all entries are unread - no filter needed
	}

	// 5. Build entries query with feed join
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

	// 6. Apply cursor filter if provided
	if (cursor) {
		const cursorData = decodeCursor(cursor);
		if (!cursorData) {
			return badRequest('Invalid cursor format', 'INVALID_CURSOR');
		}
		query = query.or(
			`published_at.lt.${cursorData.p},and(published_at.eq.${cursorData.p},id.lt.${cursorData.i})`
		);
	}

	// 7. Apply filters
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

	// Apply status filter (include IDs from pre-query)
	if (includeEntryIds !== null) {
		query = query.in('id', includeEntryIds);
	}

	// Apply status exclusion filter (exclude IDs from is_read=false)
	if (excludeEntryIds !== null && excludeEntryIds.length > 0) {
		query = query.not('id', 'in', `(${excludeEntryIds.join(',')})`);
	}

	// Apply search filter (ILIKE for case-insensitive partial match)
	if (search && search.trim()) {
		const searchTerm = search.trim();
		query = query.or(
			`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`
		);
	}

	// 8. Execute query
	const { data: entries, error: queryError } = await query;

	if (queryError) {
		console.error('Entries query error:', queryError);
		return serverError();
	}

	// 9. Fetch user_entry_status for returned entries
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

	// 10. Transform entries to response shape
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

	// 11. Build pagination response
	const { items, meta } = buildPaginationMeta(transformedEntries, limit, (item) => ({
		p: item.published_at!,
		i: item.id
	}));

	return paginatedResponse(items, meta);
};
