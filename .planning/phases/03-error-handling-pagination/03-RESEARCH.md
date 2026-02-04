# Phase 3: Error Handling & Pagination - Research

**Researched:** 2026-02-04
**Domain:** REST API error response format, HTTP status codes, cursor-based pagination with Supabase
**Confidence:** HIGH

## Summary

This phase establishes consistent error handling and pagination patterns for the LeadrFeeds API. Research confirms two standard approaches:

1. **Error Handling**: Use a simplified RFC 9457-inspired format with `code`, `message`, and `status` fields. Create helper utilities that return `Response` objects directly (not using SvelteKit's `error()` helper, which renders HTML). This continues the pattern established in Phase 2's `unauthorized()` helper.

2. **Cursor-Based Pagination**: Use keyset pagination with Base64-encoded opaque cursors. Supabase supports this via `gt()`/`lt()` filters on indexed columns. The cursor encodes the last item's sort values (typically `published_at` + `id` for entries), enabling O(1) performance regardless of page depth.

The key technical components are:
1. **Error response utilities** in `$lib/server/api-response.ts` with helpers like `badRequest()`, `notFound()`, `serverError()`
2. **HTTP status code mapping** ensuring 400 for validation, 401 for auth, 404 for missing, 429 for rate limits, 500 for server errors
3. **Cursor encoding/decoding** utilities using Base64 to make cursors opaque to clients
4. **Pagination wrapper** that applies cursor filters to Supabase queries and returns `next_cursor` in responses
5. **Configurable page size** with enforced maximum (default 50, max 100)

**Primary recommendation:** Create `$lib/server/api-response.ts` with error helpers that return `Response` objects and `$lib/server/pagination.ts` with cursor utilities. All API responses follow a consistent envelope: `{ data, meta }` for success, `{ error: { code, message, status } }` for errors.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `Response` | Web API | JSON error responses | Full control over status, headers, body |
| `btoa()`/`atob()` | Native | Base64 cursor encoding | Built-in, no dependencies |
| Supabase `gt()`/`lt()` | existing | Cursor-based filtering | Native Supabase methods, use indexes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@sveltejs/kit` json() | 2.x | JSON response helper | Success responses (uses Response internally) |
| `$lib/server/` | SvelteKit | Server-only utilities | Prevent cursor implementation leaking to client |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Base64 cursors | Plain ID cursors | Base64 is opaque, prevents client tampering/assumptions |
| Custom error format | RFC 9457 full | RFC 9457 has more fields than needed; simplified version suffices |
| `error()` helper | Direct Response | `error()` renders HTML; we need JSON for API |
| Offset pagination | Cursor pagination | Offset degrades O(n) at depth; cursor is always O(1) |

**Installation:**
```bash
# No new packages needed - all tools are native
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
└── server/
    ├── supabase.ts           # EXISTS: Service role client
    ├── api-keys.ts           # EXISTS: Key validation
    ├── api-response.ts       # NEW: Error response helpers
    └── pagination.ts         # NEW: Cursor pagination utilities
```

### Pattern 1: Consistent Error Response Format
**What:** All API errors return the same JSON structure with `code`, `message`, and `status`
**When to use:** Every API error response
**Example:**
```typescript
// $lib/server/api-response.ts
export interface ApiError {
  error: {
    code: string;      // Machine-readable code (e.g., "INVALID_CURSOR")
    message: string;   // Human-readable message
    status: number;    // HTTP status code (redundant but useful for clients)
  };
}

// Error response:
{
  "error": {
    "code": "INVALID_CURSOR",
    "message": "The provided cursor is invalid or expired",
    "status": 400
  }
}
```

### Pattern 2: Error Helper Functions
**What:** Helper functions that create Response objects for common error types
**When to use:** Any API endpoint returning an error
**Example:**
```typescript
// $lib/server/api-response.ts
function apiError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code, message, status }
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Convenience helpers
export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  apiError(400, code, message);

export const unauthorized = (message: string, code = 'UNAUTHORIZED') =>
  apiError(401, code, message);

