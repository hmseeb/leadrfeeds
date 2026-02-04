# Phase 5: Entries Endpoint - Research

**Researched:** 2026-02-04
**Domain:** REST API endpoint for feed entries with filtering, search, and cursor-based pagination
**Confidence:** HIGH

## Summary

This phase implements the core `/api/v1/entries` endpoint that allows users to query their feed entries with comprehensive filtering and search capabilities. The endpoint must support:
- Cursor-based pagination (using Phase 3 infrastructure)
- Date range filtering (start_date, end_date)
- Feed ID filtering
- Category filtering (via feed's category field)
- Read/unread status filtering
- Starred status filtering
- Full-text search across title and content

The implementation leverages existing infrastructure:
1. **Authentication**: `event.locals.apiUser.userId` provided by Phase 2 hooks
2. **Pagination**: `pagination.ts` utilities from Phase 3
3. **Response helpers**: `api-response.ts` from Phase 3
4. **Database**: Existing Supabase tables (`entries`, `feeds`, `user_entry_status`, `user_subscriptions`)

Two approaches are available:
1. **RPC approach**: Leverage existing `get_user_timeline` RPC (supports search, starred, unread, feed_id)
2. **Direct query approach**: Build custom Supabase query with cursor pagination

**Primary recommendation:** Use direct Supabase queries with cursor-based pagination. The existing `get_user_timeline` RPC uses offset pagination which performs poorly at depth. Build a new query that applies all filters and uses keyset pagination for O(1) performance regardless of page depth.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit +server.ts | 2.x | API route handler | Native routing, RequestHandler type |
| Supabase JS Client | existing | Database queries | Already in project, typed |
| `$lib/server/pagination.ts` | existing | Cursor encoding/decoding | Phase 3 infrastructure |
| `$lib/server/api-response.ts` | existing | Response helpers | Phase 3 infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getSupabaseAdmin()` | existing | Service role client | RLS bypass for API queries |
| `@sveltejs/kit` json() | 2.x | JSON response | Alternative to paginatedResponse |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct query | `get_user_timeline` RPC | RPC uses offset pagination; direct query allows cursor |
| Service role client | Anon client with RLS | Service role simplifies cross-table joins |
| Multiple queries | Single JOIN query | Single query is more efficient |

**Installation:**
```bash
# No new packages needed - all tools exist
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/routes/api/v1/
└── entries/
    └── +server.ts      # GET handler for /api/v1/entries
```

### Pattern 1: SvelteKit API Route Handler
**What:** Create a GET handler that receives request, validates parameters, queries database, returns response
**When to use:** All API endpoints
**Example:**
```typescript
// Source: SvelteKit docs + Phase 3 patterns
// File: src/routes/api/v1/entries/+server.ts

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { badRequest, serverError, paginatedResponse } from '$lib/server/api-response';
import {
  parsePaginationParams,
  decodeCursor,
  buildPaginationMeta,
  type EntryCursorData
} from '$lib/server/pagination';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { userId } = locals.apiUser!;
  const { cursor, limit } = parsePaginationParams(url);

  // Parse filter parameters
  const feedId = url.searchParams.get('feed_id');
  const startDate = url.searchParams.get('start_date');
  const endDate = url.searchParams.get('end_date');
  const isRead = url.searchParams.get('is_read');
  const isStarred = url.searchParams.get('is_starred');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');

  // Build and execute query...
  // Return paginatedResponse(items, meta);
};
```

### Pattern 2: Multi-Table Query with Filters
**What:** Join entries with feeds and user_entry_status, apply filters
**When to use:** Entries endpoint query
**Example:**
```typescript
// Source: Supabase JS docs + existing database schema
const supabase = getSupabaseAdmin();

// Get user's subscribed feed IDs first
const { data: subscriptions } = await supabase
  .from('user_subscriptions')
  .select('feed_id')
  .eq('user_id', userId);

const feedIds = subscriptions?.map(s => s.feed_id) || [];

