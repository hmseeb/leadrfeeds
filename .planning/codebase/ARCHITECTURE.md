# Architecture

**Analysis Date:** 2026-02-04

## Pattern Overview

**Overall:** Client-side driven SvelteKit application with RPC-based data access to Supabase backend.

**Key Characteristics:**
- Frontend-heavy architecture with minimal server-side logic (mainly routing)
- State management via Svelte stores with reactive derivations
- Direct Supabase client integration in browser for data access
- Responsive mobile-first design with reactive layout adaptation
- RPC functions for complex queries (timelines, unread counts, collections)

## Layers

**Presentation Layer:**
- Purpose: Render UI components and handle user interactions
- Location: `app/src/routes/` and `app/src/lib/components/`
- Contains: Svelte components (pages, layouts, UI elements) using Svelte 5 runes
- Depends on: Stores, services, types
- Used by: Browser for rendering, components for composition

**State Management Layer:**
- Purpose: Manage application state and persist across navigations
- Location: `app/src/lib/stores/`
- Contains: Svelte writable/derived stores (auth, sidebar, collections, screenSize, theme, toast)
- Depends on: Supabase client, browser APIs
- Used by: Components via store subscriptions, reactive derivations

**Service Layer:**
- Purpose: Initialize and provide Supabase client with authentication
- Location: `app/src/lib/services/supabase.ts`
- Contains: Supabase client instantiation with database types
- Depends on: @supabase/supabase-js, environment variables
- Used by: Stores and page components for data operations

**Type Layer:**
- Purpose: Define database schema and RPC function return types
- Location: `app/src/lib/types/database.ts`
- Contains: TypeScript types generated from Supabase schema
- Depends on: Supabase database definition
- Used by: Stores, components for type safety

**Routing Layer:**
- Purpose: Handle URL routing and page transitions
- Location: `app/src/routes/` (SvelteKit file-based routing)
- Contains: Page components (+page.svelte), layouts (+layout.svelte), server handlers (+server.ts)
- Depends on: Presentation layer components, stores
- Used by: SvelteKit router, browser navigation

## Data Flow

**Authentication Flow:**

