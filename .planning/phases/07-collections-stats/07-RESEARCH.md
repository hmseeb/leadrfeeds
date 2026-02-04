# Phase 7: Collections & Stats - Research

**Researched:** 2026-02-05
**Domain:** REST API endpoints for user collections and aggregate statistics
**Confidence:** HIGH

## Summary

This phase implements two endpoints: `/api/v1/collections` (COLL-01, COLL-02, COLL-03) and `/api/v1/stats` (STAT-01, STAT-02, STAT-03). The implementation is straightforward because:

1. **Existing database schema** - `feed_collections` and `collection_feeds` tables already exist with proper relationships
2. **Existing RPC** - `get_user_collections_with_counts` already returns collections with feed_count and unread_count
3. **Established patterns** - Phase 5/6 established endpoint patterns, response formats, and infrastructure usage
4. **Existing helpers** - `get_unread_counts` RPC can be leveraged for stats calculation

The collections endpoint will:
1. Use `get_user_collections_with_counts` RPC for collection list with counts
2. Query `collection_feeds` with feed join to get feeds within each collection
3. Return nested structure: collections containing their feeds

The stats endpoint will:
1. Reuse `get_unread_counts` RPC to calculate total unread (sum across feeds)
2. Query `user_entry_status` for total starred count
3. Build per-feed counts from existing data

For COLL-03 (filter entries by collection), the existing entries endpoint can be extended with a `collection_id` filter parameter.

**Primary recommendation:** Build two direct query endpoints following Phase 5/6 patterns. Leverage existing RPCs (`get_user_collections_with_counts`, `get_unread_counts`) rather than building new queries. Extend `/api/v1/entries` with `collection_id` filter for COLL-03.

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
| `get_user_collections_with_counts` RPC | existing | Collections with counts | COLL-01, COLL-02 partial |
| `get_unread_counts` RPC | existing | Unread counts per feed | STAT-01, STAT-03 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing RPCs | Custom queries | RPCs are already optimized for this exact use case |
| Nested feeds in collections response | Separate endpoint for collection feeds | Fewer API calls, simpler client code |
| Extend entries endpoint for COLL-03 | New collection-entries endpoint | Reuses existing pagination, filtering logic |

**Installation:**
```bash
# No new packages needed - all tools exist
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/routes/api/v1/
├── entries/
│   └── +server.ts      # GET /api/v1/entries (extend with collection_id filter)
├── feeds/
│   └── +server.ts      # GET /api/v1/feeds
├── collections/
│   └── +server.ts      # GET /api/v1/collections (NEW)
└── stats/
    └── +server.ts      # GET /api/v1/stats (NEW)
```

### Pattern 1: Collections with Nested Feeds
**What:** Return all collections with their feeds in a single response
**When to use:** For COLL-01 and COLL-02 - collections list must include feeds
**Example:**
```typescript
// File: src/routes/api/v1/collections/+server.ts
// Source: Phase 6 patterns + collections.ts store

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.apiUser!.userId;
  const supabase = getSupabaseAdmin();

  // 1. Get collections with counts via RPC
  const { data: collections, error: collError } = await supabase.rpc(
    'get_user_collections_with_counts',
    { user_id_param: userId }
  );

  if (collError) {
    console.error('Collections query error:', collError);
    return serverError();
  }

  // Handle no collections
  if (!collections || collections.length === 0) {
    return successResponse([]);
  }

  // 2. Get all collection IDs
  const collectionIds = collections.map(c => c.collection_id);

  // 3. Query collection_feeds with feed join for all collections at once
  const { data: collectionFeeds, error: cfError } = await supabase
    .from('collection_feeds')
    .select(`
      collection_id,
      feed_id,
      feeds:feed_id (
        id,
        title,
        url,
        site_url,
        image,
        category
      )
    `)
    .in('collection_id', collectionIds);

  if (cfError) {
    console.error('Collection feeds query error:', cfError);
    return serverError();
  }

  // 4. Build feeds map by collection_id
  const feedsByCollection = new Map<string, Array<{
    id: string;
    title: string | null;
    url: string;
    site_url: string | null;
    image: string | null;
    category: string | null;
  }>>();

  for (const cf of collectionFeeds || []) {
    if (!cf.feeds) continue;
    const feed = Array.isArray(cf.feeds) ? cf.feeds[0] : cf.feeds;

    if (!feedsByCollection.has(cf.collection_id)) {
      feedsByCollection.set(cf.collection_id, []);
    }
    feedsByCollection.get(cf.collection_id)!.push({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      site_url: feed.site_url,
      image: feed.image,
      category: feed.category
    });
  }

  // 5. Build response with nested feeds
  const result = collections.map(c => ({
    id: c.collection_id,
    name: c.collection_name,
    icon_name: c.icon_name,
    display_order: c.display_order,
    feed_count: c.feed_count,
    unread_count: c.unread_count,
    feeds: feedsByCollection.get(c.collection_id) || []
  }));

  return successResponse(result);
};
```

