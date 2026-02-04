# Phase 6: Feeds Endpoint - Research

**Researched:** 2026-02-04
**Domain:** REST API endpoint for user's subscribed feeds with metadata and unread counts
**Confidence:** HIGH

## Summary

This phase implements the `/api/v1/feeds` endpoint that returns a user's subscribed feeds with metadata and unread counts. This is a simpler endpoint than Phase 5 (entries) because:

1. **No pagination required** - Users typically have 10-100 feed subscriptions, not thousands
2. **Existing patterns to follow** - Phase 5 established the endpoint structure, response format, and infrastructure usage
3. **Existing RPC available** - `get_unread_counts` RPC already computes unread counts per feed

The implementation will:
1. Query `user_subscriptions` with feed join to get subscribed feeds
2. Call `get_unread_counts` RPC to get unread counts per feed
3. Merge data using Map for O(1) lookups
4. Return consistent response shape with `successResponse` (non-paginated)

**Primary recommendation:** Build a direct query endpoint following Phase 5 patterns. Use the existing `get_unread_counts` RPC for unread counts. Return a non-paginated response since feed lists are small.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit +server.ts | 2.x | API route handler | Native routing, RequestHandler type |
| Supabase JS Client | existing | Database queries | Already in project, typed |
| `$lib/server/api-response.ts` | existing | Response helpers | Phase 3 infrastructure |
| `$lib/server/supabase.ts` | existing | Service role client | RLS bypass for API queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `get_unread_counts` RPC | existing | Unread count per feed | Required for FEED-03 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct query + RPC | Single custom RPC | More flexible with direct query; RPC is already written for counts |
| `successResponse` | `paginatedResponse` | Feeds list is small; pagination adds unnecessary complexity |
| Two queries (subs + counts) | Single JOIN | Cleaner code; counts RPC is already optimized |

**Installation:**
```bash
# No new packages needed - all tools exist
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/routes/api/v1/
├── entries/
│   └── +server.ts      # GET /api/v1/entries (Phase 5)
└── feeds/
    └── +server.ts      # GET /api/v1/feeds (Phase 6)
```

### Pattern 1: Non-Paginated Feed List
**What:** Return all subscribed feeds in a single response without pagination
**When to use:** When data set is bounded and small (typical user has < 100 feeds)
**Example:**
```typescript
// Source: Phase 5 patterns + project codebase
// File: src/routes/api/v1/feeds/+server.ts

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.apiUser!.userId;
  const supabase = getSupabaseAdmin();

  // Query subscribed feeds with metadata
  const { data: subscriptions, error } = await supabase
    .from('user_subscriptions')
    .select(`
      feed_id,
      subscribed_at,
      feeds:feed_id (
        id,
        title,
        url,
        site_url,
        description,
        category,
        image
      )
    `)
    .eq('user_id', userId);

  if (error) {
    console.error('Feeds query error:', error);
    return serverError();
  }

  // Get unread counts via RPC
  const { data: unreadData } = await supabase.rpc('get_unread_counts', {
    user_id_param: userId
  });

  // Build response...
  return successResponse(feeds);
};
```

### Pattern 2: Subscription-First Query with Feed Join
**What:** Query user_subscriptions first, join feeds table for metadata
**When to use:** Any endpoint that needs user's feeds (established in Phase 5)
**Example:**
```typescript
// Source: Phase 5 entries endpoint + sidebar.ts store
const { data: subscriptions } = await supabase
  .from('user_subscriptions')
  .select(`
    feed_id,
    subscribed_at,
    feeds:feed_id (
      id,
      title,
      url,
      site_url,
      description,
      category,
      image
    )
  `)
  .eq('user_id', userId)
  .order('subscribed_at', { ascending: false });
```

### Pattern 3: Unread Count Merge via Map
**What:** Use Map for O(1) lookup when merging unread counts into feed objects
**When to use:** Merging data from two queries (established in Phase 5)
**Example:**
```typescript
// Source: sidebar.ts store pattern
const unreadMap = new Map(
  unreadData?.map((u: { feed_id: string; unread_count: number }) =>
    [u.feed_id, u.unread_count]
  ) || []
);

const feeds = subscriptions?.map(sub => {
  const feed = Array.isArray(sub.feeds) ? sub.feeds[0] : sub.feeds;
  return {
    id: feed.id,
    title: feed.title,
    url: feed.url,
    site_url: feed.site_url,
    description: feed.description,
    category: feed.category,
    image: feed.image,
    unread_count: unreadMap.get(feed.id) || 0,
    subscribed_at: sub.subscribed_at
  };
});
```

