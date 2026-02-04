# Phase 4: Rate Limiting - Research

**Researched:** 2026-02-04
**Domain:** API Rate Limiting with Upstash Redis
**Confidence:** HIGH

## Summary

Rate limiting for the LeadrFeeds API will use Upstash Redis with the `@upstash/ratelimit` package, which is specifically designed for serverless environments like Vercel. This approach provides atomic operations via Lua scripts (eliminating race conditions), HTTP-based connectivity (no persistent connections needed), and built-in response data for rate limit headers.

The implementation integrates into the existing `hooks.server.ts` middleware pattern established in Phase 2. After API key validation succeeds, the rate limiter checks the key's usage against configured limits. The `limit()` method returns all necessary data (`remaining`, `reset`, `limit`) to populate standard rate limit headers on every response. When limits are exceeded, the existing `rateLimited()` helper from Phase 3 returns a 429 response with `Retry-After` header.

**Primary recommendation:** Use `@upstash/ratelimit` with sliding window algorithm, keyed by API key ID (`keyId`), integrated into `hooks.server.ts` using the `sequence` helper for clean middleware composition.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @upstash/ratelimit | 2.0.8 | Rate limiting logic | Only connectionless (HTTP-based) rate limiter for serverless; uses Lua scripts for atomic operations |
| @upstash/redis | 1.36.1 | Redis client | HTTP-based, designed for Vercel/serverless; works with Upstash Redis service |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @sveltejs/kit/hooks | Built-in | Compose multiple handlers | Always - use `sequence()` to chain auth and rate limiting hooks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Upstash Redis | Vercel KV | Vercel KV is also powered by Upstash; direct Upstash gives more control and works across providers |
| @upstash/ratelimit | Custom implementation | Custom requires handling Lua scripts, atomicity, algorithms manually - significant complexity |
| Sliding window | Fixed window | Fixed window has boundary burst issues; sliding window provides smoother limiting |

**Installation:**
```bash
npm install @upstash/ratelimit @upstash/redis
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
├── lib/
│   └── server/
│       ├── rate-limit.ts      # Ratelimit instance and check function
│       └── api-response.ts    # Existing - rateLimited() helper
└── hooks.server.ts            # Compose auth + rate limit middleware
```

### Pattern 1: Middleware Composition with sequence()
**What:** Use SvelteKit's `sequence()` helper to compose authentication and rate limiting as separate handlers
**When to use:** Always - keeps concerns separated and testable
**Example:**
```typescript
// Source: https://svelte.dev/docs/kit/@sveltejs-kit-hooks
import { sequence } from '@sveltejs/kit/hooks';
import { authHandler } from '$lib/server/auth-handler';
import { rateLimitHandler } from '$lib/server/rate-limit-handler';

export const handle = sequence(authHandler, rateLimitHandler);
```

### Pattern 2: Per-Key Rate Limiting
**What:** Use API key ID as the rate limit identifier (not IP address)
**When to use:** Always for authenticated API routes
**Example:**
```typescript
// Source: https://upstash.com/docs/redis/sdks/ratelimit-ts/methods
const identifier = event.locals.apiUser.keyId; // From Phase 2 auth
const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
```

### Pattern 3: Hot Function Caching
**What:** Define ratelimit instance outside handler to reuse across invocations
**When to use:** Always - reduces Redis calls while function is "hot"
**Example:**
```typescript
// Source: https://upstash.com/blog/sveltekit-rate-limiting
import { building } from '$app/environment';

let ratelimit: Ratelimit;

if (!building) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(100, '1 m'),
  });
}
```

### Pattern 4: Response Header Injection
**What:** Add rate limit headers to response after resolve()
**When to use:** On every successful API response
**Example:**
```typescript
// Source: https://svelte.dev/docs/kit/hooks
const response = await resolve(event);
response.headers.set('X-RateLimit-Limit', limit.toString());
response.headers.set('X-RateLimit-Remaining', remaining.toString());
response.headers.set('X-RateLimit-Reset', reset.toString());
return response;
```