export const notFound = (message: string, code = 'NOT_FOUND') =>
  apiError(404, code, message);

export const rateLimited = (message: string, retryAfter?: number) => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (retryAfter) headers['Retry-After'] = String(retryAfter);
  return new Response(
    JSON.stringify({
      error: { code: 'RATE_LIMITED', message, status: 429 }
    }),
    { status: 429, headers }
  );
};

export const serverError = (message = 'An internal error occurred') =>
  apiError(500, 'INTERNAL_ERROR', message);
```

### Pattern 3: Opaque Base64 Cursor Encoding
**What:** Encode cursor data as Base64 to make it opaque to clients
**When to use:** All paginated responses
**Example:**
```typescript
// $lib/server/pagination.ts
interface CursorData {
  published_at: string;
  id: string;
}

export function encodeCursor(data: CursorData): string {
  // JSON stringify, then Base64 encode
  return btoa(JSON.stringify(data));
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = atob(cursor);
    const parsed = JSON.parse(decoded);

    // Validate structure
    if (typeof parsed.published_at !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    return parsed as CursorData;
  } catch {
    return null;
  }
}
```

### Pattern 4: Keyset Pagination with Supabase
**What:** Use `lt()`/`gt()` filters for cursor-based pagination instead of offset
**When to use:** All paginated queries
**Example:**
```typescript
// $lib/server/pagination.ts
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    next_cursor: string | null;
    has_more: boolean;
    limit: number;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function getEffectiveLimit(requested?: number): number {
  if (!requested || requested < 1) return DEFAULT_LIMIT;
  return Math.min(requested, MAX_LIMIT);
}

// Example usage in an endpoint
async function getEntries(userId: string, params: PaginationParams) {
  const limit = getEffectiveLimit(params.limit);

  let query = supabaseAdmin
    .from('entries')
    .select('*')
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // Fetch one extra to detect if there's more

  // Apply cursor filter if provided
  if (params.cursor) {
    const cursorData = decodeCursor(params.cursor);
    if (!cursorData) {
      return badRequest('Invalid cursor', 'INVALID_CURSOR');
    }

    // Multi-column keyset: (published_at, id) < (cursor_published_at, cursor_id)
    query = query.or(
      `published_at.lt.${cursorData.published_at},` +
      `and(published_at.eq.${cursorData.published_at},id.lt.${cursorData.id})`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error('Query error:', error);
    return serverError();
  }

  // Check if there are more results
  const hasMore = data.length > limit;
  const results = hasMore ? data.slice(0, limit) : data;

  // Generate next cursor from last item
  const nextCursor = hasMore && results.length > 0
    ? encodeCursor({
        published_at: results[results.length - 1].published_at,
        id: results[results.length - 1].id
      })
    : null;

  return {
    data: results,
    meta: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit
    }
  };
}
```

### Pattern 5: Success Response Envelope
**What:** Consistent structure for successful responses with data and metadata
**When to use:** All successful API responses
**Example:**
```typescript
// Success response (paginated)
{
  "data": [...],
  "meta": {
    "next_cursor": "eyJwdWJsaXNoZWRfYXQiOiIyMDI0LTAxLTE1VDEwOjAwOjAwWiIsImlkIjoiYWJjMTIzIn0=",
    "has_more": true,
    "limit": 50
  }
}

// Success response (single item)
{
  "data": { ... }
}

