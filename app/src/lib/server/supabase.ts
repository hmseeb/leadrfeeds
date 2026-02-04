// Service role Supabase client - BYPASSES RLS
// This file is in $lib/server/ and cannot be imported from browser code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

// Cached client instance - initialized on first use
let _supabaseAdmin: SupabaseClient<Database> | null = null;

/**
 * Get the service role Supabase client that bypasses Row Level Security.
 * Client is lazily initialized on first call - env vars are only checked when
 * this function is invoked, not when the module is imported.
 *
 * USE ONLY FOR:
 * - API key validation (before user is authenticated)
 * - Admin operations that require RLS bypass
 *
 * DO NOT USE FOR:
 * - User-initiated operations (use the anon client instead)
 * - Anything that should respect user permissions
 *
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set
 * @throws Error if PUBLIC_SUPABASE_URL is not set
 * @returns Supabase client with service role privileges
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
	if (_supabaseAdmin) {
		return _supabaseAdmin;
	}

	const serviceKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;

	if (!serviceKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
	}

	if (!supabaseUrl) {
		throw new Error('PUBLIC_SUPABASE_URL is not set');
	}

	_supabaseAdmin = createClient<Database>(supabaseUrl, serviceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});

	return _supabaseAdmin;
}