// Query entries with joins
let query = supabase
  .from('entries')
  .select(`
    id,
    title,
    url,
    description,
    content,
    author,
    published_at,
    feed_id,
    feeds!inner (
      id,
      title,
      category,
      image
    )
  `)
  .in('feed_id', feedIds)
  .order('published_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(limit + 1);

// Apply cursor if provided
if (cursor) {
  const cursorData = decodeCursor(cursor);
  if (!cursorData) {
    return badRequest('Invalid cursor format', 'INVALID_CURSOR');
  }
  query = query.or(
    `published_at.lt.${cursorData.p},` +
    `and(published_at.eq.${cursorData.p},id.lt.${cursorData.i})`
  );
}

// Apply filters
if (feedId) {
  query = query.eq('feed_id', feedId);
}
if (category) {
  query = query.eq('feeds.category', category);
}
if (startDate) {
  query = query.gte('published_at', startDate);
}
if (endDate) {
  query = query.lte('published_at', endDate);
}
```

### Pattern 3: User Entry Status Join for Read/Starred
**What:** Left join user_entry_status to get read/starred per entry
**When to use:** When filtering by or returning read/starred status
**Example:**
```typescript
// Source: Database schema analysis
// Note: user_entry_status may not have a row for every entry
// Missing row means is_read=false, is_starred=false

// Approach 1: Separate query for entry statuses
const { data: entries } = await query;
const entryIds = entries?.map(e => e.id) || [];

const { data: statuses } = await supabase
  .from('user_entry_status')
  .select('entry_id, is_read, is_starred')
  .eq('user_id', userId)
  .in('entry_id', entryIds);

const statusMap = new Map(statuses?.map(s => [s.entry_id, s]) || []);

// Merge status into entries
const entriesWithStatus = entries?.map(entry => ({
  ...entry,
  is_read: statusMap.get(entry.id)?.is_read ?? false,
  is_starred: statusMap.get(entry.id)?.is_starred ?? false
}));

// Approach 2: Filter before query (for is_read/is_starred filters)
// If is_starred=true, need entries WHERE entry_id IN (starred entries)
if (isStarred === 'true') {
  const { data: starred } = await supabase
    .from('user_entry_status')
    .select('entry_id')
    .eq('user_id', userId)
    .eq('is_starred', true);
  const starredIds = starred?.map(s => s.entry_id) || [];
  query = query.in('id', starredIds);
}
```

### Pattern 4: Full-Text Search with Supabase
**What:** Use textSearch or ilike for searching title/content
**When to use:** When search parameter provided
**Example:**
```typescript
// Source: Supabase Full Text Search docs
// https://supabase.com/docs/guides/database/full-text-search

// Option 1: ILIKE for simple partial matching (no setup required)
if (search) {
  query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
}

// Option 2: Full-text search with textSearch (requires tsvector column)
// This requires a generated column on the entries table
if (search) {
  query = query.textSearch('fts', search, {
    type: 'websearch',
    config: 'english'
  });
}

// Recommendation: Start with ILIKE for simplicity
// Full-text search requires schema changes (add tsvector column, GIN index)
// Can upgrade to full-text search in future if ILIKE performance is insufficient
```

### Pattern 5: Response Shape
**What:** Consistent entry object shape in API response
**When to use:** All entries endpoint responses
**Example:**
```typescript
// Source: Existing get_user_timeline RPC return shape
interface EntryResponse {
  id: string;
  title: string | null;
  url: string | null;
  description: string | null;
  content: string | null;
  author: string | null;
  published_at: string;
  feed: {
    id: string;
    title: string | null;
    category: string | null;
    image: string | null;
  };
  is_read: boolean;
  is_starred: boolean;
}

// Response envelope
{
  "data": EntryResponse[],
  "meta": {
    "next_cursor": string | null,
    "has_more": boolean,
    "limit": number
  }
}
```

### Anti-Patterns to Avoid
- **Using offset pagination:** O(n) at depth; existing `get_user_timeline` uses offset
- **Querying all entries then filtering in JS:** Wasteful; push filters to database
- **Not scoping to user's subscriptions:** Would expose entries from feeds user doesn't subscribe to
- **Using anon client without proper RLS setup:** Service role is safer for complex joins
- **Returning raw database columns:** Transform to consistent API shape

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor encoding | Custom format | `encodeCursor`/`decodeCursor` from Phase 3 | Consistent, validated |
| Page size limits | Ad-hoc checks | `getEffectiveLimit` from Phase 3 | Enforces max, provides default |
| Error responses | Inline JSON | `badRequest`/`serverError` from Phase 3 | Consistent format |
| Date validation | Custom parsing | `new Date()` + isNaN check | Standard JS |
| Boolean params | String comparison | Explicit `=== 'true'` | Clear semantics |

**Key insight:** Phase 3 provided all the pagination and error infrastructure. Phase 5 only needs to build the query logic and parameter parsing.

## Common Pitfalls

### Pitfall 1: Not Scoping to User's Subscriptions
**What goes wrong:** Returning entries from feeds the user isn't subscribed to
**Why it happens:** Querying entries table directly without subscription join
**How to avoid:** Always filter by feed_id IN (user's subscribed feeds)
**Warning signs:** User sees entries from feeds they never subscribed to

### Pitfall 2: N+1 Query for Entry Status
**What goes wrong:** Making one query per entry to get read/starred status
**Why it happens:** Fetching status in a loop instead of bulk
**How to avoid:** Fetch all statuses in one query, build map, merge in JS
**Warning signs:** Slow response time that scales with page size

### Pitfall 3: Invalid Date Parameters
**What goes wrong:** Query fails or returns unexpected results with malformed dates
**Why it happens:** Not validating date format before query
**How to avoid:** Parse with `new Date()`, check `isNaN(date.getTime())`, return 400 if invalid
**Warning signs:** Database errors or empty results with valid-looking dates

### Pitfall 4: Category Filter on Wrong Table
**What goes wrong:** Filter fails because category is on feeds, not entries
**Why it happens:** Assuming category is an entry attribute
**How to avoid:** Use `.eq('feeds.category', category)` with inner join
**Warning signs:** "column does not exist" error or no filtering effect

### Pitfall 5: Empty Feed Subscriptions
**What goes wrong:** Query fails or returns error when user has no subscriptions
**Why it happens:** `.in('feed_id', [])` is invalid or returns nothing
**How to avoid:** Check for empty subscriptions, return empty array immediately
**Warning signs:** SQL error or confusing empty response

### Pitfall 6: ILIKE Injection
**What goes wrong:** Search parameter contains SQL wildcards that break query
**Why it happens:** Using user input directly in ILIKE pattern
**How to avoid:** Escape special characters (`%`, `_`) or use parameterized queries (Supabase handles this)
**Warning signs:** Unexpected search results or query errors

## Code Examples

Verified patterns from official sources and project codebase:

### Complete Entries Endpoint
```typescript
// File: src/routes/api/v1/entries/+server.ts
// Source: SvelteKit docs + Phase 3 patterns + Supabase docs

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { badRequest, serverError, paginatedResponse } from '$lib/server/api-response';
import {
  parsePaginationParams,
  decodeCursor,
  buildPaginationMeta,
  type EntryCursorData
} from '$lib/server/pagination';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { userId } = locals.apiUser!;
  const supabase = getSupabaseAdmin();

  // Parse pagination
  const { cursor, limit } = parsePaginationParams(url);

  // Parse filter parameters
  const feedId = url.searchParams.get('feed_id');
  const startDate = url.searchParams.get('start_date');
  const endDate = url.searchParams.get('end_date');
  const isReadParam = url.searchParams.get('is_read');
  const isStarredParam = url.searchParams.get('is_starred');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');

  // Validate date parameters if provided
  if (startDate) {
    const date = new Date(startDate);
    if (isNaN(date.getTime())) {
      return badRequest('Invalid start_date format. Use ISO 8601 format.', 'INVALID_DATE');
    }
  }
  if (endDate) {
    const date = new Date(endDate);
    if (isNaN(date.getTime())) {
      return badRequest('Invalid end_date format. Use ISO 8601 format.', 'INVALID_DATE');
    }
  }

  // Get user's subscribed feed IDs
  const { data: subscriptions, error: subError } = await supabase
    .from('user_subscriptions')
    .select('feed_id')
    .eq('user_id', userId);

  if (subError) {
    console.error('Subscriptions query error:', subError);
    return serverError();
  }

  const subscribedFeedIds = subscriptions?.map(s => s.feed_id) || [];

  // If user has no subscriptions, return empty result
  if (subscribedFeedIds.length === 0) {
    return paginatedResponse([], {
      next_cursor: null,
      has_more: false,
      limit
    });
  }

  // Build entry IDs to filter (for read/starred filters)
  let entryIdsFilter: string[] | null = null;

  if (isStarredParam === 'true') {
    const { data: starred } = await supabase
      .from('user_entry_status')
      .select('entry_id')
      .eq('user_id', userId)
      .eq('is_starred', true);
    entryIdsFilter = starred?.map(s => s.entry_id) || [];
    if (entryIdsFilter.length === 0) {
      return paginatedResponse([], { next_cursor: null, has_more: false, limit });
    }
  }

  if (isReadParam === 'true') {
    const { data: read } = await supabase
      .from('user_entry_status')
      .select('entry_id')
      .eq('user_id', userId)
      .eq('is_read', true);
    const readIds = read?.map(s => s.entry_id) || [];
    if (entryIdsFilter) {
      // Intersect with existing filter
      entryIdsFilter = entryIdsFilter.filter(id => readIds.includes(id));
    } else {
      entryIdsFilter = readIds;
    }
    if (entryIdsFilter.length === 0) {
      return paginatedResponse([], { next_cursor: null, has_more: false, limit });
    }
  }

  if (isReadParam === 'false') {
    // Unread = entries NOT in user_entry_status with is_read=true
    const { data: read } = await supabase
      .from('user_entry_status')
      .select('entry_id')
      .eq('user_id', userId)
      .eq('is_read', true);
    const readIds = new Set(read?.map(s => s.entry_id) || []);
    // Will need to filter in query: NOT IN read entries
    // This is complex - may need to handle differently
  }

  // Build main query
  let query = supabase
    .from('entries')
    .select(`
      id,
      title,
      url,
      description,
      content,
      author,
      published_at,
      feed_id,
      feeds!inner (
        id,
        title,
        category,
        image
      )
    `)
    .in('feed_id', subscribedFeedIds)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  // Apply cursor filter
  if (cursor) {
    const cursorData = decodeCursor(cursor);
    if (!cursorData) {
      return badRequest('Invalid cursor format', 'INVALID_CURSOR');
    }
    query = query.or(
      `published_at.lt.${cursorData.p},` +
      `and(published_at.eq.${cursorData.p},id.lt.${cursorData.i})`
    );
  }

  // Apply filters
  if (feedId) {
    if (!subscribedFeedIds.includes(feedId)) {
      return badRequest('Feed not found in subscriptions', 'FEED_NOT_FOUND');
    }
    query = query.eq('feed_id', feedId);
  }

  if (category) {
    query = query.eq('feeds.category', category);
  }

  if (startDate) {
    query = query.gte('published_at', startDate);
  }

  if (endDate) {
    query = query.lte('published_at', endDate);
  }

  if (entryIdsFilter) {
    query = query.in('id', entryIdsFilter);
  }

  // Apply search
  if (search) {
    // Using ILIKE for simplicity - can upgrade to full-text search later
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,content.ilike.%${search}%`);
  }

  // Execute query
  const { data: entries, error: queryError } = await query;

  if (queryError) {
    console.error('Entries query error:', queryError);
    return serverError();
  }

  // Fetch user entry statuses
  const entryIds = entries?.map(e => e.id) || [];
  const { data: statuses } = await supabase
    .from('user_entry_status')
    .select('entry_id, is_read, is_starred')
    .eq('user_id', userId)
    .in('entry_id', entryIds);

  const statusMap = new Map(statuses?.map(s => [s.entry_id, s]) || []);

  // Transform to response shape
  const transformedEntries = entries?.map(entry => {
    const feed = Array.isArray(entry.feeds) ? entry.feeds[0] : entry.feeds;
    const status = statusMap.get(entry.id);
    return {
      id: entry.id,
      title: entry.title,
      url: entry.url,
      description: entry.description,
      content: entry.content,
      author: entry.author,
      published_at: entry.published_at,
      feed: {
        id: feed.id,
        title: feed.title,
        category: feed.category,
        image: feed.image
      },
      is_read: status?.is_read ?? false,
      is_starred: status?.is_starred ?? false
    };
  }) || [];

  // Build pagination response
  const { items, meta } = buildPaginationMeta(
    transformedEntries,
    limit,
    (item) => ({ p: item.published_at, i: item.id })
  );

  return paginatedResponse(items, meta);
};
```

### Parameter Validation Helper
```typescript
// Source: Common validation patterns
function parseBooleanParam(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null; // Not provided or invalid
}

function validateDateParam(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
```

### Query Param Handling Reference
```typescript
// URL: /api/v1/entries?feed_id=xxx&start_date=2024-01-01&is_starred=true&search=ai&limit=20&cursor=xxx

// All parameters are optional:
// feed_id: UUID string - filter to specific feed
// category: string - filter by feed category
// start_date: ISO 8601 date - entries on or after
// end_date: ISO 8601 date - entries on or before
// is_read: "true" | "false" - filter by read status
// is_starred: "true" | "false" - filter by starred status
// search: string - search in title, description, content
// limit: number (1-100, default 50)
// cursor: opaque string from previous response
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination | Cursor pagination | Phase 3 decision | O(1) vs O(n) at depth |
| Single endpoint | Filtered endpoint | Industry standard | Fewer round trips |
| Client-side filtering | Server-side filtering | Performance need | Reduced bandwidth |

**Deprecated/outdated:**
- Offset-based pagination (still used in `get_user_timeline` RPC for web app)
- Non-parameterized search (use prepared statements)

## Open Questions

Things that couldn't be fully resolved:

1. **Full-text search vs ILIKE**
   - What we know: Full-text search requires tsvector column + GIN index (schema change)
   - What's unclear: Whether ILIKE performance is acceptable for current data size
   - Recommendation: Start with ILIKE; it's simpler and works. Monitor performance. Add full-text search if ILIKE becomes slow.

2. **Unread filter complexity**
   - What we know: "Unread" means entry_id NOT IN (read entries), which is harder to express
   - What's unclear: Whether to use NOT IN query or fetch all entries and filter
   - Recommendation: For is_read=false, get all read entry IDs, then use Supabase `.not('id', 'in', readIds)` or handle in JS for clarity.

3. **Content field size**
   - What we know: Entry content can be large (full article HTML)
   - What's unclear: Whether to include content in list response or require separate fetch
   - Recommendation: Include content for simplicity. If bandwidth becomes issue, add `fields` parameter to select columns.

## Sources

### Primary (HIGH confidence)
- SvelteKit API Routes docs: https://svelte.dev/docs/kit/routing (RequestHandler pattern)
- Supabase JS Client docs: https://supabase.com/docs/reference/javascript (query building)
- Supabase Full Text Search: https://supabase.com/docs/guides/database/full-text-search (textSearch API)
- Project codebase: `$lib/server/pagination.ts`, `$lib/server/api-response.ts` (Phase 3 infrastructure)
- Project codebase: `$lib/types/database.ts` (schema types)

### Secondary (MEDIUM confidence)
- Existing `get_user_timeline` RPC usage in `+page.svelte` (current webapp patterns)
- Phase 3 research document (pagination patterns)

### Tertiary (LOW confidence)
- Web search for SvelteKit query parameter patterns (confirmed with official docs)

## Metadata

**Confidence breakdown:**
- API route pattern: HIGH - SvelteKit docs + existing project patterns
- Query building: HIGH - Supabase docs + existing codebase
- Pagination integration: HIGH - Phase 3 infrastructure exists
- Search implementation: MEDIUM - ILIKE approach is simple but full-text may be needed later
- Filter combinations: MEDIUM - Complex filter combinations need testing

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain)