### Pattern 2: Aggregate Stats from Existing Data
**What:** Calculate aggregate statistics from existing RPCs and queries
**When to use:** For STAT-01, STAT-02, STAT-03 - aggregate user statistics
**Example:**
```typescript
// File: src/routes/api/v1/stats/+server.ts
// Source: sidebar.ts store pattern + Phase 6 patterns

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.apiUser!.userId;
  const supabase = getSupabaseAdmin();

  // 1. Get unread counts per feed via existing RPC
  const { data: unreadData, error: unreadError } = await supabase.rpc(
    'get_unread_counts',
    { user_id_param: userId }
  );

  if (unreadError) {
    console.error('Unread counts error:', unreadError);
    return serverError();
  }

  // 2. Calculate total unread from per-feed counts
  const totalUnread = (unreadData || []).reduce(
    (sum: number, u: { unread_count: number }) => sum + u.unread_count,
    0
  );

  // 3. Get total starred count
  const { count: totalStarred, error: starredError } = await supabase
    .from('user_entry_status')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_starred', true);

  if (starredError) {
    console.error('Starred count error:', starredError);
    return serverError();
  }

  // 4. Build per-feed stats
  const feedStats = (unreadData || []).map((u: { feed_id: string; unread_count: number }) => ({
    feed_id: u.feed_id,
    unread_count: u.unread_count
  }));

  return successResponse({
    total_unread: totalUnread,
    total_starred: totalStarred || 0,
    feeds: feedStats
  });
};
```

### Pattern 3: Extend Entries Endpoint with Collection Filter
**What:** Add `collection_id` parameter to existing entries endpoint for COLL-03
**When to use:** Filtering entries by collection
**Example:**
```typescript
// In src/routes/api/v1/entries/+server.ts (extend existing)
// Source: collections.ts store getCollectionFeeds pattern

// Parse collection_id parameter
const collectionId = url.searchParams.get('collection_id');

// If collection_id provided, get feed IDs in that collection
let collectionFeedIds: string[] | null = null;

if (collectionId) {
  // Verify collection belongs to user
  const { data: collection, error: collError } = await supabase
    .from('feed_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (collError || !collection) {
    return badRequest('Collection not found', 'COLLECTION_NOT_FOUND');
  }

  // Get feed IDs in this collection
  const { data: collFeeds, error: cfError } = await supabase
    .from('collection_feeds')
    .select('feed_id')
    .eq('collection_id', collectionId);

  if (cfError) {
    console.error('Collection feeds error:', cfError);
    return serverError();
  }

  collectionFeedIds = collFeeds?.map(cf => cf.feed_id) || [];

  // If collection is empty, return empty result
  if (collectionFeedIds.length === 0) {
    return paginatedResponse([], { next_cursor: null, has_more: false, limit });
  }
}

// Later in query building, intersect with subscribed feeds
// If collectionFeedIds is set, filter subscribedFeedIds
if (collectionFeedIds !== null) {
  const collectionSet = new Set(collectionFeedIds);
  subscribedFeedIds = subscribedFeedIds.filter(id => collectionSet.has(id));
}
```

