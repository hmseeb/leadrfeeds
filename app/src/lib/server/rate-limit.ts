// Rate limiting using Upstash Redis
// Sliding window algorithm: 100 requests per minute per API key

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { building } from '$app/environment';

// Lazy initialization - avoid creating connections during build
let ratelimit: Ratelimit | null = null;

/**
 * Get or create the Ratelimit instance.
 * Returns null during build to avoid connection errors.
 */
export function getRateLimiter(): Ratelimit | null {
	if (building) {
		return null;
	}

	if (!ratelimit) {
		ratelimit = new Ratelimit({
			redis: Redis.fromEnv(),
			limiter: Ratelimit.slidingWindow(100, '1 m'),
			prefix: 'leadrfeeds_api',
			analytics: true
		});
	}

	return ratelimit;
}

export interface RateLimitResult {
	allowed: boolean;
	headers: Record<string, string>;
	retryAfter?: number;
}

/**
 * Check rate limit for an API key.
 * Returns headers to include in response and whether request is allowed.
 */
export async function checkRateLimit(keyId: string): Promise<RateLimitResult> {
	const limiter = getRateLimiter();

	// During build, allow all requests
	if (!limiter) {
		return { allowed: true, headers: {} };
	}

	const { success, limit, remaining, reset } = await limiter.limit(keyId);

	const headers: Record<string, string> = {
		'X-RateLimit-Limit': String(limit),
		'X-RateLimit-Remaining': String(remaining),
		'X-RateLimit-Reset': String(reset)
	};

	if (!success) {
		// Calculate seconds until reset
		const retryAfter = Math.ceil((reset - Date.now()) / 1000);
		return {
			allowed: false,
			headers,
			retryAfter: Math.max(1, retryAfter) // Minimum 1 second
		};
	}

	return { allowed: true, headers };
}
