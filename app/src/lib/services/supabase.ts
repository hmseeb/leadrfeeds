import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(
	supabaseUrl,
	supabaseAnonKey,
	{
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true
		}
	}
);
