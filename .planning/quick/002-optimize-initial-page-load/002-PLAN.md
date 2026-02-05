---
type: quick
task: 002
description: Optimize initial page load
---

# Quick Task 002: Optimize Initial Page Load

## Analysis

Current loading flow:
1. App loads → layout shows "Loading..." while `supabase.auth.getSession()` resolves
2. Root page (`/`) subscribes to loading, then checks subscriptions → another API call
3. Finally redirects to `/timeline/all` or `/discover`

This creates 2-3 sequential network requests before user sees content.

## Optimizations

### Task 1: Improve loading indicator in layout

Replace plain text "Loading..." with a branded loading state that includes the logo and spinner. This improves perceived performance.

**Files:** `app/src/routes/+layout.svelte`

**Changes:**
- Add logo and spinner animation to loading state
- Use CSS animation instead of just text

### Task 2: Optimize root page redirect logic

Streamline the root page to reduce perceived delay:
- Remove the subscription check on `/` - let timeline handle empty state
- Redirect logged-in users directly to `/timeline/all`
- This removes one network request from the critical path

**Files:** `app/src/routes/+page.svelte`

**Changes:**
- Remove subscription check
- Direct redirect: logged in → `/timeline/all`, logged out → `/auth/login`

## Success Criteria

- [x] Loading state shows logo + spinner (better perceived performance)
- [x] Root page redirects without extra API call
- [x] TypeScript compiles
