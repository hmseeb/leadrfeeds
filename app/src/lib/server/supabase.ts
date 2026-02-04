// Service role Supabase client - BYPASSES RLS
// This file is in $lib/server/ and cannot be imported from browser code

import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

const SUPABASE_SERVICE_ROLE_KEY = privateEnv.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_SUPABASE_URL = publicEnv.PUBLIC_SUPABASE_URL || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
}

if (!PUBLIC_SUPABASE_URL) {
	throw new Error('PUBLIC_SUPABASE_URL is not set');
}

/**
 * Service role Supabase client that bypasses Row Level Security.
 *
 * USE ONLY FOR:
 * - API key validation (before user is authenticated)
 * - Admin operations that require RLS bypass
 *
 * DO NOT USE FOR:
 * - User-initiated operations (use the anon client instead)
 * - Anything that should respect user permissions
 */
export const supabaseAdmin = createClient<Database>(
	PUBLIC_SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	}
);
