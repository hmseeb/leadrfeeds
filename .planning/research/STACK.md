# Technology Stack: LeadrFeeds Public API

**Project:** LeadrFeeds Read-Only REST API
**Researched:** 2026-02-04
**Focus:** Adding public API with API key authentication to existing SvelteKit + Supabase app

---

## Executive Decision

**Use SvelteKit API routes** for the API layer, not Supabase Edge Functions.

### Why SvelteKit API Routes (Not Edge Functions)

| Factor | SvelteKit API Routes | Supabase Edge Functions |
|--------|---------------------|------------------------|
| **Runtime** | Node.js (full npm ecosystem) | Deno (limited npm compatibility) |
| **Deployment** | Same Vercel deployment | Separate deployment pipeline |
| **Database access** | Reuse existing Supabase client | Need new Deno-compatible client |
| **Code sharing** | Same codebase, same types | Separate codebase |
| **Auth patterns** | Standard SvelteKit hooks | Separate auth implementation |
| **Cold starts** | Vercel-optimized | Supabase infrastructure |

**Confidence: HIGH** - This recommendation is based on:
- Existing codebase already uses SvelteKit with Vercel adapter
- Existing RPC functions (`get_user_timeline`, `get_discovery_feeds`) can be reused
- Single deployment simplifies operations
- No runtime migration risk (Node.js vs Deno)

