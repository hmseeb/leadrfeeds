// API Key utilities for generation, hashing, and validation
// This file is in $lib/server/ and cannot be imported from browser code

import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from './supabase';

/**
 * Generate a cryptographically secure API key.
 * Format: lf_<32 random hex characters>
 * Total length: 35 characters (3 prefix + 32 random)
 *
 * @returns Object with fullKey (shown once to user) and prefix (stored for lookup)
 */
export function generateApiKey(): { fullKey: string; prefix: string } {
	// Use CSPRNG for secure random generation
	const randomPart = crypto.randomUUID().replace(/-/g, '');
	const fullKey = `lf_${randomPart}`;
	const prefix = fullKey.slice(0, 8); // "lf_xxxxx" - first 8 chars

	return { fullKey, prefix };
}

/**
 * Hash a string using SHA-256 via Web Crypto API.
 * Returns lowercase hex string.
 *
 * @param input - String to hash
 * @returns SHA-256 hash as lowercase hex string
 */
export async function sha256(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);

	// Convert ArrayBuffer to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

/**
 * Compare two hashes using timing-safe comparison.
 * Prevents timing attacks by always comparing in constant time.
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns true if hashes match, false otherwise
 */
export function secureCompareHashes(hash1: string, hash2: string): boolean {
	// Convert hex strings to Buffers
	const buf1 = Buffer.from(hash1, 'hex');
	const buf2 = Buffer.from(hash2, 'hex');

	// timingSafeEqual requires same length - if different, definitely not equal
	// We still need to do some work to prevent length-based timing attacks
	if (buf1.length !== buf2.length) {
		// Compare against itself to burn same amount of time
		timingSafeEqual(buf1, buf1);
		return false;
	}

	return timingSafeEqual(buf1, buf2);
}

/**
 * Validate an API key and return the associated user_id if valid.
 *
 * Validation checks:
 * 1. Key format is valid (starts with lf_)
 * 2. Key exists in database (prefix lookup)
 * 3. Key hash matches (timing-safe comparison)
 * 4. Key is not expired
 * 5. Key is not revoked
 *
 * @param apiKey - The full API key to validate
 * @returns Object with valid flag, user_id if valid, and error message if invalid
 */
export async function validateApiKey(apiKey: string): Promise<{
	valid: boolean;
	userId?: string;
	keyId?: string;
	error?: string;
}> {
	// Check format
	if (!apiKey || !apiKey.startsWith('lf_')) {
		return { valid: false, error: 'Invalid key format' };
	}

	const prefix = apiKey.slice(0, 8);
	const providedHash = await sha256(apiKey);

	// Lookup by prefix (indexed, O(1))
	const { data: keys, error } = await supabaseAdmin
		.from('api_keys')
		.select('id, user_id, key_hash, expires_at, revoked_at')
		.eq('key_prefix', prefix);

	if (error) {
		console.error('API key lookup error:', error);
		return { valid: false, error: 'Database error' };
	}

	if (!keys || keys.length === 0) {
		return { valid: false, error: 'Invalid API key' };
	}

	// Find matching key (there could be multiple with same prefix, though unlikely)
	for (const key of keys) {
		// Timing-safe hash comparison
		if (secureCompareHashes(providedHash, key.key_hash)) {
			// Check if revoked
			if (key.revoked_at) {
				return { valid: false, error: 'API key has been revoked' };
			}

			// Check if expired
			if (key.expires_at && new Date(key.expires_at) < new Date()) {
				return { valid: false, error: 'API key has expired' };
			}

			// Update last_used_at (fire and forget, don't block validation)
			void (async () => {
				try {
					await supabaseAdmin
						.from('api_keys')
						.update({ last_used_at: new Date().toISOString() })
						.eq('id', key.id);
				} catch (err) {
					console.error('Failed to update last_used_at:', err);
				}
			})();

			return {
				valid: true,
				userId: key.user_id,
				keyId: key.id
			};
		}
	}

	return { valid: false, error: 'Invalid API key' };
}