### Pattern 4: Supabase Feed Relation Handling
**What:** Handle Supabase returning feed relation as array or object
**When to use:** Any query with feed join (established in Phase 5)
**Example:**
```typescript
// Source: Phase 5 entries endpoint
// Supabase returns feed as object or array depending on relationship
const feed = Array.isArray(sub.feeds) ? sub.feeds[0] : sub.feeds;
```

### Pattern 5: Response Shape
**What:** Consistent feed object shape in API response
**When to use:** All feeds endpoint responses
**Example:**
```typescript
// Source: Requirements FEED-01, FEED-02, FEED-03
interface FeedResponse {
  id: string;
  title: string | null;
  url: string;
  site_url: string | null;
  description: string | null;
  category: string | null;
  image: string | null;
  unread_count: number;
  subscribed_at: string | null;
}

// Response envelope (non-paginated)
{
  "data": FeedResponse[]
}
```

### Anti-Patterns to Avoid
- **Adding pagination for small lists:** Feeds list is bounded; pagination adds complexity without benefit
- **N+1 query for unread counts:** Don't query count per feed; use `get_unread_counts` RPC
- **Filtering in JavaScript:** Push filters to database if any filtering is needed
- **Exposing database columns directly:** Transform to consistent API shape

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unread count calculation | Manual entry counting | `get_unread_counts` RPC | Already optimized, handles edge cases |
| Error responses | Inline JSON | `serverError`/`badRequest` | Consistent format from Phase 3 |
| Success responses | Manual Response() | `successResponse` | Consistent format from Phase 3 |
| Feed join handling | Custom logic | Array.isArray check | Established pattern in Phase 5 |

**Key insight:** The unread counts calculation is complex (involves user_entry_status, entries, subscriptions). The `get_unread_counts` RPC already handles this correctly. Never recalculate it manually.

## Common Pitfalls

### Pitfall 1: Calculating Unread Counts Manually
**What goes wrong:** Incorrect counts, performance issues, edge cases missed
**Why it happens:** Seems simple - just count entries without read status
**How to avoid:** Always use the `get_unread_counts` RPC which handles:
  - Entries in subscribed feeds only
  - user_entry_status table (missing row = unread)
  - Proper SQL aggregation
**Warning signs:** Counts don't match sidebar, slow queries

### Pitfall 2: Exposing Feed Relation as Array
**What goes wrong:** API returns inconsistent shape (array vs object)
**Why it happens:** Supabase join behavior varies based on relationship type
**How to avoid:** Always normalize with `Array.isArray(sub.feeds) ? sub.feeds[0] : sub.feeds`
**Warning signs:** TypeScript errors, client-side null checks failing

### Pitfall 3: Empty Subscriptions Handling
**What goes wrong:** Returning error or null instead of empty array
**Why it happens:** Not checking for zero subscriptions case
**How to avoid:** Return `successResponse([])` for users with no subscriptions
**Warning signs:** API errors for new users

### Pitfall 4: Missing Null Handling
**What goes wrong:** Returning undefined or missing fields
**Why it happens:** Database allows null for many feed fields
**How to avoid:** Always provide defaults or explicit null in response shape
**Warning signs:** Client-side "Cannot read property of undefined" errors

### Pitfall 5: Sorting Inconsistency
**What goes wrong:** Feeds returned in random order on each request
**Why it happens:** Not specifying ORDER BY
**How to avoid:** Always order by `subscribed_at DESC` (most recent first)
**Warning signs:** Feed list "jumps around" between API calls

## Code Examples

Verified patterns from official sources and project codebase:

