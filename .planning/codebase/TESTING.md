# Testing Patterns

**Analysis Date:** 2026-02-04

## Test Framework

**Framework Status:** Not detected

**Runner:** Not configured
- No `jest.config.ts`, `vitest.config.ts`, or similar test config files found
- No test dependencies in `package.json` (no `jest`, `vitest`, `@testing-library`, etc.)
- No test scripts in `package.json` (only `dev`, `build`, `preview`, `check`, `check:watch`)

**Type Checking:** Svelte Check + TypeScript
- Run: `npm run check` - One-time type checking via `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`
- Run: `npm run check:watch` - Watch mode type checking

## Test File Organization

**Location:** Not applicable (no test files found)

**Naming:** Not applicable

**Structure:** Not applicable

## Current Testing Approach

**Type Safety as Primary Verification:**
- TypeScript strict mode enabled: `"strict": true` in `tsconfig.json`
- Full type checking on Svelte components via `svelte-check`
- Component props typed with `Props` interfaces
- Database types auto-generated from Supabase schema in `src/lib/types/database.ts`

**No Unit/Integration/E2E Tests:**
- Zero test files: `find . -name "*.test.*" -o -name "*.spec.*"` returns no matches
- No testing framework installed
- No CI/CD pipeline with test stages observed

## Type-Driven Development Pattern

**Database Types:**
```typescript
// src/lib/types/database.ts - Auto-generated from Supabase
type TimelineEntry = Database['public']['Functions']['get_user_timeline']['Returns'][0];
```

**Component Props:**
```typescript
interface Props {
  entry: Entry;
  onToggleStar: (entryId: string) => void;
  isSelected?: boolean;
}

let { entry, onToggleStar, isSelected = false }: Props = $props();
```

**Store Types:**
```typescript
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface SidebarState {
  feeds: FeedWithUnread[];
  totalUnread: number;
  isLoading: boolean;
  lastLoadedAt: number | null;
}
```

**RPC Return Types:**
```typescript
// Full type safety for database function returns
type ChatMessage = Tables<"chat_messages">;

const { data, error } = await supabase.rpc('get_ai_context', params);
const results = (data || []) as AIContextEntry[];
```

## Error Handling in Components

**Async Data Loading Pattern:**
```typescript
async function loadData() {
  const currentUser = get(user);
  if (!currentUser) return;

  update(s => ({ ...s, isLoading: true }));

  const { data, error } = await supabase
    .from('table')
    .select('...')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Error loading data:', error);
    update(s => ({ ...s, isLoading: false }));
    return;
  }

  // Process data
  update(s => ({ ...s, data, isLoading: false }));
}
```

**Silent Fallback Pattern:**
```typescript
function getTimeAgo(dateString: string) {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return "";  // Fallback to empty string on parse error
  }
}
```

**Duplicate Key Handling:**
```typescript
if (error.code === '23505') {  // PostgreSQL unique violation
  throw new Error(`A collection named "${name}" already exists`);
}
```

## Reactive Testing (Type System)

**Svelte 5 Runes Enable Compile-Time Verification:**
```svelte
let count = $state(0);
const double = $derived(count * 2);  // Type of double inferred from count

$effect(() => {
  // Reactive effects tested by TypeScript
  console.log('Count changed to', count);
});
```

**Derived Store Composition:**
```typescript
// screenSize.ts - Derived stores enable reactive testing
export const isMobile = derived(screenWidth, ($width) => $width < BREAKPOINTS.md);
export const useDesktopLayout = derived(
  [screenWidth, isLandscape],
  ([$width, $isLandscape]) => {
    if ($width >= BREAKPOINTS.lg) return true;
    if ($width >= BREAKPOINTS.md && $isLandscape) return true;
    return false;
  }
);

// Component usage verifies reactive logic
const isDesktopMode = $derived($useDesktopLayout);
```

## Data Fetching Verification Pattern