1. App loads → `+layout.svelte` initializes auth store
2. Auth store calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange()`
3. User state and session state updated in stores
4. Routes check `$user` store to gate access
5. Redirect logic: `/` → check subscriptions → `/timeline/all` or `/discover`

**Timeline Entry Loading Flow:**

1. User navigates to `/timeline/[filter]` page
2. Component mounts and calls `sidebarStore.loadFeeds()`
3. Sidebar store fetches user subscriptions with RPC `get_unread_counts`
4. Timeline component fetches entries via `supabase.rpc('get_user_timeline', {...})`
5. Entries rendered in `EntryCard` components
6. User interactions (mark read/star) update `user_entry_status` table
7. Sidebar store debounces feed count updates (30s refresh interval)

**Feed Discovery Flow:**

1. User navigates to `/discover`
2. Component fetches all feeds via `get_discovery_feeds` RPC
3. Builds category groupings client-side based on domain extraction
4. User subscribes → inserts into `user_subscriptions`
5. User can optionally suggest new feeds → modal submission

**Collections Flow:**

1. Component mounts and calls `collectionsStore.loadCollections()`
2. Store fetches user's collections via RPC `get_user_collections_with_counts`
3. User can create/edit/delete collections
4. Feeds can be added to collections via modal interface
5. Timeline can filter by active collection

**State Management:**

- **Auth Store** (`auth.ts`): Manages user session and authentication functions
- **Sidebar Store** (`sidebar.ts`): Manages subscribed feeds, unread counts, refresh interval
- **Collections Store** (`collections.ts`): Manages user collections and collection operations
- **Screen Size Store** (`screenSize.ts`): Manages responsive breakpoints and layout mode
- **Theme Store** (`theme.ts`): Manages dark/light theme persistence
- **Toast Store** (`toast.ts`): Manages notification toasts

## Key Abstractions

**Store Pattern (Svelte Stores):**
- Purpose: Centralized state with reactive subscriptions
- Examples: `auth.ts`, `sidebar.ts`, `collections.ts`, `screenSize.ts`
- Pattern: Writable stores with custom methods, derived stores for computed values

**RPC Functions:**
- Purpose: Server-side query logic that's complex or requires security rules
- Examples: `get_user_timeline()`, `get_unread_counts()`, `get_user_collections_with_counts()`
- Pattern: Supabase RPC calls with typed parameters and return values

**Component Hierarchy:**
- Purpose: Reusable UI elements with composition
- Examples: `Sidebar.svelte`, `EntryCard.svelte`, `AIChat.svelte`, UI components in `ui/` directory
- Pattern: Props-based composition with Svelte 5 runes (`$props`, `$derived`, `$state`, `$effect`)

**Responsive Layout:**
- Purpose: Adapt UI to screen size and orientation
- Examples: Desktop sidebar vs mobile overlay menu
- Pattern: `useDesktopLayout` derived store combines width and landscape orientation

**Modal/Overlay Pattern:**
- Purpose: Show focused UI without full navigation
- Examples: `SuggestFeedModal`, `CollectionModal`, `ConfirmModal`
- Pattern: State-driven visibility with props for context, callbacks for actions

## Entry Points

**Application Root:**
- Location: `app/src/routes/+layout.svelte`
- Triggers: Browser load
- Responsibilities: Load app.css, initialize theme, render auth loading state, mount Toast component

**Index Redirect:**
- Location: `app/src/routes/+page.svelte`
- Triggers: Navigation to `/`
- Responsibilities: Check auth status, query subscriptions, redirect to timeline or discover

**Timeline Reader:**
- Location: `app/src/routes/timeline/[filter]/+page.svelte`
- Triggers: Navigation to `/timeline/all|starred|unread|[feed-id]`
- Responsibilities: Load feed entries, render sidebar, handle entry selection, manage AI chat overlay

**Feed Discovery:**
- Location: `app/src/routes/discover/+page.svelte`
- Triggers: Navigation to `/discover`
- Responsibilities: Load available feeds, manage subscription filters, handle feed subscription/suggestion

**Collections Manager:**
- Location: `app/src/routes/collections/+page.svelte`
- Triggers: Navigation to `/collections`
- Responsibilities: Load user collections, create/edit/delete collections, manage collection feeds

**Auth Routes:**
- Location: `app/src/routes/auth/login/+page.svelte`, `/register/+page.svelte`, etc.
- Triggers: Navigation to `/auth/*`
- Responsibilities: Handle authentication forms, OAuth flow, password recovery

**OAuth Callback Handler:**
- Location: `app/src/routes/auth/callback/+server.ts`
- Triggers: OAuth redirect from provider
- Responsibilities: Extract code and type from URL, handle errors, redirect to appropriate page

## Error Handling

**Strategy:** Inline error states with user feedback via Toast notifications.

**Patterns:**

- **Async Operation Errors:** Try-catch with error state update and toast notification
  - Example: `signIn()` sets error message, `handleLogin()` displays error to user

- **Form Validation:** Inline field validation before submission
  - Example: Check empty fields before login, display error message

- **Network Errors:** Graceful degradation with retry capability
  - Example: Sidebar store logs error and continues, doesn't block page load

- **Authentication Errors:** Redirect to login on auth failure
  - Example: Missing session redirects to `/auth/login`

- **OAuth Errors:** Extract from URL params and display to user
  - Example: `/auth/callback` captures error param and redirects with message

## Cross-Cutting Concerns

**Logging:** Console.error() for errors, minimal logging in stores. No external logging service.

**Validation:** Client-side form validation in components, database schema enforces constraints via Supabase RLS (Row Level Security).

**Authentication:** Supabase Auth with email/password and Google OAuth. Session persisted in browser. RLS policies on all tables enforce user isolation.

**Responsive Design:** `useDesktopLayout` derived store drives layout adaptation. Mobile-first default to prevent layout shift on SSR.

**Rate Limiting:** Store debouncing for data fetches (5-second minimum between refreshes). 30-second refresh interval for sidebar feeds.

**Caching:** In-memory store state acts as cache. Some state persists to `user_settings` table (sidebar collapsed state, filter preferences, theme).

---

*Architecture analysis: 2026-02-04*
