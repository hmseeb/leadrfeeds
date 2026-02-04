// Server hooks for centralized API authentication and rate limiting
// Protects all /api/v1/* routes with API key validation and rate limits

import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateApiKey } from '$lib/server/api-keys';
import { unauthorized, rateLimited } from '$lib/server/api-response';
import { checkRateLimit } from '$lib/server/rate-limit';

/**
 * Authentication handler - validates API keys for /api/v1/* routes
 */
const authHandler: Handle = async ({ event, resolve }) => {
	// Only protect /api/v1/* routes
	// All other routes (web pages, auth, static assets) pass through
	if (!event.url.pathname.startsWith('/api/v1/')) {
		return resolve(event);
	}

	// Extract Authorization header
	const authHeader = event.request.headers.get('Authorization');

	if (!authHeader) {
		return unauthorized('Missing Authorization header');
	}

	if (!authHeader.startsWith('Bearer ')) {
		return unauthorized('Invalid Authorization header format. Expected: Bearer <api_key>');
	}

	// Extract API key (remove "Bearer " prefix)
	const apiKey = authHeader.substring(7);

	if (!apiKey) {
		return unauthorized('API key is empty');
	}

	// Validate API key using Phase 1 utility
	const result = await validateApiKey(apiKey);

	if (!result.valid) {
		// Return specific error message from validation
		// validateApiKey returns messages like:
		// - "Invalid key format"
		// - "Invalid API key"
		// - "API key has been revoked"
		// - "API key has expired"
		return unauthorized(result.error || 'Invalid API key');
	}

	// Attach user context to locals for downstream handlers
	event.locals.apiUser = {
		userId: result.userId!,
		keyId: result.keyId!
	};

	// Continue to next handler
	return resolve(event);
};

/**
 * Rate limiting handler - checks rate limits for authenticated API requests
 */
const rateLimitHandler: Handle = async ({ event, resolve }) => {
	// Only apply to /api/v1/* routes
	if (!event.url.pathname.startsWith('/api/v1/')) {
		return resolve(event);
	}

	// Skip if auth failed (no apiUser means 401 already returned)
	if (!event.locals.apiUser) {
		return resolve(event);
	}

	// Check rate limit using the API key ID
	const { allowed, headers, retryAfter } = await checkRateLimit(event.locals.apiUser.keyId);

	if (!allowed) {
		// Rate limit exceeded - return 429 with headers
		const response = rateLimited('Rate limit exceeded. Please slow down.', retryAfter);

		// Add rate limit headers to 429 response
		Object.entries(headers).forEach(([key, value]) => {
			response.headers.set(key, value);
		});

		return response;
	}

	// Store headers to add to successful response
	event.locals.rateLimitHeaders = headers;

	// Continue to route handler
	const response = await resolve(event);

	// Add rate limit headers to successful response
	Object.entries(headers).forEach(([key, value]) => {
		response.headers.set(key, value);
	});

	return response;
};

// Compose handlers: auth runs first, then rate limiting
export const handle = sequence(authHandler, rateLimitHandler);