### Anti-Patterns to Avoid
- **Separate GET/SET operations:** Never check and increment separately - use atomic operations (handled by @upstash/ratelimit)
- **IP-based limiting for authenticated APIs:** Use API key ID instead - IPs are unreliable (NAT, proxies, cloud services)
- **Creating ratelimit instance per request:** Define outside handler for caching
- **Blocking rate limit check after response:** Check BEFORE processing request, not after

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic increment + check | Redis INCR + EXPIRE separately | @upstash/ratelimit | Race conditions between INCR and EXPIRE; Lua scripts are atomic |
| Sliding window algorithm | Custom bucket implementation | Ratelimit.slidingWindow() | Edge cases around boundary handling, time drift |
| Reset timestamp calculation | Manual epoch math | limit() response.reset | Library handles timezone/format correctly |
| Multi-region consistency | Custom CRDT | @upstash/ratelimit multi-region | Complex distributed systems problem |

**Key insight:** Rate limiting appears simple ("just count requests") but has subtle race conditions and edge cases that cause bypass vulnerabilities under load. @upstash/ratelimit uses battle-tested Lua scripts for guaranteed atomicity.

## Common Pitfalls

### Pitfall 1: Race Conditions with Non-Atomic Operations
**What goes wrong:** Under high concurrency, separate read-then-write operations allow requests to slip through before the counter updates
**Why it happens:** Developers use `redis.get()` then `redis.set()` instead of atomic operations
**How to avoid:** @upstash/ratelimit uses Lua scripts that execute atomically on Redis server
**Warning signs:** Rate limits exceeded in testing but requests get through in production

### Pitfall 2: SvelteKit Building Phase Errors
**What goes wrong:** Import errors during `npm run build` because Redis client tries to connect
**Why it happens:** Module-level code executes during SSR build
**How to avoid:** Check `building` from `$app/environment` before initializing
**Warning signs:** Build fails with connection errors despite valid credentials

### Pitfall 3: Immutable Response Headers
**What goes wrong:** TypeError when trying to set headers on Response.redirect() or error responses
**Why it happens:** Some Response objects have immutable headers
**How to avoid:** Create new Response if headers are immutable, or only set headers on resolve() responses
**Warning signs:** "Cannot set headers on immutable response" errors

### Pitfall 4: Missing Environment Variables
**What goes wrong:** Application crashes or rate limiting silently fails
**Why it happens:** UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN not set in Vercel
**How to avoid:** Use Vercel-Upstash integration for automatic env var setup; add to .env.example
**Warning signs:** "Redis client not configured" errors in logs

### Pitfall 5: Rate Limiting After Authentication Failure
**What goes wrong:** Rate limit headers not set on 401 responses, or rate limit checked on unauthenticated requests
**Why it happens:** Middleware order confusion
**How to avoid:** Rate limiting should run AFTER successful authentication, only for valid API keys
**Warning signs:** 401 responses with rate limit headers, or wasted Redis calls on invalid requests

## Code Examples

Verified patterns from official sources:

### Initialize Ratelimit with Environment Variables
```typescript
// Source: https://upstash.com/blog/sveltekit-rate-limiting
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { building } from '$app/environment';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$env/static/private';

let ratelimit: Ratelimit;

if (!building) {
  const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
    prefix: 'leadrfeeds_api', // Namespace keys to avoid collisions
  });
}

export { ratelimit };
```

### Check Rate Limit and Return Headers
```typescript
// Source: https://upstash.com/docs/redis/sdks/ratelimit-ts/methods
export async function checkRateLimit(keyId: string): Promise<{
  allowed: boolean;
  headers: Record<string, string>;
  retryAfter?: number;
}> {
  const { success, limit, remaining, reset } = await ratelimit.limit(keyId);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': reset.toString(),
  };

  if (!success) {
    // Calculate seconds until reset
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return { allowed: false, headers, retryAfter };
  }

  return { allowed: true, headers };
}
```

### SvelteKit Handle Hook with Rate Limiting
```typescript
// Source: https://svelte.dev/docs/kit/hooks + https://upstash.com/blog/sveltekit-rate-limiting
import type { Handle } from '@sveltejs/kit';
import { rateLimited } from '$lib/server/api-response';
import { checkRateLimit } from '$lib/server/rate-limit';

export const rateLimitHandler: Handle = async ({ event, resolve }) => {
  // Only apply to API routes (auth already validated apiUser exists)
  if (!event.url.pathname.startsWith('/api/v1/') || !event.locals.apiUser) {
    return resolve(event);
  }

  const { allowed, headers, retryAfter } = await checkRateLimit(event.locals.apiUser.keyId);

  if (!allowed) {
    // Use existing rateLimited helper from Phase 3
    const response = rateLimited('Rate limit exceeded', retryAfter);
    // Add rate limit headers to error response too
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // Store headers for later - resolve() may return immutable response
  event.locals.rateLimitHeaders = headers;

  const response = await resolve(event);

  // Add rate limit headers to success response
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
};
```

