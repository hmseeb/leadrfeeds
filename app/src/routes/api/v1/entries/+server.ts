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

	// TODO: Task 2 - Add database query logic
	// TODO: Task 3 - Add status fetch and response building

	// Temporary return for Task 1 verification
	return paginatedResponse([], { next_cursor: null, has_more: false, limit });
};