**Pagination Testing via Pagination Logic:**
```typescript
// AIChat.svelte - Pagination with type verification
const PAGE_SIZE = 1000;

async function fetchAllPaginated<T>(
  rpcName: 'get_ai_context' | 'get_collection_ai_context',
  params: Record<string, unknown>
): Promise<T[]> {
  let allResults: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.rpc(rpcName, {
      ...params,
      result_limit: PAGE_SIZE,
      result_offset: offset
    } as any);

    if (error) {
      console.error(`Error fetching from ${rpcName}:`, error);
      break;
    }

    const results = (data || []) as T[];
    allResults = [...allResults, ...results];

    if (results.length < PAGE_SIZE) {
      hasMore = false;
    }

    offset += PAGE_SIZE;
  }

  return allResults;
}
```

**Type-Safe Filtering:**
```typescript
// Filtering logic with type safety ensures correctness
const filteredEntries = $derived(() => entries);

// Filter application happens at server query level
const { data: timelineData, error: timelineError } = await supabase
  .rpc('get_user_timeline', {
    user_id: currentUser.id,
    filter: filter,
    search_query: searchQuery,
    exclude_feed_ids: Array.from(excludedFeedIds),
    exclude_categories: Array.from(excludedCategories)
  })
  .range(offset, offset + limit - 1);
```

## Component Integration Points

**Event Handler Testing via Type System:**
```svelte
<script lang="ts">
  function handleClick() {
    if (!entry.is_read) {
      onMarkRead(entry.entry_id);
    }
    onClick(entry);
  }

  function handleStarClick(e: MouseEvent) {
    e.stopPropagation();
    onToggleStar(entry.entry_id);
  }
</script>
```

**Props and Callback Type Verification:**
```typescript
interface Props {
  entry: Entry;
  onToggleStar: (entryId: string) => void;  // Type-checked callback
  onMarkRead: (entryId: string) => void;
  onClick: (entry: Entry) => void;
}
```

## Store Testing Patterns

**Toast Store Mock Testing via Type System:**
```typescript
// src/lib/stores/toast.ts
function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function add(message: string, type: Toast['type'] = 'info', duration = 4000) {
    // Type ensures only valid toast types passed
    const toast: Toast = { id: crypto.randomUUID(), message, type, duration };
    update((toasts) => [...toasts, toast]);
  }

  return { subscribe, add, remove, success, error, warning, info };
}
```

**Sidebar Store State Management:**
```typescript
// State shape verified by type system
interface SidebarState {
  feeds: FeedWithUnread[];
  totalUnread: number;
  isLoading: boolean;
  lastLoadedAt: number | null;
  isCollapsed: boolean;
  collapsedLoaded: boolean;
}

// Operations are type-checked
async function loadFeeds(forceReload = false) {
  // Type inference ensures correct state shape
  update(s => ({ ...s, isLoading: true }));
}
```

## Known Testing Gaps

**Areas Without Test Coverage:**
- `src/lib/services/supabase.ts` - Client configuration
- `src/lib/stores/auth.ts` - Authentication flows (signUp, signIn, password recovery)
- `src/lib/stores/sidebar.ts` - Feed loading and refresh logic
- `src/lib/stores/collections.ts` - Collection CRUD operations
- `src/lib/components/AIChat.svelte` - AI integration and message handling
- `src/routes/timeline/[filter]/+page.svelte` - Timeline filtering and pagination
- `src/routes/discover/+page.svelte` - Feed discovery
- Image error handling and fallback logic in components

**Recommendation for Testing:**
If testing framework is added, prioritize:
1. Authentication store functions - critical user path
2. Data loading functions with error handling - risk of silent failures
3. Component interactions - StarClick, MarkRead, navigation
4. Store state management - sidebar collapse, filters, selections

## Development Commands

```bash
# Type checking (no runtime tests)
npm run check              # One-time check
npm run check:watch        # Watch mode

# Type checking looks for:
# - Svelte component prop type mismatches
# - TypeScript compilation errors
# - Missing types from database schema
# - Unused variables (via strict mode)
```

## Notes on Testing Philosophy

The codebase relies entirely on **TypeScript's type system** as the primary verification mechanism:
- No runtime tests
- Type safety at compile time via `svelte-check`
- Props and return values enforced by interfaces
- Database operations validated against generated types
- Reactive logic verified by rune compilation

This is appropriate for a small, actively-developed product but introduces risk for:
- Silent failures in async operations (no error boundary tests)
- Complex filtering/pagination logic (no integration tests)
- Auth flow edge cases (no scenario tests)
- Component interaction sequences (no E2E tests)

---

*Testing analysis: 2026-02-04*
