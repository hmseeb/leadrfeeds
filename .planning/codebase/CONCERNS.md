# Codebase Concerns

**Analysis Date:** 2026-02-04

## Tech Debt

**Authentication Store Missing Error Handling:**
- Issue: `lib/stores/auth.ts` returns `{ data, error }` but consuming code rarely checks error state before proceeding
- Files: `app/src/lib/stores/auth.ts`, `app/src/routes/auth/login/+page.svelte`, `app/src/routes/auth/register/+page.svelte`
- Impact: Auth failures fail silently. Users see no feedback when signup/signin fails due to network issues, invalid credentials, or quota limits
- Fix approach: Add explicit error checks in all auth function callers. Implement consistent error toast notifications for all auth endpoints

**Database Types Out of Sync:**
- Issue: `lib/types/database.ts` is auto-generated but documented to have missing tables/functions: `feed_suggestions`, `feed_waitlist`, and RPC functions `get_pending_suggestions_count`, `get_suggestion_feed_status`
- Files: `app/src/lib/types/database.ts`
- Impact: Code using these features (like `discover/suggestions`) may have incomplete type safety. Properties accessed at runtime may fail type checking
- Fix approach: Regenerate types using Supabase CLI: `supabase gen types typescript`. Add this to CI/CD pipeline to prevent future drift

**Collections Store Inefficient Refresh Pattern:**
- Issue: `lib/stores/collections.ts` triggers full `loadCollections(true)` reload after every feed add/remove operation
- Files: `app/src/lib/stores/collections.ts` lines 184-186, 204-206
- Impact: Multiple sequential operations (adding 3 feeds to a collection) trigger 3 full RPC calls instead of batching. Poor performance for users managing multiple feeds
- Fix approach: Implement optimistic local state updates, batch RPC calls, or add debouncing for collection mutations

## Known Bugs

**Svelte 5 Component Rendering Deprecation:**
- Symptoms: Compiler warnings about `<svelte:component>` in runes mode
- Files: `app/src/lib/components/AIChat.svelte` lines 1479, 1593
- Trigger: Any render of AIChat component with dynamic command icons
- Workaround: Currently suppressed by compiler but works as intended. Will break in Svelte 6
- Impact: Minor - functionality works but code is non-idiomatic for Svelte 5 runes

**Filter Preferences May Persist Incorrectly:**
- Issue: In `timeline/[filter]/+page.svelte`, `excludedFeedIds` and `excludedCategories` are mutated directly via `.delete()` and `.add()`, then reassigned to trigger reactivity
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 143-149, 154-160
- Trigger: User toggling feed/category filters on timeline
- Impact: Race condition possible if filters load slowly - user's manual changes could be overwritten. Sets are reassigned but mutations could be lost in edge cases
- Fix approach: Use immutable state updates: `excludedFeedIds = new Set([...excludedFeedIds, feedId])` consistently

**Race Condition in Search with Pagination:**
- Issue: `timeline/[filter]/+page.svelte` has `searchInProgress` flag but doesn't prevent overlapping requests when user rapidly changes search query and scrolls
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 65-70
- Impact: Results may arrive out of order, displaying stale entries. "Load more" button could fetch wrong page if search completes between offset calculations
- Fix approach: Add request cancellation (AbortController) and timestamp-based result ordering

## Security Considerations

**API Keys in Public Environment:**
- Risk: `.env.example` exposes the actual Supabase URL (not masked): `https://zhcshvmklmuuqngshcdv.supabase.co`
- Files: `app/.env.example`
- Current mitigation: This is the public, non-secret part of Supabase credentials. Anon key is masked as placeholder
- Recommendations: No change needed - Supabase URL is intended to be public. Ensure `PUBLIC_SUPABASE_ANON_KEY` never contains production secret key

**Unvalidated HTML in AI Chat Output:**
- Risk: `AIChat.svelte` uses `marked` library to parse markdown from AI responses and renders as HTML
- Files: `app/src/lib/components/AIChat.svelte` lines 8-16
- Current mitigation: `marked` escapes by default. Links are rendered with `target="_blank" rel="noopener noreferrer"`. No eval or raw script injection
- Recommendations: Confirm `marked` version is current (17.0.0). Add Content Security Policy header to block inline scripts. Audit if AI responses could contain malicious markdown

**User API Keys Stored in Database:**
- Risk: OpenRouter API keys stored in `user_settings.openrouter_api_key` column as plaintext
- Files: `app/src/lib/types/database.ts` line 284, consumed by `AIChat.svelte`
- Current mitigation: Stored server-side in Supabase with RLS (only user can read own settings)
- Recommendations: Encrypt API keys at rest using Supabase pgcrypto extension. Implement key rotation mechanism. Add audit logging for key access

