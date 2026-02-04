// Server hooks for centralized API authentication
// Protects all /api/v1/* routes with API key validation

import type { Handle } from '@sveltejs/kit';
import { validateApiKey } from '$lib/server/api-keys';

/**
 * Create a JSON 401 Unauthorized response.
 * Returns Response directly instead of using error() to ensure JSON format.
 */
function unauthorized(message: string): Response {
	return new Response(
		JSON.stringify({
			error: 'Unauthorized',
			message
		}),
		{
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		}
	);
}

export const handle: Handle = async ({ event, resolve }) => {
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

	// Continue to route handler
	return resolve(event);
};