// Success response (stats/counts)
{
  "data": {
    "total_unread": 42,
    "total_starred": 10
  }
}
```

### Anti-Patterns to Avoid
- **Using `error()` for API routes:** Renders HTML; use direct Response for JSON
- **Offset pagination:** O(n) performance at depth; always use cursor/keyset
- **Exposing raw cursor values:** Use Base64 encoding to make cursors opaque
- **Different error formats per endpoint:** Inconsistent; use centralized helpers
- **Uncapped page sizes:** Can DOS the database; enforce MAX_LIMIT
- **Single-column cursor:** Ties can skip/duplicate items; use composite cursor

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON responses | Manual JSON.stringify + headers each time | Centralized helpers | Consistency, less code |
| Cursor validation | Inline try/catch parsing | `decodeCursor()` helper | Consistent validation, type safety |
| Page size validation | Ad-hoc checks | `getEffectiveLimit()` | Enforces max, provides default |
| Multi-column keyset | Multiple WHERE clauses | Supabase `.or()` with tuple comparison | Correct ordering semantics |

**Key insight:** Error handling and pagination are cross-cutting concerns. Centralized utilities ensure consistency and reduce bugs from copy-paste variations.

## Common Pitfalls

### Pitfall 1: Using `error()` for API Routes
**What goes wrong:** `error()` from `@sveltejs/kit` renders HTML error pages, not JSON
**Why it happens:** Natural habit from web route development
**How to avoid:** Return `new Response()` directly with JSON body
**Warning signs:** API clients receiving HTML instead of JSON on errors

### Pitfall 2: Offset Pagination at Scale
**What goes wrong:** Query time increases linearly with page depth; page 10,000 scans 200,000 rows
**Why it happens:** Offset is simpler to implement; performance issue not noticed on small datasets
**How to avoid:** Use keyset/cursor pagination from day one
**Warning signs:** Timeline queries slow down as users scroll deep; `EXPLAIN` shows sequential scans

### Pitfall 3: Single-Column Cursor
**What goes wrong:** When two items have the same `published_at`, pagination can skip or duplicate items
**Why it happens:** Assuming timestamps are unique
**How to avoid:** Always include a unique column (id) in the cursor; use tuple comparison
**Warning signs:** Users report missing entries or duplicates when scrolling

### Pitfall 4: Decodable Cursors Allowing Tampering
**What goes wrong:** Clients decode cursors, modify values, and skip ahead or access unauthorized data
**Why it happens:** Using plain JSON or readable cursor format
**How to avoid:** Base64 encode cursors; treat them as opaque; validate structure on decode
**Warning signs:** Clients using cursor values as query parameters directly

### Pitfall 5: Leaking Internal Details in Errors
**What goes wrong:** Error messages expose table names, SQL errors, or stack traces
**Why it happens:** Passing database errors directly to response
**How to avoid:** Log details server-side; return generic message to client
**Warning signs:** API responses contain "relation does not exist" or "syntax error"

### Pitfall 6: Missing Index for Cursor Column
**What goes wrong:** Keyset pagination still does sequential scan without proper index
**Why it happens:** Index on (published_at) alone; need composite index
**How to avoid:** Create index on `(published_at DESC, id DESC)` for the sort order used
**Warning signs:** `EXPLAIN` shows Seq Scan; query time increases with table size

## Code Examples

Verified patterns from official sources and established practices:

### Complete api-response.ts
```typescript
// Source: Adapted from RFC 9457 pattern + SvelteKit best practices
// File: $lib/server/api-response.ts

/**
 * Standard API error structure.
 * Inspired by RFC 9457 (Problem Details) but simplified.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    status: number;
  };
}

/**
 * Create a JSON error response.
 */
function apiError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>
): Response {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  return new Response(
    JSON.stringify({
      error: { code, message, status }
    }),
    { status, headers }
  );
}

// 400 Bad Request - Client sent invalid data
export function badRequest(
  message: string,
  code = 'BAD_REQUEST'
): Response {
  return apiError(400, code, message);
}

// 401 Unauthorized - Missing or invalid authentication
export function unauthorized(
  message: string,
  code = 'UNAUTHORIZED'
): Response {
  return apiError(401, code, message);
}

// 403 Forbidden - Authenticated but not allowed
export function forbidden(
  message: string,
  code = 'FORBIDDEN'
): Response {
  return apiError(403, code, message);
}

// 404 Not Found - Resource doesn't exist
export function notFound(
  message: string,
  code = 'NOT_FOUND'
): Response {
  return apiError(404, code, message);
}