**Thumbnail Image Loading Without Validation:**
- Risk: `EntryCard.svelte` extracts image URLs from HTML and loads them via `<img src=>`
- Files: `app/src/lib/components/EntryCard.svelte` lines 45-68
- Current mitigation: Checks for pixel/tracking patterns. Has fallback for errors
- Recommendations: Validate URLs before loading (no `javascript:` protocol, domain whitelist). Add timeout for slow-loading images to prevent UI blocking

## Performance Bottlenecks

**AI Context Fetching with Pagination Overhead:**
- Problem: `AIChat.svelte` fetches AI context via `fetchAllPaginated()` with PAGE_SIZE=1000, making 2+ requests for large contexts
- Files: `app/src/lib/components/AIChat.svelte` lines 123-157
- Cause: PostgREST has 1000 row limit. For collections with 2000+ unread entries, requires N RPC calls
- Improvement path: Increase limit parameter on RPC functions to 5000-10000. Add caching with timestamp. Consider cursor-based pagination

**Timeline Search with Every Keystroke:**
- Problem: Search is debounced but still triggers full database query on every unique search term
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 61-70
- Cause: No client-side filtering or incremental search
- Improvement path: Cache search results per query. Implement trie-based incremental search. Add minimum query length (3 chars) before API call

**Collections Store Full Reload on Single Change:**
- Problem: Adding/removing one feed from a collection reloads entire collections list with counts
- Files: `app/src/lib/stores/collections.ts` lines 184-186, 204-206, 289
- Cause: No granular update capability in RPC
- Improvement path: Create targeted RPC functions for feed-count updates. Implement local optimistic updates that don't require reload

**Theme Store Syncs Every Mount:**
- Problem: Each component using `theme` store may trigger database sync on mount
- Files: `app/src/lib/stores/theme.ts` (not fully reviewed but pattern visible in git history)
- Cause: No deduplication of sync calls
- Improvement path: Add debouncing. Use service worker to sync once per session. Check if change actually occurred before writing

## Fragile Areas

**AIChat Component (900+ lines):**
- Files: `app/src/lib/components/AIChat.svelte`
- Why fragile: Massive monolithic component handling chat UI, context management, API calls, slash commands, time ranges, mobile overlay, caching, streaming, and markdown rendering
- Safe modification: Split into sub-components (ChatMessages, ContextBadges, CommandPalette, TimeRangeSelector). Move API logic to separate service. Add unit tests for cache invalidation
- Test coverage: No unit tests visible. Only integration via parent pages

**Timeline Page Route (500+ lines):**
- Files: `app/src/routes/timeline/[filter]/+page.svelte`
- Why fragile: Complex state management (scroll position, filters, search, pagination, entry selection, animations). Handles responsive layout changes mid-scroll. Multiple reactive derived values
- Safe modification: Extract filter logic to custom store. Move scroll position logic to separate module. Create entry selection service. Add integration tests for navigation
- Test coverage: No visible tests. Scroll position recovery untested

**Collections Store with Implicit Reloads:**
- Files: `app/src/lib/stores/collections.ts`
- Why fragile: Operations like `addFeedToCollection` trigger hidden `loadCollections(true)` calls. Calling code doesn't see these async operations
- Safe modification: Return promise from mutation functions. Document which operations trigger reloads. Add explicit error states. Test concurrent operations
- Test coverage: No tests visible

**Dynamic Theme CSS Variables:**
- Files: `app.css` (referenced in CLAUDE.md), theme store
- Why fragile: Cascading CSS variables updated at runtime. Changes propagate globally. Theme system recently rewrote multiple times (commits aad0870, 0c362fb, 45f76ea)
- Safe modification: Isolate theme to component level with CSS modules. Add visual regression tests. Document all CSS variable names and defaults
- Test coverage: Manual testing only. No automated theme validation

## Scaling Limits

**Timeline Pagination Offset Limit:**
- Current capacity: Offset-based pagination works reasonably up to 10,000 entries per user
- Limit: At 50,000+ unread entries, offset queries become slow (O(n) scan). UX degrades
- Scaling path: Implement cursor-based pagination using entry ID. Index entries by (user_id, created_at, id). Use `get_user_timeline` with cursor parameter

