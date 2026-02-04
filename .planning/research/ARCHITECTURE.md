# Architecture Patterns: Read-Only REST API for LeadrFeeds

**Domain:** REST API layer for existing SvelteKit + Supabase application
**Researched:** 2026-02-04
**Confidence:** HIGH (verified with official SvelteKit docs and established patterns)

## Recommended Architecture

```
                    +-----------------------+
                    |     API Consumer      |
                    | (External client with |
                    |      API key)         |
                    +-----------+-----------+
                                |
                                | HTTPS + API Key header
                                v
+-----------------------------------------------------------------------------------+
|                           SvelteKit Server                                        |
|                                                                                   |
|  +-------------------------+     +--------------------------------------------+   |
|  |   hooks.server.ts       |     |             /api/v1/* routes               |   |
|  |   (sequence middleware) |     |                                            |   |
|  |                         |     |  +---------------+  +------------------+   |   |
|  |  1. apiKeyAuth()        |---->|  | /entries      |  | /feeds           |   |   |
|  |  2. rateLimiter()       |     |  | +server.ts    |  | +server.ts       |   |   |
|  |                         |     |  +---------------+  +------------------+   |   |
|  +-------------------------+     |                                            |   |
|                                  |  +---------------+  +------------------+   |   |
|                                  |  | /collections  |  | /unread-counts   |   |   |
|                                  |  | +server.ts    |  | +server.ts       |   |   |
|                                  |  +---------------+  +------------------+   |   |
|                                  +--------------------------------------------+   |
|                                                 |                                 |
+-----------------------------------------------------------------------------------+
                                                  |
                                                  | Service role client
                                                  | (bypasses user RLS)
                                                  v
                          +---------------------------------------+
                          |              Supabase                 |
                          |                                       |
                          |  +-------------+  +---------------+   |
                          |  | api_keys    |  | Existing RPC  |   |
                          |  | table       |  | functions     |   |
                          |  | (new)       |  | (reuse)       |   |
                          |  +-------------+  +---------------+   |
                          |                                       |
                          |  Tables: feeds, entries,              |
                          |  user_subscriptions, etc.             |
                          +---------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `hooks.server.ts` | Request interception, API key validation, rate limiting | All API routes via SvelteKit's sequence |
| `/api/v1/*` routes | HTTP interface, request parsing, response formatting | Supabase via service client, hooks via locals |
| `$lib/server/api/` | Shared API utilities (auth, types, helpers) | Routes import these modules |
| Supabase service client | Database access bypassing user RLS | Existing RPC functions, direct table queries |
| `api_keys` table | API key storage with hashed values | Service client queries for validation |

### Data Flow

**Request Flow (Read Operation):**

```
1. Request arrives: GET /api/v1/entries?limit=50
   Headers: { Authorization: Bearer lrf_xxxx... }

2. hooks.server.ts intercepts:
   a. apiKeyAuth hook extracts key from Authorization header
   b. Validates key against api_keys table (SHA-256 hash comparison)
   c. Attaches user_id and permissions to event.locals
   d. rateLimiter hook checks request count against limits
   e. If limits exceeded, returns 429 Too Many Requests

3. Route handler executes:
   a. Reads user_id from event.locals.apiKey.userId
   b. Calls Supabase RPC (get_user_timeline) with user_id
   c. Transforms response to API schema
   d. Returns JSON response

4. Response: 200 OK with JSON payload
```

**Authentication Flow:**

```
API Key in request
       |
       v
+------+-------+
| Extract key  |  (from Authorization: Bearer header)
+------+-------+
       |
       v
+------+-------+
| Hash key     |  (SHA-256, to match stored hash)
| (SHA-256)    |
+------+-------+
       |
       v
+------+-------+
| Query        |  (SELECT * FROM api_keys WHERE key_hash = ?)
| api_keys     |
+------+-------+
       |
       +------ Not found? --> 401 Unauthorized
       |
       v
+------+-------+
| Check expiry |  (is key expired?)
+------+-------+
       |
       +------ Expired? --> 401 Unauthorized
       |
       v
+------+-------+
| Attach to    |  event.locals.apiKey = { userId, permissions, ... }
| locals       |
+------+-------+
       |
       v
   Continue to route handler
```

## Patterns to Follow

### Pattern 1: SvelteKit `sequence` for Middleware Chain

**What:** Use `@sveltejs/kit/hooks` sequence function to chain authentication and rate limiting hooks.

**When:** All `/api/v1/*` requests need auth + rate limiting before reaching handlers.

**Why:** SvelteKit's official pattern for composing middleware. Clean separation of concerns.

**Example:**

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';

const apiKeyAuth: Handle = async ({ event, resolve }) => {
  // Only apply to API routes
  if (!event.url.pathname.startsWith('/api/v1')) {
    return resolve(event);
  }

  const authHeader = event.request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = authHeader.slice(7); // Remove 'Bearer '

  // Validate key (implementation in lib/server/api/auth.ts)
  const keyInfo = await validateApiKey(apiKey);
  if (!keyInfo) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Attach to locals for route handlers
  event.locals.apiKey = keyInfo;
  return resolve(event);
};

const rateLimiter: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/v1')) {
    return resolve(event);
  }

  // Rate limiting logic (implementation varies by approach)
  const isLimited = await checkRateLimit(event.locals.apiKey.id);
  if (isLimited) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60'
      }
    });
  }

  return resolve(event);
};

export const handle = sequence(apiKeyAuth, rateLimiter);
```

**Source:** [SvelteKit @sveltejs/kit/hooks docs](https://svelte.dev/docs/kit/@sveltejs-kit-hooks)

### Pattern 2: Separate Service Role Supabase Client

**What:** Create a dedicated Supabase client with service_role key for API routes that bypasses user-based RLS.

**When:** API needs to query data for a user identified by API key, not by Supabase session.

**Why:** The standard anon client uses session-based auth. API keys authenticate externally, so we need service_role to bypass RLS and then filter by the API key's owner.

**Example:**

```typescript
// src/lib/server/supabase-admin.ts
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

// CRITICAL: This client bypasses RLS - never expose to browser
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
```

**Source:** [Supabase Service Role documentation](https://supabase.com/docs/guides/database/postgres/row-level-security), [egghead.io lesson](https://egghead.io/lessons/supabase-use-the-supabase-service-key-to-bypass-row-level-security)

### Pattern 3: URL Path Versioning

**What:** Embed version in URL path: `/api/v1/entries`, `/api/v2/entries`

**When:** Building public APIs that need long-term stability.

**Why:** Most widely adopted pattern. Clear, explicit, cache-friendly. Used by Twitter, GitHub, Instagram.

**Example:**

```
app/src/routes/
  api/
    v1/
      entries/
        +server.ts       # GET /api/v1/entries
      feeds/
        +server.ts       # GET /api/v1/feeds
      collections/
        +server.ts       # GET /api/v1/collections
        [id]/
          +server.ts     # GET /api/v1/collections/:id
```

**Source:** [Postman API versioning guide](https://www.postman.com/api-platform/api-versioning/), [restfulapi.net](https://restfulapi.net/versioning/)

### Pattern 4: Extend `app.d.ts` for Type-Safe Locals

**What:** Declare API key info type in SvelteKit's App.Locals interface.

**When:** Passing authenticated user context from hooks to route handlers.

**Why:** TypeScript autocomplete and type safety when accessing `event.locals.apiKey`.

**Example:**

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      apiKey?: {
        id: string;
        userId: string;
        name: string;
        permissions: string[];
        createdAt: Date;
      };
    }
  }
}

export {};
```

**Source:** [SvelteKit types documentation](https://svelte.dev/docs/kit/types#app.d.ts)

### Pattern 5: Reuse Existing RPC Functions

**What:** Call existing Supabase RPC functions (get_user_timeline, get_unread_counts) from API routes with service client.

**When:** API needs same data as web UI.

**Why:** DRY principle. RPC functions already handle complex joins and filtering. Reduces maintenance burden.

**Example:**

```typescript
// src/routes/api/v1/entries/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const GET: RequestHandler = async ({ locals, url }) => {
  const userId = locals.apiKey?.userId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const feedId = url.searchParams.get('feed_id') || undefined;
  const unreadOnly = url.searchParams.get('unread_only') === 'true';
  const starredOnly = url.searchParams.get('starred_only') === 'true';

  const { data, error } = await supabaseAdmin.rpc('get_user_timeline', {
    user_id_param: userId,
    limit_param: limit,
    offset_param: offset,
    feed_id_filter: feedId,
    unread_only: unreadOnly,
    starred_only: starredOnly
  });

  if (error) {
    return json({ error: 'Database error' }, { status: 500 });
  }

  return json({
    data,
    pagination: { limit, offset, count: data?.length || 0 }
  });
};
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Session Auth with API Key Auth

**What:** Using the same Supabase client for both session-based (web UI) and API key (REST API) authentication.

**Why bad:** Session tokens can leak into service role clients (especially in SSR). The service_role key stops bypassing RLS if a user JWT is attached.

**Instead:** Create completely separate clients:
- Web UI: Uses anon key + user session (existing `supabase.ts`)
- API: Uses service_role key, never touches user sessions (new `supabase-admin.ts`)

**Source:** [Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)

### Anti-Pattern 2: Storing API Keys in Plain Text

**What:** Storing the actual API key string in the database.

**Why bad:** Database breach exposes all keys. Keys can be used immediately without any further attack.

**Instead:** Store only SHA-256 hash of the key. When validating, hash the incoming key and compare hashes.

```typescript
// Generate key
const key = `lrf_${generateRandomString(32)}`;
const keyHash = await sha256(key);

// Store only hash
await supabaseAdmin.from('api_keys').insert({
  key_hash: keyHash, // Store this
  // key: key  // NEVER store this
  user_id: userId,
  name: keyName
});

// Return key to user ONCE
return { key }; // User must save this, we can't recover it
```

### Anti-Pattern 3: Authorization Logic in +layout.server.ts

**What:** Putting API auth checks in a layout file.

**Why bad:** SvelteKit layouts don't guarantee propagation to all child routes. Can be bypassed.

**Instead:** Use hooks.server.ts for consistent interception of all matching routes.

**Source:** [SvelteKit auth best practices](https://dev.to/jais_mukesh/part-3-protecting-routes-and-security-54pk)

### Anti-Pattern 4: Exposing Internal Error Details

**What:** Returning Supabase error messages directly to API consumers.

**Why bad:** Leaks implementation details. Potential security information disclosure.

**Instead:** Log detailed errors server-side, return generic messages to clients.

```typescript
// BAD
if (error) {
  return json({ error: error.message }, { status: 500 });
}

// GOOD
if (error) {
  console.error('API error:', error);
  return json({ error: 'Internal server error' }, { status: 500 });
}
```

### Anti-Pattern 5: No Rate Limiting

**What:** Deploying API without any request throttling.

**Why bad:** Vulnerable to abuse, DoS attacks, cost explosion (Supabase bills by usage).

**Instead:** Implement rate limiting from day one. Start simple (in-memory), upgrade to Redis if needed.

**Source:** [SvelteKit rate limiting discussion](https://github.com/sveltejs/kit/issues/8764)

## Scalability Considerations

| Concern | Initial (MVP) | Growth (10K requests/day) | Scale (1M+ requests/day) |
|---------|--------------|--------------------------|--------------------------|
| Rate limiting | In-memory counter | sveltekit-rate-limiter with TTL cache | Redis-backed (Upstash) |
| API key validation | DB query per request | LRU cache (5 min TTL) | Redis cache + Supabase |
| Response caching | None | HTTP caching headers | Edge caching (Vercel) |
| Logging | Console | Structured JSON logs | Log aggregation service |
| Monitoring | None | Basic metrics | Full APM (latency, errors) |

## Build Order (Dependencies)

The following order respects dependencies between components:

```
Phase 1: Foundation (no dependencies)
  1. api_keys table in Supabase (independent)
  2. $lib/server/supabase-admin.ts (needs SUPABASE_SERVICE_ROLE_KEY env var)
  3. Update app.d.ts with Locals types (independent)

Phase 2: Auth Layer (depends on Phase 1)
  4. $lib/server/api/auth.ts - key validation logic (needs api_keys table)
  5. hooks.server.ts - apiKeyAuth middleware (needs auth.ts)

Phase 3: Rate Limiting (depends on Phase 2)
  6. Rate limiting in hooks.server.ts (needs auth working first)

Phase 4: Endpoints (depends on Phases 1-3)
  7. /api/v1/entries/+server.ts (needs all above)
  8. /api/v1/feeds/+server.ts
  9. /api/v1/collections/+server.ts
  10. /api/v1/unread-counts/+server.ts

Phase 5: Key Management (can be parallel with Phase 4)
  11. User-facing API key generation/revocation (settings page or dedicated route)
```

**Critical path:** Phases 1-3 must be complete before any endpoint works.

## File Structure Recommendation

```
app/src/
  hooks.server.ts                    # NEW: Auth + rate limiting middleware
  app.d.ts                           # UPDATE: Add Locals.apiKey type
  lib/
    server/                          # NEW directory for server-only code
      supabase-admin.ts              # Service role client
      api/
        auth.ts                      # API key validation
        rate-limit.ts                # Rate limiting logic
        types.ts                     # API-specific types
    services/
      supabase.ts                    # EXISTING: anon client (unchanged)
  routes/
    api/
      v1/
        entries/
          +server.ts                 # GET /api/v1/entries
        feeds/
          +server.ts                 # GET /api/v1/feeds
        collections/
          +server.ts                 # GET /api/v1/collections
          [id]/
            +server.ts               # GET /api/v1/collections/:id
        unread-counts/
          +server.ts                 # GET /api/v1/unread-counts
```

## Environment Variables (New)

```env
# .env (add to existing)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**CRITICAL:** Never commit this key. Add to `.env.example` as placeholder only.

## Sources

- [SvelteKit Routing - +server.ts files](https://svelte.dev/docs/kit/routing) (HIGH confidence)
- [SvelteKit @sveltejs/kit/hooks - sequence](https://svelte.dev/docs/kit/@sveltejs-kit-hooks) (HIGH confidence)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) (HIGH confidence)
- [Supabase Service Role Key bypass RLS](https://egghead.io/lessons/supabase-use-the-supabase-service-key-to-bypass-row-level-security) (HIGH confidence)
- [sveltekit-rate-limiter](https://github.com/ciscoheat/sveltekit-rate-limiter) (MEDIUM confidence - community library)
- [svelte-api-keys](https://github.com/CaptainCodeman/svelte-api-keys) (MEDIUM confidence - community library)
- [API Versioning Best Practices](https://www.postman.com/api-platform/api-versioning/) (HIGH confidence)
- [JWT Auth in SvelteKit](https://www.okupter.com/blog/handling-auth-with-jwt-in-sveltekit) (MEDIUM confidence)