// 429 Too Many Requests - Rate limit exceeded
export function rateLimited(
  message: string,
  retryAfter?: number
): Response {
  const extraHeaders: Record<string, string> = {};
  if (retryAfter !== undefined) {
    extraHeaders['Retry-After'] = String(retryAfter);
  }
  return apiError(429, 'RATE_LIMITED', message, extraHeaders);
}

// 500 Internal Server Error - Server-side failure
export function serverError(
  message = 'An internal error occurred'
): Response {
  // Never expose internal details - log them server-side
  return apiError(500, 'INTERNAL_ERROR', message);
}

/**
 * Success response helper for paginated data.
 */
export function paginatedResponse<T>(
  data: T[],
  meta: {
    next_cursor: string | null;
    has_more: boolean;
    limit: number;
  }
): Response {
  return new Response(
    JSON.stringify({ data, meta }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Success response helper for single item or non-paginated data.
 */
export function successResponse<T>(data: T): Response {
  return new Response(
    JSON.stringify({ data }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
```

### Complete pagination.ts
```typescript
// Source: Supabase best practices + cursor pagination patterns
// File: $lib/server/pagination.ts

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Data encoded in the cursor for entries pagination.
 * Uses composite key to handle ties in published_at.
 */
export interface EntryCursorData {
  p: string;  // published_at (ISO string)
  i: string;  // id
}

/**
 * Encode cursor data as opaque Base64 string.
 * Clients should treat this as an opaque token.
 */
export function encodeCursor(data: EntryCursorData): string {
  return btoa(JSON.stringify(data));
}

/**
 * Decode and validate cursor from client.
 * Returns null if cursor is invalid.
 */
export function decodeCursor(cursor: string): EntryCursorData | null {
  try {
    const decoded = atob(cursor);
    const parsed = JSON.parse(decoded);

    // Validate structure
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.p !== 'string' ||
      typeof parsed.i !== 'string'
    ) {
      return null;
    }

    // Validate date format
    const date = new Date(parsed.p);
    if (isNaN(date.getTime())) {
      return null;
    }

    return { p: parsed.p, i: parsed.i };
  } catch {
    return null;
  }
}

/**
 * Get effective limit, capped at MAX_LIMIT.
 */
export function getEffectiveLimit(requested?: number): number {
  if (requested === undefined || requested === null || requested < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(requested, MAX_LIMIT);
}

/**
 * Pagination metadata included in responses.
 */
export interface PaginationMeta {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}

/**
 * Build pagination metadata from query results.
 *
 * @param results - Query results (should fetch limit + 1 to detect has_more)
 * @param limit - Requested limit
 * @param extractCursor - Function to extract cursor data from last item
 */
export function buildPaginationMeta<T>(
  results: T[],
  limit: number,
  extractCursor: (item: T) => EntryCursorData
): { items: T[]; meta: PaginationMeta } {
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(extractCursor(items[items.length - 1]))
    : null;

  return {
    items,
    meta: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit
    }
  };
}

/**
 * Parse pagination params from URL search params.
 */
export function parsePaginationParams(url: URL): {
  cursor: string | null;
  limit: number;
} {
  const cursor = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const limit = getEffectiveLimit(
    limitParam ? parseInt(limitParam, 10) : undefined
  );

  return { cursor, limit };
}
```

### HTTP Status Code Reference
```typescript
// Quick reference for choosing correct status codes

// 400 Bad Request - Invalid syntax, missing required params, invalid cursor
// Example: Missing required query parameter, malformed JSON

// 401 Unauthorized - No authentication provided or invalid credentials
// Example: Missing API key, invalid API key, expired key

// 403 Forbidden - Authenticated but not authorized for this resource
// Example: Trying to access another user's data

// 404 Not Found - Resource doesn't exist
// Example: Feed ID doesn't exist, entry not found

// 429 Too Many Requests - Rate limit exceeded
// Example: More than 100 requests/minute (always include Retry-After header)

// 500 Internal Server Error - Server-side failure
// Example: Database connection failed, unexpected exception
// NEVER expose internal details in 500 errors
```

### Usage in API Route
```typescript
// File: src/routes/api/v1/entries/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import {
  badRequest,
  serverError,
  paginatedResponse
} from '$lib/server/api-response';
import {
  parsePaginationParams,
  decodeCursor,
  buildPaginationMeta,
  type EntryCursorData
} from '$lib/server/pagination';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { userId } = locals.apiUser!;
  const { cursor, limit } = parsePaginationParams(url);

  // Build query
  let query = supabaseAdmin
    .from('entries')
    .select(`
      id,
      title,
      url,
      published_at,
      feed_id
    `)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // +1 to detect has_more

  // Apply cursor filter
  if (cursor) {
    const cursorData = decodeCursor(cursor);
    if (!cursorData) {
      return badRequest('Invalid cursor format', 'INVALID_CURSOR');
    }

    // Multi-column keyset comparison
    query = query.or(
      `published_at.lt.${cursorData.p},` +
      `and(published_at.eq.${cursorData.p},id.lt.${cursorData.i})`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error('Entries query error:', error);
    return serverError();
  }

  // Build response with pagination
  const { items, meta } = buildPaginationMeta(
    data || [],
    limit,
    (item) => ({ p: item.published_at, i: item.id })
  );

  return paginatedResponse(items, meta);
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination | Cursor/keyset pagination | Industry shift ~2020 | O(1) vs O(n) at depth |
| Ad-hoc error formats | RFC 9457 / Problem Details | RFC 9457 (2023) | Standardized, machine-readable |
| Visible cursor values | Opaque Base64 cursors | Industry practice | Prevents client tampering |
| `error()` for APIs | Direct Response | N/A (SvelteKit design) | JSON instead of HTML |

**Deprecated/outdated:**
- Offset-based pagination for large datasets
- Numeric page numbers (page=5)
- Non-standard error formats

## Open Questions

Things that couldn't be fully resolved:

1. **Cursor expiration**
   - What we know: Cursors encode data positions; if data changes, cursor may point to wrong position
   - What's unclear: Whether to add timestamp validation to cursors
   - Recommendation: For read-only API on immutable entries, cursors remain valid. Monitor for issues.

2. **Compound cursor encoding format**
   - What we know: Using `{p, i}` shorthand saves bytes in Base64
   - What's unclear: Whether to use full field names for clarity
   - Recommendation: Use short keys since cursors are opaque; saves bandwidth

3. **Backward pagination (prev_cursor)**
   - What we know: Some APIs support bidirectional pagination
   - What's unclear: Whether this API needs it
   - Recommendation: Start with forward-only; add backward if users request it

## Sources

### Primary (HIGH confidence)
- [SvelteKit Errors Documentation](https://svelte.dev/docs/kit/errors) - Expected vs unexpected errors, error() behavior
- [SvelteKit @sveltejs/kit](https://svelte.dev/docs/kit/@sveltejs-kit) - json(), error(), Response helpers
- [Supabase Agent Skills - Data Pagination](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-pagination.md) - Cursor pagination best practices
- [Supabase Discussion #3938](https://github.com/orgs/supabase/discussions/3938) - Cursor-based pagination implementation

### Secondary (MEDIUM confidence)
- [Speakeasy API Design - Errors](https://www.speakeasy.com/api-design/errors) - RFC 9457 format, status code usage
- [Speakeasy API Design - Pagination](https://www.speakeasy.com/api-design/pagination) - Cursor encoding best practices
- [GraphQL Pagination Guide](https://graphql.org/learn/pagination/) - Opaque cursor patterns
- [Slack Engineering - API Pagination](https://slack.engineering/evolving-api-pagination-at-slack/) - Real-world cursor implementation

### Tertiary (LOW confidence)
- Web search results for "REST API error format 2026" - Confirmed RFC 9457 as current standard

## Metadata

**Confidence breakdown:**
- Error format: HIGH - RFC 9457 is the current standard, simplified for our use case
- HTTP status codes: HIGH - Well-established REST conventions
- Cursor pagination: HIGH - Supabase documentation + industry best practices
- Implementation patterns: HIGH - Based on existing Phase 2 patterns + official docs

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain)