**AI Chat Context Size:**
- Current capacity: Fetches ~1000 entries per request. RTL markdown rendering caps at ~50KB input to Claude
- Limit: Users with 100+ starred items hit token limits. Streaming response becomes too slow
- Scaling path: Implement smart summarization of older entries. Add entry filtering by date. Compress entry data (remove HTML content, keep descriptions only)

**Collections with Many Feeds:**
- Current capacity: RPC `get_user_collections_with_counts` works fine with <100 collections and <1000 feeds total
- Limit: At 500+ feeds across collections, count aggregation query becomes slow. Page load blocks on collection data
- Scaling path: Cache counts with background refresh. Denormalize feed counts on collection. Paginate collections list

**Real-time Feed Updates:**
- Current capacity: No real-time updates implemented. Users refresh page to see new entries
- Limit: Not applicable - feature not implemented yet
- Scaling path: Add Supabase Realtime subscriptions. Implement WebSocket listener for entry table changes. Batch updates to avoid UI thrashing

## Dependencies at Risk

**Svelte 5 (New Runes Syntax):**
- Risk: Runes are new in Svelte 5. Ecosystem libraries may not be adapted. Migrating to Svelte 6 may require significant refactoring
- Impact: Component libraries using old Svelte 4 syntax may break. Test coverage for runes patterns is less mature
- Migration plan: Contribute runes support to upstream libraries or fork them. Add deprecation plan for Svelte 5 once Svelte 6 releases

**OpenRouter API (Third-party AI Provider):**
- Risk: If OpenRouter service goes down or changes API, AI chat stops working. Users' stored API keys become invalid
- Impact: Users can't use AI analysis features. No graceful degradation
- Migration plan: Support multiple AI providers (Anthropic, OpenAI). Abstract provider interface. Implement local fallback (summarize with regex)

**Supabase Auth Session Management:**
- Risk: `supabase.auth.getSession()` is called at module initialization in `auth.ts`. If Supabase is unreachable, app blocks on auth store load
- Impact: Page load hangs until Supabase responds or times out
- Migration plan: Timeout session fetch after 3s. Fall back to localStorage session. Implement retry with exponential backoff

## Missing Critical Features

**Offline Support:**
- Problem: No offline mode. Users can't read cached entries without connection
- Blocks: Mobile users on unreliable networks
- Partial workaround: Browser cache serves static assets. Database queries fail immediately

**Error Recovery and Retry:**
- Problem: Failed API calls show error toast but don't implement retry. Search that fails stays broken until manual refresh
- Blocks: Users stuck with stale data after transient network hiccup
- Workaround: Manual page refresh

**Unread Count Sync:**
- Problem: Unread counts may drift from reality. No background refresh to correct state
- Blocks: Users can't trust their unread counts after extended session
- Partial workaround: Reload full page

**Data Export/OPEX:**
- Problem: No way to export subscriptions, starred items, or read history
- Blocks: Data portability requests. Account migration

## Test Coverage Gaps

**Authentication Flows:**
- What's not tested: Signup validation, password reset token handling, OAuth callback errors, session auto-refresh
- Files: `app/src/lib/stores/auth.ts`, `app/src/routes/auth/**/*`
- Risk: Auth regressions ship to production. Password reset could break silently
- Priority: High

**Timeline Filter Persistence:**
- What's not tested: Filter load/save round trip, concurrent filter changes, filter state during pagination
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 93-116, 118-141
- Risk: Users' filter preferences lost. Filters apply inconsistently
- Priority: High

**Collections CRUD Operations:**
- What's not tested: Create/rename with duplicate names, add/remove feeds during reorder, concurrent collection mutations
- Files: `app/src/lib/stores/collections.ts`
- Risk: Collection state becomes inconsistent. Duplicate names crash on second add
- Priority: High

**AI Chat Markdown Rendering:**
- What's not tested: XSS prevention with markdown input, link handling, code block rendering, streaming partial content
- Files: `app/src/lib/components/AIChat.svelte` lines 8-16, 275-278
- Risk: AI responses could be misrendered or parsed unsafely
- Priority: Medium

**Search Query Validation:**
- What's not tested: SQL injection via search, special character handling, unicode normalization
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 61-70
- Risk: User input passed to RPC without validation. Potential for error responses or DoS
- Priority: Medium

**Responsive Layout Transitions:**
- What's not tested: Desktop-to-mobile breakpoint crossing during session, sidebar state during resize, scroll position on layout change
- Files: `app/src/routes/timeline/[filter]/+page.svelte` lines 22-47, `app/src/lib/stores/screenSize.ts`
- Risk: UI glitches, lost scroll position, sidebar state inconsistent
- Priority: Low

---

*Concerns audit: 2026-02-04*
