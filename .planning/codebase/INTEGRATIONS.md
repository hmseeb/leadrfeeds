# External Integrations

**Analysis Date:** 2026-02-04

## APIs & External Services

**OpenRouter AI:**
- Service: LLM API for AI-assisted content analysis
- Implementation: Direct HTTP fetch in `src/lib/components/AIChat.svelte`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Usage: Chat completion requests with user-selected models
- Configuration: User enters API key and preferred model in settings (`/settings`)
- Storage: API key stored in `user_settings.openrouter_api_key` (encrypted by Supabase)

**Google OAuth (Optional):**
- Service: Social sign-in via Google
- SDK: @supabase/supabase-js OAuth integration
- Provider: google
- Callback: `/auth/callback` → redirects to `${window.location.origin}/auth/callback`
- Implementation: `signInWithGoogle()` in `src/lib/stores/auth.ts`

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: PUBLIC_SUPABASE_URL
  - Client: @supabase/supabase-js createClient
  - RLS: Row-level security enabled for multi-tenant data isolation
  - Type definitions: `src/lib/types/database.ts` (generated types)

**Key Tables:**
- `feeds` - RSS feed metadata
- `entries` - Feed entries/posts with content
- `user_subscriptions` - User feed subscriptions
- `user_entry_status` - Read/starred status per entry
- `user_settings` - User preferences including openrouter_api_key, preferred_model, ai_chat_width
- `chat_messages` - AI conversation history with context
- `feed_suggestions` - User-submitted feed suggestions awaiting review
- `feed_waitlist` - Users waiting for feed availability

**Key RPC Functions:**
- `get_user_timeline` - Paginated timeline with entry/feed join data
- `get_discovery_feeds` - Browse available feeds
- `get_unread_counts` - Unread counts per feed
- `mark_entry_read` - Update entry read status
- `toggle_entry_star` - Toggle starred status
- `get_ai_context` - Fetch entries for AI context (with pagination support)
- `get_collection_ai_context` - Fetch collection entries for AI context
- `get_pending_suggestions_count` - Count pending feed suggestions
- `get_suggestion_feed_status` - Check if suggested feed already exists

**File Storage:**
- Not detected - Feed images loaded directly from feed URLs (with error fallback)

**Caching:**
- In-memory cache in AIChat component: `aiContextCache` Map with 5-minute TTL
- Supabase session persistence via SDK configuration

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in PostgreSQL auth)
- Email: Email/password sign-up and sign-in
- OAuth: Google sign-in (optional)
- Session: Automatic token refresh, persistent across browser sessions

**Auth Store:** `src/lib/stores/auth.ts`
- Exports: `user`, `session`, `loading` (writable stores)
- Functions: `signUp`, `signIn`, `signOut`, `resetPasswordForEmail`, `updatePassword`, `signInWithGoogle`
- Auto-initialization: Calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`

**Password Recovery Flow:**
1. User requests reset at `/auth/forgot-password`
2. Calls `resetPasswordForEmail(email)` → Supabase sends email
3. Email contains recovery link with `redirectTo=/auth/reset-password`
4. Callback handler (`src/routes/auth/callback/+server.ts`) detects `type=recovery` parameter
5. Redirects to `/auth/reset-password`
6. Reset page verifies session exists
7. User calls `updatePassword()` to set new password

**Authorization:**
- Supabase RLS (Row-Level Security) enforces user data isolation
- Client-side checks based on `user` store
- Protected routes redirect to login if no session

## Webhooks & Callbacks

**Incoming:**
- `/auth/callback` - OAuth callback and password recovery redirect handler
  - Handles code exchange for OAuth
  - Detects recovery token type and redirects appropriately
  - Handles OAuth errors with message passthrough

**Outgoing:**
- Not detected in client code
- External service (Folo) sends webhooks → n8n → Supabase (backend process, not in this codebase)

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Rollbar, or similar integration

**Logs:**
- Browser console via `console.error()` and `console.log()` statements
- Supabase request errors captured in function returns

## CI/CD & Deployment

**Hosting:**
- Vercel (serverless platform)
- Adapter: @sveltejs/adapter-vercel 6.1.1

**CI Pipeline:**
- Not detected in codebase (likely GitHub Actions via Vercel)

## Environment Configuration

**Required env vars (Public):**
- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Anonymous auth token for client-side queries

**User-Configured Secrets:**
- OpenRouter API key (entered in UI, stored in `user_settings` table)
- Preferred LLM model name (also in `user_settings`)

**Secrets Location:**
- Public: Environment variables in Vercel deployment
- User: Encrypted in Supabase `user_settings` table with RLS protection
- Example file: `.env.example` for reference

## Data Flow Patterns

**Feed Discovery:**
- User browses `/discover`
- RPC `get_discovery_feeds()` fetches available feeds from `feeds` table
- User can suggest feeds via `feed_suggestions` table

**Timeline View:**
- User navigates to `/timeline/[filter]` (all, starred, unread, or category)
- RPC `get_user_timeline(user_id, filter)` returns paginated entries
- Join with `user_subscriptions`, `feeds`, `entries`, `user_entry_status`

**AI Chat:**
- User opens AIChat component from timeline or entry
- Component fetches context via `get_ai_context` RPC with time range filter
- Caches results in memory for 5 minutes
- Sends request to OpenRouter with user's stored API key
- Saves conversation history to `chat_messages` table

**Authentication:**
- Client detects session via `supabase.auth.getSession()`
- Session auto-refreshes via token stored in localStorage
- Login redirects to `/timeline/all` if subscriptions exist, else `/discover`

---

*Integration audit: 2026-02-04*
