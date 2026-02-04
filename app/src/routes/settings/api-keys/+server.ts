// API Key management endpoint
// Handles CRUD operations for user API keys
// Uses Bearer token authentication (client-side Supabase auth)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { generateApiKey, sha256 } from '$lib/server/api-keys';

/**
 * Extract and validate Bearer token from Authorization header.
 * Returns user data if valid, or error response if invalid.
 */
async function authenticateUser(request: Request): Promise<
	| { user: { id: string }; error?: never }
	| { user?: never; error: Response }
> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return {
			error: json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
		};
	}

	const token = authHeader.slice(7); // Remove 'Bearer ' prefix
	const { data, error } = await getSupabaseAdmin().auth.getUser(token);

	if (error || !data.user) {
		return {
			error: json({ error: 'Invalid or expired token' }, { status: 401 })
		};
	}

	return { user: data.user };
}

/**
 * POST /settings/api-keys - Create a new API key
 *
 * Request body:
 * - label: string (required, max 100 chars)
 * - expires_at: string (optional, ISO date, must be future)
 *
 * Response: Key metadata including full_key (shown only once)
 */
export const POST: RequestHandler = async ({ request }) => {
	// Authenticate user
	const auth = await authenticateUser(request);
	if (auth.error) return auth.error;
	const userId = auth.user.id;

	// Parse request body
	let body: { label?: unknown; expires_at?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Validate label
	const { label, expires_at } = body;
	if (typeof label !== 'string' || label.trim().length === 0) {
		return json({ error: 'Label is required and must be a non-empty string' }, { status: 400 });
	}
	if (label.length > 100) {
		return json({ error: 'Label must be 100 characters or less' }, { status: 400 });
	}

	// Validate expires_at if provided
	let expiresAt: string | null = null;
	if (expires_at !== undefined && expires_at !== null) {
		if (typeof expires_at !== 'string') {
			return json({ error: 'expires_at must be an ISO date string' }, { status: 400 });
		}
		const expiresDate = new Date(expires_at);
		if (isNaN(expiresDate.getTime())) {
			return json({ error: 'expires_at must be a valid ISO date' }, { status: 400 });
		}
		if (expiresDate <= new Date()) {
			return json({ error: 'expires_at must be a future date' }, { status: 400 });
		}
		expiresAt = expiresDate.toISOString();
	}

	// Generate and hash key
	const { fullKey, prefix } = generateApiKey();
	const keyHash = await sha256(fullKey);

	// Insert into database
	const { data: insertedKey, error: insertError } = await getSupabaseAdmin()
		.from('api_keys')
		.insert({
			user_id: userId,
			label: label.trim(),
			key_prefix: prefix,
			key_hash: keyHash,
			expires_at: expiresAt
		})
		.select('id, label, key_prefix, expires_at, created_at')
		.single();

	if (insertError) {
		console.error('Failed to create API key:', insertError);
		return json({ error: 'Failed to create API key' }, { status: 500 });
	}

	// Return key metadata with full key (only time it's returned)
	return json({
		id: insertedKey.id,
		label: insertedKey.label,
		key_prefix: insertedKey.key_prefix,
		expires_at: insertedKey.expires_at,
		created_at: insertedKey.created_at,
		full_key: fullKey
	}, { status: 201 });
};

/**
 * GET /settings/api-keys - List user's API keys
 *
 * Response: Array of key metadata (never includes full key or hash)
 */
export const GET: RequestHandler = async ({ request }) => {
	// Authenticate user
	const auth = await authenticateUser(request);
	if (auth.error) return auth.error;
	const userId = auth.user.id;

	// Query user's keys
	const { data: keys, error: queryError } = await getSupabaseAdmin()
		.from('api_keys')
		.select('id, label, key_prefix, expires_at, revoked_at, last_used_at, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (queryError) {
		console.error('Failed to list API keys:', queryError);
		return json({ error: 'Failed to list API keys' }, { status: 500 });
	}

	return json(keys);
};

/**
 * DELETE /settings/api-keys - Revoke an API key
 *
 * Request body:
 * - id: string (required, UUID of key to revoke)
 *
 * Response: { success: true } or error
 */
export const DELETE: RequestHandler = async ({ request }) => {
	// Authenticate user
	const auth = await authenticateUser(request);
	if (auth.error) return auth.error;
	const userId = auth.user.id;

	// Parse request body
	let body: { id?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Validate id
	const { id } = body;
	if (typeof id !== 'string' || id.trim().length === 0) {
		return json({ error: 'id is required and must be a non-empty string' }, { status: 400 });
	}

	// Revoke key (set revoked_at)
	// Security: Only update if user_id matches (users can only revoke their own keys)
	const { data: updatedKeys, error: updateError } = await getSupabaseAdmin()
		.from('api_keys')
		.update({ revoked_at: new Date().toISOString() })
		.eq('id', id.trim())
		.eq('user_id', userId)
		.select('id');

	if (updateError) {
		console.error('Failed to revoke API key:', updateError);
		return json({ error: 'Failed to revoke API key' }, { status: 500 });
	}

	if (!updatedKeys || updatedKeys.length === 0) {
		return json({ error: 'API key not found' }, { status: 404 });
	}

	return json({ success: true });
};
