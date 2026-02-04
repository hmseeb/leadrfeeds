// Centralized API response utilities
// All API errors return consistent JSON: { error: { code, message, status } }

/**
 * Standard API error structure.
 * Inspired by RFC 9457 (Problem Details) but simplified.
 */
export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		status: number;
	};
}

/**
 * Create a JSON error response.
 */
function apiError(
	status: number,
	code: string,
	message: string,
	extraHeaders?: Record<string, string>
): Response {
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...extraHeaders
	};

	return new Response(
		JSON.stringify({
			error: { code, message, status }
		}),
		{ status, headers }
	);
}

// 400 Bad Request - Client sent invalid data
export function badRequest(message: string, code = 'BAD_REQUEST'): Response {
	return apiError(400, code, message);
}

// 401 Unauthorized - Missing or invalid authentication
export function unauthorized(message: string, code = 'UNAUTHORIZED'): Response {
	return apiError(401, code, message);
}

// 403 Forbidden - Authenticated but not allowed
export function forbidden(message: string, code = 'FORBIDDEN'): Response {
	return apiError(403, code, message);
}

// 404 Not Found - Resource doesn't exist
export function notFound(message: string, code = 'NOT_FOUND'): Response {
	return apiError(404, code, message);
}

// 429 Too Many Requests - Rate limit exceeded
export function rateLimited(message: string, retryAfter?: number): Response {
	const extraHeaders: Record<string, string> = {};
	if (retryAfter !== undefined) {
		extraHeaders['Retry-After'] = String(retryAfter);
	}
	return apiError(429, 'RATE_LIMITED', message, extraHeaders);
}

// 500 Internal Server Error - Server-side failure
export function serverError(message = 'An internal error occurred'): Response {
	// Never expose internal details - log them server-side
	return apiError(500, 'INTERNAL_ERROR', message);
}

/**
 * Success response helper for paginated data.
 */
export function paginatedResponse<T>(
	data: T[],
	meta: {
		next_cursor: string | null;
		has_more: boolean;
		limit: number;
	}
): Response {
	return new Response(JSON.stringify({ data, meta }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

/**
 * Success response helper for single item or non-paginated data.
 */
export function successResponse<T>(data: T): Response {
	return new Response(JSON.stringify({ data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}
