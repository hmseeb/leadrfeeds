// Cursor-based pagination utilities
// Default page size: 50, Maximum: 100

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Data encoded in the cursor for entries pagination.
 * Uses composite key to handle ties in published_at.
 * Short keys (p, i) minimize cursor size since cursors are opaque.
 */
export interface EntryCursorData {
	p: string; // published_at (ISO string)
	i: string; // id
}

/**
 * Encode cursor data as opaque Base64 string.
 * Clients should treat this as an opaque token.
 */
export function encodeCursor(data: EntryCursorData): string {
	return btoa(JSON.stringify(data));
}

/**
 * Decode and validate cursor from client.
 * Returns null if cursor is invalid.
 */
export function decodeCursor(cursor: string): EntryCursorData | null {
	try {
		const decoded = atob(cursor);
		const parsed = JSON.parse(decoded);

		// Validate structure
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof parsed.p !== 'string' ||
			typeof parsed.i !== 'string'
		) {
			return null;
		}

		// Validate date format
		const date = new Date(parsed.p);
		if (isNaN(date.getTime())) {
			return null;
		}

		return { p: parsed.p, i: parsed.i };
	} catch {
		return null;
	}
}

/**
 * Get effective limit, capped at MAX_LIMIT.
 */
export function getEffectiveLimit(requested?: number): number {
	if (requested === undefined || requested === null || requested < 1) {
		return DEFAULT_LIMIT;
	}
	return Math.min(requested, MAX_LIMIT);
}

/**
 * Pagination metadata included in responses.
 */
export interface PaginationMeta {
	next_cursor: string | null;
	has_more: boolean;
	limit: number;
}

/**
 * Build pagination metadata from query results.
 *
 * @param results - Query results (should fetch limit + 1 to detect has_more)
 * @param limit - Requested limit
 * @param extractCursor - Function to extract cursor data from last item
 */
export function buildPaginationMeta<T>(
	results: T[],
	limit: number,
	extractCursor: (item: T) => EntryCursorData
): { items: T[]; meta: PaginationMeta } {
	const hasMore = results.length > limit;
	const items = hasMore ? results.slice(0, limit) : results;

	const nextCursor =
		hasMore && items.length > 0 ? encodeCursor(extractCursor(items[items.length - 1])) : null;

	return {
		items,
		meta: {
			next_cursor: nextCursor,
			has_more: hasMore,
			limit
		}
	};
}

/**
 * Parse pagination params from URL search params.
 */
export function parsePaginationParams(url: URL): {
	cursor: string | null;
	limit: number;
} {
	const cursor = url.searchParams.get('cursor');
	const limitParam = url.searchParams.get('limit');
	const limit = getEffectiveLimit(limitParam ? parseInt(limitParam, 10) : undefined);

	return { cursor, limit };
}