### Composing Multiple Handlers
```typescript
// Source: https://svelte.dev/docs/kit/@sveltejs-kit-hooks
import { sequence } from '@sveltejs/kit/hooks';

// Auth handler (existing from Phase 2)
const authHandler: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/v1/')) {
    return resolve(event);
  }
  // ... existing auth logic ...
  return resolve(event);
};

// Rate limit handler (new)
const rateLimitHandler: Handle = async ({ event, resolve }) => {
  // ... rate limiting logic ...
  return resolve(event);
};

export const handle = sequence(authHandler, rateLimitHandler);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TCP-based Redis connections | HTTP-based (connectionless) Redis | 2022+ | Essential for serverless - no connection pool management |
| In-memory counters | Distributed Redis counters | Standard | Required for multi-instance serverless |
| Manual Lua scripts | @upstash/ratelimit package | 2022+ | Pre-built atomic algorithms, tested at scale |
| IP-based limiting | API key-based limiting | Best practice | More accurate identification, no NAT/proxy issues |

**Deprecated/outdated:**
- `ioredis` and `redis` npm packages: Require persistent connections, don't work well in serverless
- In-memory rate limiting: Doesn't work across serverless function instances
- Fixed window without smoothing: Causes burst issues at window boundaries

## Open Questions

Things that couldn't be fully resolved:

1. **Rate limit values (requests per time period)**
   - What we know: Typical APIs use 100-1000 requests/minute for standard tiers
   - What's unclear: What's appropriate for LeadrFeeds read-only API?
   - Recommendation: Start conservative (100 req/min), configurable via environment variable

2. **Different limits for different endpoints**
   - What we know: @upstash/ratelimit supports multiple limiters with different prefixes
   - What's unclear: Do different endpoints need different limits (e.g., /entries vs /stats)?
   - Recommendation: Start with single global limit per key; add granular limits in v2 if needed

3. **Analytics and monitoring**
   - What we know: @upstash/ratelimit has `analytics: true` option for dashboard visibility
   - What's unclear: Is this needed for v1?
   - Recommendation: Enable analytics for visibility into rate limit patterns

## Sources

### Primary (HIGH confidence)
- [Upstash Ratelimit Algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms) - Fixed window, sliding window, token bucket syntax and tradeoffs
- [Upstash Ratelimit Methods](https://upstash.com/docs/redis/sdks/ratelimit-ts/methods) - limit(), blockUntilReady(), response structure
- [SvelteKit Hooks](https://svelte.dev/docs/kit/hooks) - Handle hook, response header modification
- [SvelteKit sequence Helper](https://svelte.dev/docs/kit/@sveltejs-kit-hooks) - Composing multiple handlers
- [Upstash SvelteKit Rate Limiting Blog](https://upstash.com/blog/sveltekit-rate-limiting) - Complete SvelteKit integration pattern

### Secondary (MEDIUM confidence)
- [Rate Limiting Best Practices](https://www.speakeasy.com/api-design/rate-limiting) - X-RateLimit headers, 429 responses
- [IETF RateLimit Headers Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) - Emerging standard for header names
- [GitHub ratelimit-js](https://github.com/upstash/ratelimit-js) - Source code, Lua scripts for atomicity
- [Vercel Upstash Integration](https://upstash.com/docs/redis/howto/vercelintegration) - Environment variable setup

### Tertiary (LOW confidence)
- Various blog posts on rate limiting patterns and pitfalls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Upstash is the established choice for Vercel/serverless rate limiting
- Architecture: HIGH - SvelteKit hooks pattern well-documented, Upstash integration verified
- Pitfalls: MEDIUM - Common patterns documented, but production edge cases may vary

**Research date:** 2026-02-04
**Valid until:** ~60 days (stable libraries, infrequent breaking changes)
