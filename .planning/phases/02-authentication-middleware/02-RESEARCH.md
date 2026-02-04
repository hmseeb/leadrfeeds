# Phase 2: Authentication Middleware - Research

**Researched:** 2026-02-04
**Domain:** SvelteKit hooks.server.ts, API route protection, Bearer token authentication
**Confidence:** HIGH

## Summary

This phase implements centralized API key validation for all `/api/v1/*` routes using SvelteKit's server hooks. Research confirms the standard approach is to create a `hooks.server.ts` file with a `handle` function that intercepts requests, extracts Bearer tokens from the Authorization header, validates them using the existing `validateApiKey()` utility from Phase 1, and attaches user context to `event.locals` for downstream handlers.

The key technical components are:
1. **hooks.server.ts** with a `handle` function that runs before every request
2. **Path-based routing** to only protect `/api/v1/*` routes (not existing web routes)
3. **Bearer token extraction** from `Authorization: Bearer <key>` header
4. **Direct Response return** for 401 errors (bypassing `resolve()` to maintain control over error format)
5. **Typed `event.locals`** via `app.d.ts` to pass user context to API route handlers

The existing `validateApiKey()` function from Phase 1 already handles expired/revoked key checking, so the middleware only needs to orchestrate the flow.

**Primary recommendation:** Create `src/hooks.server.ts` with path-based filtering that protects only `/api/v1/*` routes, extracts Bearer token, calls `validateApiKey()`, and either returns 401 JSON response or attaches `{ userId, keyId }` to `event.locals.apiUser`.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit hooks | 2.x | Server middleware via `handle` function | Official SvelteKit pattern for request interception |
| `@sveltejs/kit` | 2.x | `json()` helper for JSON responses | Built-in, consistent error response format |
| `event.locals` | SvelteKit | Pass validated user to route handlers | Official pattern for per-request server state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sequence` | `@sveltejs/kit/hooks` | Compose multiple handle functions | If adding additional middleware later (rate limiting, logging) |
| `app.d.ts` | TypeScript | Type `App.Locals` interface | Required for TypeScript type safety on `event.locals` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| hooks.server.ts | Per-route validation | More code duplication; hooks centralizes auth logic |
| Direct Response return | `error()` helper | `error()` renders error page; direct Response gives JSON control |
| `event.locals` | Request headers/params | locals is designed for this; headers would require re-validation |

**Installation:**
```bash
# No new packages needed - all tools are native SvelteKit
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
├── hooks.server.ts           # NEW: Server middleware
├── app.d.ts                  # MODIFY: Add App.Locals typing
└── lib/
    └── server/
        ├── supabase.ts       # EXISTS: Service role client
        └── api-keys.ts       # EXISTS: validateApiKey()