### Complete Feeds Endpoint
```typescript
// File: src/routes/api/v1/feeds/+server.ts
// Source: Phase 5 patterns + sidebar.ts store + database.ts types

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  // Get userId from auth middleware (guaranteed to exist for /api/v1/* routes)
  const userId = locals.apiUser!.userId;

  const supabase = getSupabaseAdmin();

  // 1. Query user's subscribed feeds with metadata
  const { data: subscriptions, error: subError } = await supabase
    .from('user_subscriptions')
    .select(`
      feed_id,
      subscribed_at,
      feeds:feed_id (
        id,
        title,
        url,
        site_url,
        description,
        category,
        image
      )
    `)
    .eq('user_id', userId)
    .order('subscribed_at', { ascending: false });

  if (subError) {
    console.error('Feeds query error:', subError);
    return serverError();
  }

  // 2. Handle empty subscriptions
  if (!subscriptions || subscriptions.length === 0) {
    return successResponse([]);
  }

  // 3. Get unread counts via existing RPC
  const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
    user_id_param: userId
  });

  if (unreadError) {
    console.error('Unread counts query error:', unreadError);
    return serverError();
  }

  // 4. Build unread count map for O(1) lookup
  const unreadMap = new Map<string, number>(
    unreadData?.map((u: { feed_id: string; unread_count: number }) =>
      [u.feed_id, u.unread_count]
    ) || []
  );

  // 5. Transform to response shape
  const feeds = subscriptions
    .filter(sub => sub.feeds) // Filter out any broken relations
    .map(sub => {
      // Handle Supabase returning feed as array or object
      const feed = Array.isArray(sub.feeds) ? sub.feeds[0] : sub.feeds;

      return {
        id: feed.id,
        title: feed.title,
        url: feed.url,
        site_url: feed.site_url,
        description: feed.description,
        category: feed.category,
        image: feed.image,
        unread_count: unreadMap.get(feed.id) || 0,
        subscribed_at: sub.subscribed_at
      };
    });

  return successResponse(feeds);
};
```

### Response Shape TypeScript Interface
```typescript
// Source: Requirements FEED-01, FEED-02, FEED-03
interface FeedResponse {
  id: string;
  title: string | null;
  url: string;
  site_url: string | null;
  description: string | null;
  category: string | null;
  image: string | null;
  unread_count: number;
  subscribed_at: string | null;
}

// Full response envelope
interface FeedsApiResponse {
  data: FeedResponse[];
}
```

### RPC get_unread_counts Reference
```typescript
// Source: database.ts types
// Already exists in Supabase, returns:
// { feed_id: string; unread_count: number }[]

const { data } = await supabase.rpc('get_unread_counts', {
  user_id_param: userId  // Required parameter
});
// data: { feed_id: string; unread_count: number }[] | null
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual count queries | `get_unread_counts` RPC | Already in codebase | Optimized, single query |
| Paginated feed lists | Non-paginated | This phase | Simpler API for small data sets |

**Deprecated/outdated:**
- N+1 queries for counts (never do this)
- Offset pagination for small lists (unnecessary complexity)

## Open Questions

Things that couldn't be fully resolved:

1. **Should we include additional feed stats?**
   - What we know: Requirements only specify title, URL, category, unread_count
   - What's unclear: Whether `last_entry_at`, `subscriber_count` would be useful
   - Recommendation: Stick to requirements. Can add fields later if requested.

2. **Should we support filtering feeds by category?**
   - What we know: Not in requirements (FEED-01, FEED-02, FEED-03)
   - What's unclear: Whether filtering would be useful
   - Recommendation: Not for v1. Can add `?category=` filter later if needed.

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/src/routes/api/v1/entries/+server.ts` (Phase 5 patterns)
- Project codebase: `app/src/lib/stores/sidebar.ts` (feeds + unread counts query pattern)
- Project codebase: `app/src/lib/server/api-response.ts` (response helpers)
- Project codebase: `app/src/lib/types/database.ts` (RPC types, table schemas)

### Secondary (MEDIUM confidence)
- Phase 5 Research document (established patterns for API endpoints)

## Metadata

**Confidence breakdown:**
- API route pattern: HIGH - Established in Phase 5, same approach
- Query building: HIGH - Exact pattern exists in sidebar.ts store
- Unread counts: HIGH - RPC already exists and is typed
- Response shape: HIGH - Clear requirements, simple transformation

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, no external dependencies)