### Pattern 4: Response Shapes
**What:** Consistent API response structures
**When to use:** All endpoints in this phase

**Collections Response (COLL-01, COLL-02):**
```typescript
interface CollectionResponse {
  id: string;
  name: string;
  icon_name: string;
  display_order: number;
  feed_count: number;
  unread_count: number;
  feeds: Array<{
    id: string;
    title: string | null;
    url: string;
    site_url: string | null;
    image: string | null;
    category: string | null;
  }>;
}

// Full response envelope
{ "data": CollectionResponse[] }
```

**Stats Response (STAT-01, STAT-02, STAT-03):**
```typescript
interface StatsResponse {
  total_unread: number;
  total_starred: number;
  feeds: Array<{
    feed_id: string;
    unread_count: number;
  }>;
}

// Full response envelope
{ "data": StatsResponse }
```

### Anti-Patterns to Avoid
- **N+1 queries for collection feeds:** Don't query feeds per collection; batch query all feeds for all collections
- **Recalculating unread counts:** Don't count entries manually; use `get_unread_counts` RPC
- **Separate starred count per feed:** Not in requirements; only total starred is needed (STAT-02)
- **New RPC for stats:** Existing RPCs cover the use case; no need for new database functions

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collection list with counts | Manual query + count | `get_user_collections_with_counts` RPC | Already optimized, handles joins |
| Unread count per feed | Manual entry counting | `get_unread_counts` RPC | Handles edge cases, user_entry_status |
| Total unread | COUNT query | Sum from `get_unread_counts` | Data already fetched for STAT-03 |
| Collection feed filtering | Manual feed ID lookup | Query collection_feeds table | Simple join, already indexed |

**Key insight:** The existing RPCs (`get_user_collections_with_counts`, `get_unread_counts`) handle the complex aggregation logic. The API endpoints only need to transform and combine their outputs.

## Common Pitfalls

### Pitfall 1: Querying Feeds Per Collection (N+1)
**What goes wrong:** Slow response times, database overload
**Why it happens:** Intuitive to loop through collections and query feeds for each
**How to avoid:** Query all collection_feeds in one batch, then group by collection_id using a Map
**Warning signs:** Response time scales linearly with number of collections

### Pitfall 2: Not Validating Collection Ownership
**What goes wrong:** User can filter entries by another user's collection
**Why it happens:** Forgetting that collection_id is user-provided
**How to avoid:** Always verify `feed_collections.user_id = userId` before using collection
**Warning signs:** Security audit flags, data leakage

### Pitfall 3: Empty Collection Handling
**What goes wrong:** Errors or inconsistent responses for empty collections
**Why it happens:** Not handling the case where collection has no feeds
**How to avoid:** Return `feeds: []` for collections with no feeds, not null or error
**Warning signs:** Client errors on empty collections

### Pitfall 4: Double-Counting Unread
**What goes wrong:** Total unread doesn't match sum of per-feed counts
**Why it happens:** Using different methods to calculate total vs per-feed
**How to avoid:** Always derive total from the same source as per-feed (sum of RPC results)
**Warning signs:** UI shows inconsistent totals

### Pitfall 5: Supabase Feed Relation as Array
**What goes wrong:** Type errors when accessing feed properties
**Why it happens:** Supabase join returns array or object depending on relationship
**How to avoid:** Always normalize with `Array.isArray(cf.feeds) ? cf.feeds[0] : cf.feeds`
**Warning signs:** TypeScript errors, undefined property access

