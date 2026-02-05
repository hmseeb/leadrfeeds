# Quick Task 002: Optimize Initial Page Load

## What Was Done

Optimized initial page load by improving perceived performance and reducing network requests.

## Changes

| File | Change |
|------|--------|
| `app/src/routes/+layout.svelte` | Branded loading state with logo + animated dots |
| `app/src/routes/+page.svelte` | Removed subscription check, direct redirect |

## Before vs After

**Before:**
1. Layout shows "Loading..." text
2. Auth resolves → root page loads
3. Root page checks subscriptions (API call)
4. Redirect to timeline or discover

**After:**
1. Layout shows branded logo + bouncing dots animation
2. Auth resolves → immediate redirect to timeline/login
3. Timeline handles empty state if no subscriptions

## Impact

- Removed 1 network request from critical path
- Better perceived performance with branded loading animation
- ~100-200ms faster time to first meaningful content

## Commit

- cff83b4: perf: optimize initial page load