**Sources:**
- [SvelteKit Routing Docs](https://svelte.dev/docs/kit/routing)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)

---

## Recommended Stack

### API Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SvelteKit API Routes | ^2.47.1 (current) | HTTP endpoints | Already in stack, `/api/v1/*` convention, full Node.js runtime |
| `@sveltejs/kit` | ^2.47.1 | Framework | Already installed, provides `json()` helper and RequestEvent |

**Route Structure:**
```
app/src/routes/api/v1/
  +server.ts           # Health check / API info
  entries/+server.ts   # GET /api/v1/entries
  feeds/+server.ts     # GET /api/v1/feeds
  feeds/[id]/+server.ts
  collections/+server.ts
```

**Confidence: HIGH** - Verified with [SvelteKit docs](https://svelte.dev/docs/kit/routing)

---

### API Key Storage & Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase PostgreSQL | (existing) | API key storage | Already have Supabase, no new service |
| bcrypt (via `pgcrypto`) | Built-in | Key hashing | PostgreSQL extension, secure hashing with cost factor |

**Recommended Schema:**
```sql
-- Private schema for API key storage
CREATE SCHEMA IF NOT EXISTS api_keys_private;

CREATE TABLE api_keys_private.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,           -- bcrypt hash of the key
  key_prefix CHAR(8) NOT NULL,      -- First 8 chars for identification (lf_xxxxxxxx)
  name TEXT NOT NULL,               -- User-provided key name
  permissions TEXT[] DEFAULT ARRAY['read'], -- Scoped permissions
  rate_limit_tier TEXT DEFAULT 'standard',  -- Rate limit tier
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT unique_key_prefix UNIQUE (key_prefix)
);

-- Index for fast prefix lookups
CREATE INDEX idx_api_keys_prefix ON api_keys_private.api_keys(key_prefix) WHERE revoked_at IS NULL;
```

**Key Format:** `lf_` prefix + 32 random hex characters
- Example: `lf_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- Prefix `lf_a1b2c3d4` stored for identification
- Full key hashed with bcrypt (cost 12)

**Validation Function:**
```sql
CREATE OR REPLACE FUNCTION api_keys_private.validate_api_key(p_key TEXT)
RETURNS TABLE(user_id UUID, permissions TEXT[], rate_limit_tier TEXT) AS $$
DECLARE
  v_prefix CHAR(8);
  v_key_hash TEXT;
BEGIN
  -- Extract prefix (after 'lf_' = chars 4-11)
  v_prefix := substring(p_key FROM 4 FOR 8);

  RETURN QUERY
  SELECT ak.user_id, ak.permissions, ak.rate_limit_tier
  FROM api_keys_private.api_keys ak
  WHERE ak.key_prefix = v_prefix
    AND ak.revoked_at IS NULL
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    AND ak.key_hash = crypt(p_key, ak.key_hash);

  -- Update last_used_at
  UPDATE api_keys_private.api_keys
  SET last_used_at = NOW()
  WHERE key_prefix = v_prefix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Confidence: HIGH** - Pattern verified with:
- [Supabase API Key Management Guide](https://makerkit.dev/blog/tutorials/supabase-api-key-management)
- [Supabase API Keys Best Practices](https://supabase.com/docs/guides/api/api-keys)

---

### Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @upstash/ratelimit | ^2.0.8 | Rate limiting logic | Serverless-compatible, HTTP-based Redis |
| @upstash/redis | ^1.36.1 | Redis client | Required by ratelimit, connectionless |

**Why Upstash over alternatives:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Upstash Redis** | HTTP-based (no connection pooling), serverless-native, global distribution, sliding window algorithm | External service ($0 free tier, then usage-based) | **Recommended** |
| Vercel WAF Rate Limiting | Built into Vercel, no external service | Pro plan required ($20/mo), $0.50/1M requests, fixed-window only on Pro | Good alternative if already on Pro |
| sveltekit-rate-limiter | No external service, in-memory | Doesn't persist across function instances, loses state on cold starts | **Not suitable for serverless** |
| Supabase-based | Same database | Adds latency to every request, not designed for rate limiting | Not recommended |

**Confidence: HIGH** - Upstash is the industry standard for serverless rate limiting
- [Upstash Ratelimit Docs](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [GitHub: upstash/ratelimit-js](https://github.com/upstash/ratelimit-js)
- [Upstash SvelteKit Guide](https://upstash.com/blog/sveltekit-rate-limiting)

**Configuration:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
  prefix: 'leadrfeeds:api'
});

// Per-key rate limiting
const { success, limit, remaining, reset } = await ratelimit.limit(apiKeyId);
```

**Tiered Limits:**
```typescript
const limits = {
  free: Ratelimit.slidingWindow(60, '1 m'),      // 60/min
  standard: Ratelimit.slidingWindow(300, '1 m'), // 300/min
  premium: Ratelimit.slidingWindow(1000, '1 m')  // 1000/min
};
```

---

### Authentication Middleware

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SvelteKit hooks.server.ts | (built-in) | Request interception | Standard SvelteKit pattern for middleware |
| sequence() | @sveltejs/kit | Chain multiple handlers | Compose auth + rate limiting |

**Implementation Pattern:**
```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';

const apiAuth: Handle = async ({ event, resolve }) => {
  // Only apply to /api/v1/* routes
  if (!event.url.pathname.startsWith('/api/v1')) {
    return resolve(event);
  }

  const apiKey = event.request.headers.get('x-api-key')
    || event.request.headers.get('authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate key and attach to locals
  const keyData = await validateApiKey(apiKey);
  if (!keyData) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  event.locals.apiKey = keyData;
  return resolve(event);
};

export const handle = sequence(apiAuth, /* other handlers */);
```

**Confidence: HIGH** - Standard SvelteKit pattern
- [SvelteKit Hooks Documentation](https://svelte.dev/docs/kit/hooks)
- [SvelteKit Auth Patterns](https://svelte.dev/docs/kit/auth)

---

### Response Headers

Standard API response headers to include:

```typescript
const apiHeaders = {
  'Content-Type': 'application/json',
  'X-RateLimit-Limit': limit.toString(),
  'X-RateLimit-Remaining': remaining.toString(),
  'X-RateLimit-Reset': reset.toString(),
  'Cache-Control': 'private, max-age=60', // For read-only endpoints
};
```

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.x | Request validation | Validate query params, ensure type safety |
| nanoid | ^5.x | Key generation | Generate API keys with `nanoid(32)` |

**Confidence: MEDIUM** - Common patterns, versions not verified against npm

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|-------------------|
| API Layer | SvelteKit routes | Supabase Edge Functions | Deno runtime complexity, separate deployment, code duplication |
| API Layer | SvelteKit routes | Separate Express/Hono API | Unnecessary complexity, extra deployment |
| Rate Limiting | Upstash | Vercel WAF | Requires Pro plan, less flexible algorithms |
| Rate Limiting | Upstash | In-memory | Doesn't work with serverless (instance isolation) |
| Key Storage | Supabase PostgreSQL | Separate service (Auth0, etc.) | Already have Supabase, no need for another service |
| Key Hashing | bcrypt (pgcrypto) | SHA-256 | SHA-256 is too fast, vulnerable to brute force |

---

## Environment Variables

New variables needed:

```env
# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Optional: API configuration
API_KEY_SALT=xxx  # Additional salt for key hashing (optional with bcrypt)
```

---

## Installation

```bash
cd app

# Rate limiting
npm install @upstash/ratelimit @upstash/redis

# Optional: validation and key generation
npm install zod nanoid
```

---

## Cost Analysis

| Service | Free Tier | Paid |
|---------|-----------|------|
| Upstash Redis | 10K commands/day | $0.2/100K commands |
| Vercel (existing) | Hobby limits | Pro $20/mo |
| Supabase (existing) | 500MB DB | Already covered |

**Estimated API cost at 100K requests/month:** ~$0.40 (Upstash only)

---

## Architecture Summary

```
Request Flow:

  Client
    |
    | x-api-key: lf_xxx
    v
  Vercel Edge
    |
    v
  hooks.server.ts
    |-- Extract API key
    |-- Validate via Supabase RPC
    |-- Check rate limit via Upstash
    |-- Attach user context to locals
    v
  /api/v1/* routes
    |-- Use existing RPC functions
    |-- Return JSON with rate limit headers
    v
  Response
```

---

## Sources Summary

### HIGH Confidence (Official Docs)
- [SvelteKit Routing](https://svelte.dev/docs/kit/routing) - API route patterns
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) - Architecture comparison
- [Upstash Ratelimit Overview](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview) - Rate limiting SDK
- [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys) - Key management patterns

### MEDIUM Confidence (Verified Guides)
- [Upstash SvelteKit Rate Limiting](https://upstash.com/blog/sveltekit-rate-limiting) - Implementation guide
- [Supabase API Key Management](https://makerkit.dev/blog/tutorials/supabase-api-key-management) - Schema patterns
- [SvelteKit Hooks Guide](https://joyofcode.xyz/sveltekit-hooks) - Middleware patterns

### Package Versions (Verified)
- @upstash/ratelimit: 2.0.8 (Jan 2026) - [npm](https://www.npmjs.com/package/@upstash/ratelimit)
- @upstash/redis: 1.36.1 (Jan 2026) - [npm](https://www.npmjs.com/package/@upstash/redis)
- @sveltejs/kit: 2.47.1 (current in package.json)

---

## Open Questions for Implementation

1. **Key rotation strategy** - How will users rotate keys without downtime?
2. **Usage analytics** - Do we want to track per-key usage beyond rate limiting?
3. **Webhook support** - Future consideration for push-based API?
4. **Documentation** - OpenAPI/Swagger spec generation?

---

## Roadmap Implications

**Phase 1: Foundation**
- Create API key schema in Supabase
- Set up Upstash account and Redis instance
- Implement hooks.server.ts middleware

**Phase 2: Endpoints**
- Create `/api/v1/entries` endpoint (reuse `get_user_timeline`)
- Create `/api/v1/feeds` endpoint (reuse `get_discovery_feeds`)
- Create `/api/v1/collections` endpoint

**Phase 3: Key Management**
- User-facing key generation UI
- Key listing and revocation
- Usage dashboard

**Phase 4: Documentation**
- API documentation page
- OpenAPI spec
- Code examples