```

### Pattern 1: Path-Based API Route Protection
**What:** Check URL pathname to only protect `/api/v1/*` routes, allowing existing web routes to pass through
**When to use:** Always - prevents breaking existing authentication flow
**Example:**
```typescript
// Source: https://svelte.dev/docs/kit/hooks
export const handle: Handle = async ({ event, resolve }) => {
  // Only protect /api/v1/* routes
  if (!event.url.pathname.startsWith('/api/v1/')) {
    return resolve(event);
  }

  // API authentication logic here...
};
```

### Pattern 2: Bearer Token Extraction
**What:** Extract API key from `Authorization: Bearer <key>` header
**When to use:** All API requests
**Example:**
```typescript
// Source: Industry standard, verified via web search
const authHeader = event.request.headers.get('Authorization');

if (!authHeader?.startsWith('Bearer ')) {
  return new Response(
    JSON.stringify({ error: 'Missing or invalid Authorization header' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
```

### Pattern 3: Direct Response for 401 Errors
**What:** Return `new Response()` directly instead of using `error()` helper
**When to use:** API error responses where you need JSON format and custom headers
**Why:** `error()` renders error page; direct Response gives full control over JSON structure
**Example:**
```typescript
// Source: https://github.com/sveltejs/kit/discussions/12251
// Bypassing resolve() to return 401 with custom JSON body
return new Response(
  JSON.stringify({
    error: 'Unauthorized',
    message: 'API key has expired'
  }),
  {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  }
);
```

### Pattern 4: Typed event.locals for User Context
**What:** Define `App.Locals` interface and attach validated user to `event.locals`
**When to use:** Always - enables type-safe access in route handlers
**Example:**
```typescript
// app.d.ts
declare global {
  namespace App {
    interface Locals {
      apiUser?: {
        userId: string;
        keyId: string;
      };
    }
  }
}

// hooks.server.ts
event.locals.apiUser = { userId: result.userId, keyId: result.keyId };

// +server.ts route handler
export const GET: RequestHandler = ({ locals }) => {
  const { userId } = locals.apiUser!; // Type-safe access
};
```

### Anti-Patterns to Avoid
- **Authorization logic in +layout.server.ts:** Not guaranteed to propagate to all routes
- **Using `error()` for API errors:** Renders HTML error page instead of JSON
- **Checking auth in each +server.ts:** Duplicates code, easy to forget
- **Blocking all routes:** Must allow existing web routes (/auth/*, /timeline/*, etc.)
- **Storing full API key in locals:** Only store userId/keyId, never the key itself

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key validation | Custom validation logic | `validateApiKey()` from Phase 1 | Already handles hash comparison, expiry, revocation |
| JSON responses | Manual JSON.stringify + headers | Can use manual or `json()` helper | Consistency; but `json()` may not work outside resolve() |
| Multiple middleware | Nested if statements | `sequence()` helper | Cleaner code, proper ordering |
| Bearer token parsing | Regex | `authHeader.substring(7)` | Simple, predictable format |

**Key insight:** Phase 1 already built the validation logic. This phase is purely orchestration - extract token, call validation, return appropriate response. Keep it thin.

## Common Pitfalls

### Pitfall 1: Using error() for API Responses
**What goes wrong:** `error()` renders HTML error page, not JSON
**Why it happens:** Natural instinct from web route development
**How to avoid:** Return `new Response()` directly for API routes
**Warning signs:** API clients receiving HTML instead of JSON on errors

### Pitfall 2: Blocking Existing Web Routes
**What goes wrong:** Login/register pages break because hooks block them
**Why it happens:** Forgetting to add path check before API auth
**How to avoid:** Always check `event.url.pathname.startsWith('/api/v1/')` first
**Warning signs:** 401 errors on visiting website pages

### Pitfall 3: Forgetting to Call resolve()
**What goes wrong:** Requests hang or return empty responses
**Why it happens:** Early return without response, or missing resolve() call
**How to avoid:** Every code path must either return Response or call resolve(event)
**Warning signs:** Requests timeout, empty responses

### Pitfall 4: Static Assets Blocked
**What goes wrong:** Static assets (CSS, JS, images) return 401
**Why it happens:** hooks.server.ts runs for all requests including assets
**How to avoid:** Check for `/api/v1/` path prefix before auth logic
**Warning signs:** Page loads but looks broken (missing styles/scripts)

### Pitfall 5: Race Conditions with Async Validation
**What goes wrong:** Request proceeds before validation completes
**Why it happens:** Forgetting to await validateApiKey()
**How to avoid:** Always `await` async operations before proceeding
**Warning signs:** Intermittent auth failures, requests sometimes work without valid key

### Pitfall 6: Leaking Error Details
**What goes wrong:** Internal error messages exposed to API clients
**Why it happens:** Passing database errors directly to response
**How to avoid:** Map internal errors to generic messages; log details server-side
**Warning signs:** Clients see stack traces or database error messages

## Code Examples

Verified patterns from official sources:

### Complete hooks.server.ts
```typescript
// Source: https://svelte.dev/docs/kit/hooks (combined with patterns from research)
// File: src/hooks.server.ts

import type { Handle } from '@sveltejs/kit';
import { validateApiKey } from '$lib/server/api-keys';

export const handle: Handle = async ({ event, resolve }) => {
  // Only protect /api/v1/* routes
  if (!event.url.pathname.startsWith('/api/v1/')) {
    return resolve(event);
  }

  // Extract Bearer token from Authorization header
  const authHeader = event.request.headers.get('Authorization');

  if (!authHeader) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing Authorization header'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format. Expected: Bearer <api_key>'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer " prefix

  // Validate API key using Phase 1 utility
  const result = await validateApiKey(apiKey);

  if (!result.valid) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: result.error || 'Invalid API key'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Attach user context to locals for downstream handlers
  event.locals.apiUser = {
    userId: result.userId!,
    keyId: result.keyId!
  };

  // Continue to route handler
  return resolve(event);
};
```

### Updated app.d.ts
```typescript
// Source: https://svelte.dev/docs/kit/types#app.d.ts
// File: src/app.d.ts

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      apiUser?: {
        userId: string;
        keyId: string;
      };
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
```

### Example API Route Handler
```typescript
// Source: https://svelte.dev/docs/kit/routing#+server.js
// File: src/routes/api/v1/timeline/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  // apiUser is guaranteed to exist for /api/v1/* routes
  // because middleware blocks requests without valid key
  const { userId, keyId } = locals.apiUser!;

  // Now use userId for data access...
  // ...

  return json({ message: 'Success', userId });
};
```

### Using sequence() for Multiple Middleware
```typescript
// Source: https://svelte.dev/docs/kit/@sveltejs-kit-hooks
// File: src/hooks.server.ts (alternative with multiple handlers)

import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { validateApiKey } from '$lib/server/api-keys';

const apiAuth: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/v1/')) {
    return resolve(event);
  }

  // ... auth logic ...
  return resolve(event);
};

const logging: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  const response = await resolve(event);
  console.log(`${event.request.method} ${event.url.pathname} - ${Date.now() - start}ms`);
  return response;
};

// Execute in order: logging runs first, then apiAuth
export const handle = sequence(logging, apiAuth);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-route auth checks | Centralized hooks.server.ts | SvelteKit 1.0 | Single point of auth enforcement |
| `error()` for API errors | Direct Response return | N/A (always valid) | Full control over JSON format |
| Untyped locals | Typed App.Locals in app.d.ts | SvelteKit 1.0 | Type-safe user context |
| Nested middleware | `sequence()` helper | SvelteKit 1.0 | Clean composition |

**Deprecated/outdated:**
- `getSession` hook: Removed in SvelteKit 2.0, use `handle` with `event.locals` instead
- `externalFetch` hook: Renamed to `handleFetch`

## Open Questions

Things that couldn't be fully resolved:

1. **Error response format standardization**
   - What we know: Need consistent JSON structure for API errors
   - What's unclear: Exact format (RFC 7807 Problem Details vs simple `{ error, message }`)
   - Recommendation: Use simple format for now; can standardize in dedicated error handling phase

2. **CORS headers for API routes**
   - What we know: May need CORS headers for cross-origin API access
   - What's unclear: Whether this API will be called cross-origin
   - Recommendation: Defer to later phase if needed; can add via resolve options or separate middleware

3. **Request logging granularity**
   - What we know: Logging is useful for debugging and audit
   - What's unclear: How much to log, where to log (console vs external service)
   - Recommendation: Start with minimal console logging; expand in observability phase

## Sources

### Primary (HIGH confidence)
- [SvelteKit Hooks Documentation](https://svelte.dev/docs/kit/hooks) - Official handle function reference
- [SvelteKit @sveltejs/kit/hooks](https://svelte.dev/docs/kit/@sveltejs-kit-hooks) - sequence() helper documentation
- [SvelteKit Types - app.d.ts](https://svelte.dev/docs/kit/types) - App.Locals typing
- [SvelteKit Routing - +server.js](https://svelte.dev/docs/kit/routing) - API route handler patterns
- [SvelteKit Errors](https://svelte.dev/docs/kit/errors) - Error handling and error() function

### Secondary (MEDIUM confidence)
- [GitHub Discussion: CORS and 401 without losing headers](https://github.com/sveltejs/kit/discussions/12251) - Direct Response pattern for auth errors
- [Comprehensive Guide to Locals in SvelteKit](https://khromov.se/the-comprehensive-guide-to-locals-in-sveltekit/) - In-depth locals usage patterns
- [Joy of Code - SvelteKit Hooks](https://joyofcode.xyz/sveltekit-hooks) - Practical hooks examples

### Tertiary (LOW confidence)
- Web search results for "SvelteKit API authentication middleware 2026" - Confirmed patterns align with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SvelteKit documentation
- Architecture: HIGH - Official hooks pattern, verified with multiple sources
- Pitfalls: HIGH - Common issues documented in GitHub discussions and community guides

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, SvelteKit 2 is mature)