### Pitfall 6: Collection-Feed Intersection Logic
**What goes wrong:** Entries appear that shouldn't (not subscribed) or are missing (not in collection)
**Why it happens:** Incorrect intersection of subscribed feeds and collection feeds
**How to avoid:** Collection feeds must be intersected with subscribed feeds (user may have unsubscribed from a feed that's still in collection)
**Warning signs:** Entries from unsubscribed feeds appearing

## Code Examples

Verified patterns from project codebase:

### Collections Endpoint Complete
```typescript
// File: src/routes/api/v1/collections/+server.ts
// Source: collections.ts store + Phase 6 patterns

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.apiUser!.userId;
  const supabase = getSupabaseAdmin();

  // 1. Get collections with counts via RPC
  const { data: collections, error: collError } = await supabase.rpc(
    'get_user_collections_with_counts',
    { user_id_param: userId }
  );

  if (collError) {
    console.error('Collections query error:', collError);
    return serverError();
  }

  if (!collections || collections.length === 0) {
    return successResponse([]);
  }

  // 2. Batch query all feeds for all collections
  const collectionIds = collections.map(
    (c: { collection_id: string }) => c.collection_id
  );

  const { data: collectionFeeds, error: cfError } = await supabase
    .from('collection_feeds')
    .select(`
      collection_id,
      feeds:feed_id (
        id,
        title,
        url,
        site_url,
        image,
        category
      )
    `)
    .in('collection_id', collectionIds);

  if (cfError) {
    console.error('Collection feeds query error:', cfError);
    return serverError();
  }

  // 3. Group feeds by collection
  const feedsByCollection = new Map<string, Array<{
    id: string;
    title: string | null;
    url: string;
    site_url: string | null;
    image: string | null;
    category: string | null;
  }>>();

  for (const cf of collectionFeeds || []) {
    if (!cf.feeds) continue;
    const feed = Array.isArray(cf.feeds) ? cf.feeds[0] : cf.feeds;

    if (!feedsByCollection.has(cf.collection_id)) {
      feedsByCollection.set(cf.collection_id, []);
    }
    feedsByCollection.get(cf.collection_id)!.push({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      site_url: feed.site_url,
      image: feed.image,
      category: feed.category
    });
  }

  // 4. Build response
  const result = collections.map((c: {
    collection_id: string;
    collection_name: string;
    icon_name: string;
    display_order: number;
    feed_count: number;
    unread_count: number;
  }) => ({
    id: c.collection_id,
    name: c.collection_name,
    icon_name: c.icon_name,
    display_order: c.display_order,
    feed_count: c.feed_count,
    unread_count: c.unread_count,
    feeds: feedsByCollection.get(c.collection_id) || []
  }));

  return successResponse(result);
};
```

### Stats Endpoint Complete
```typescript
// File: src/routes/api/v1/stats/+server.ts
// Source: sidebar.ts store + database.ts RPC types

import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { serverError, successResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.apiUser!.userId;
  const supabase = getSupabaseAdmin();

  // 1. Get unread counts per feed
  const { data: unreadData, error: unreadError } = await supabase.rpc(
    'get_unread_counts',
    { user_id_param: userId }
  );

  if (unreadError) {
    console.error('Unread counts error:', unreadError);
    return serverError();
  }

  // 2. Calculate total unread
  const totalUnread = (unreadData || []).reduce(
    (sum: number, u: { unread_count: number }) => sum + u.unread_count,
    0
  );

  // 3. Get total starred count
  const { count: totalStarred, error: starredError } = await supabase
    .from('user_entry_status')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_starred', true);

  if (starredError) {
    console.error('Starred count error:', starredError);
    return serverError();
  }

  // 4. Build per-feed stats
  const feedStats = (unreadData || []).map(
    (u: { feed_id: string; unread_count: number }) => ({
      feed_id: u.feed_id,
      unread_count: u.unread_count
    })
  );

  return successResponse({
    total_unread: totalUnread,
    total_starred: totalStarred || 0,
    feeds: feedStats
  });
};
```

### Entries Endpoint Collection Filter Extension
```typescript
// Add to src/routes/api/v1/entries/+server.ts
// Insert after feedId parsing, before subscription query

// Parse collection_id filter
const collectionId = url.searchParams.get('collection_id');

// ... after getting subscribedFeedIds ...

// If collection_id provided, intersect with collection feeds
if (collectionId) {
  // Verify collection belongs to user
  const { data: collection, error: collError } = await supabase
    .from('feed_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (collError || !collection) {
    return badRequest('Collection not found', 'COLLECTION_NOT_FOUND');
  }

  // Get feed IDs in collection
  const { data: collFeeds, error: cfError } = await supabase
    .from('collection_feeds')
    .select('feed_id')
    .eq('collection_id', collectionId);

  if (cfError) {
    console.error('Collection feeds error:', cfError);
    return serverError();
  }

  const collectionFeedIds = collFeeds?.map(cf => cf.feed_id) || [];

  // Empty collection = empty result
  if (collectionFeedIds.length === 0) {
    return paginatedResponse([], { next_cursor: null, has_more: false, limit });
  }

  // Intersect with subscribed feeds
  const collectionSet = new Set(collectionFeedIds);
  subscribedFeedIds = subscribedFeedIds.filter(id => collectionSet.has(id));

  // If no overlap, empty result
  if (subscribedFeedIds.length === 0) {
    return paginatedResponse([], { next_cursor: null, has_more: false, limit });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual count queries | `get_unread_counts` RPC | Already in codebase | Optimized aggregation |
| Separate collection queries | `get_user_collections_with_counts` RPC | Already in codebase | Single query for counts |
| Per-collection feed queries | Batch query with Map grouping | This phase | Avoids N+1 |

**Deprecated/outdated:**
- N+1 queries for feeds per collection (never do this)
- Manual unread counting (use RPC)

## Open Questions

Things that couldn't be fully resolved:

1. **Should stats include starred count per feed?**
   - What we know: Requirements (STAT-03) only specify unread count per feed
   - What's unclear: Whether starred per feed would be useful
   - Recommendation: Stick to requirements. Only include unread_count in per-feed stats. Can add starred_count later if requested.

2. **Should collection_id filter work with other filters?**
   - What we know: Requirements say "entries can be filtered by collection"
   - What's unclear: Interaction with feed_id filter (if both provided, which takes precedence?)
   - Recommendation: Allow combination - collection_id narrows to collection feeds, feed_id further narrows within that. If feed_id is not in collection, return empty.

3. **Collection ordering in response**
   - What we know: RPC returns collections, has display_order field
   - What's unclear: Whether we need to explicitly order
   - Recommendation: RPC may already order by display_order. Verify during implementation; add .order() if needed.

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/src/lib/types/database.ts` - RPC types, table schemas
- Project codebase: `app/src/lib/stores/collections.ts` - Collection query patterns
- Project codebase: `app/src/lib/stores/sidebar.ts` - Unread count aggregation pattern
- Project codebase: `app/src/routes/api/v1/entries/+server.ts` - Existing endpoint patterns
- Project codebase: `app/src/routes/api/v1/feeds/+server.ts` - Non-paginated endpoint pattern
- Phase 6 RESEARCH.md - Established API patterns

### Secondary (MEDIUM confidence)
- None - All patterns derived from existing codebase

### Tertiary (LOW confidence)
- None - No external sources needed

## Metadata

**Confidence breakdown:**
- Collections endpoint: HIGH - Uses existing RPC, follows established patterns
- Stats endpoint: HIGH - Reuses existing RPC, simple aggregation
- Collection filter: HIGH - Clear pattern from collections.ts store
- Response shapes: HIGH - Defined by requirements, follows existing conventions

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable domain, no external dependencies)
