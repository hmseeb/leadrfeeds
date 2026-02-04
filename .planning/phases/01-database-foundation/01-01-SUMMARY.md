---
phase: 01-database-foundation
plan: 01
subsystem: database
tags: [supabase, api-keys, rls, sha256, service-role]

# Dependency graph
requires: []
provides:
  - api_keys table with RLS policies
  - Service role Supabase client for RLS bypass
  - idx_api_keys_prefix index for O(1) key lookup
affects: [authentication-middleware, key-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service role client isolated in $lib/server/"
    - "Dynamic env imports for graceful missing var handling"

key-files:
  created:
    - app/supabase/migrations/20260204143427_create_api_keys_table.sql
    - app/src/lib/server/supabase.ts
  modified:
    - app/.env.example

key-decisions:
  - "Use $env/dynamic/private instead of static for service role key to allow runtime validation"

patterns-established:
  - "$lib/server/ directory for server-only code with sensitive credentials"

# Metrics
duration: 5min
completed: 2026-02-04
---

# Phase 1 Plan 01: Database Table and Service Role Client Summary

**api_keys table with SHA-256 hashed keys, indexed prefix lookup, RLS policies, and isolated service role client**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-04T14:33:52Z
- **Completed:** 2026-02-04T14:38:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created api_keys table in Supabase with all required columns (id, user_id, label, key_prefix, key_hash, expires_at, revoked_at, last_used_at, created_at)
- Added idx_api_keys_prefix index for O(1) prefix-based key lookup during validation
- Added idx_api_keys_user_id index for efficient user key listing in settings UI
- Enabled Row Level Security with 3 policies (select, insert, update own keys)
- Created supabaseAdmin service role client isolated in $lib/server/ directory
- Updated .env.example with SUPABASE_SERVICE_ROLE_KEY placeholder

## Task Commits

Each task was committed atomically:

1. **Task 1: Create api_keys table in Supabase** - `680a701` (feat)
2. **Task 2: Create service role Supabase client** - `a3a2891` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `app/supabase/migrations/20260204143427_create_api_keys_table.sql` - SQL migration for api_keys table with indexes and RLS
- `app/src/lib/server/supabase.ts` - Service role Supabase client that bypasses RLS
- `app/.env.example` - Added SUPABASE_SERVICE_ROLE_KEY placeholder

## Decisions Made
- **Dynamic env imports**: Used $env/dynamic/private instead of $env/static/private for the service role key. This allows the code to compile even when the env var is not set, with runtime validation throwing a clear error if missing. Follows pattern established by existing anon client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed migration history mismatch with remote database**
- **Found during:** Task 1 (Create api_keys table)
- **Issue:** Remote Supabase database had 45 historical migrations not tracked locally, preventing `supabase db push`
- **Fix:** Ran `supabase migration repair --status reverted` for all historical migrations to sync local and remote state
- **Files modified:** None (migration history table only)
- **Verification:** `supabase migration list` shows synced state
- **Committed in:** N/A (no file changes, database operation only)

**2. [Rule 3 - Blocking] Changed from static to dynamic env imports**
- **Found during:** Task 2 (Create service role client)
- **Issue:** TypeScript check failed because $env/static/private requires env vars to be defined at build time
- **Fix:** Changed to $env/dynamic/private which allows undefined values with runtime checking
- **Files modified:** app/src/lib/server/supabase.ts
- **Verification:** `npm run check` passes with 0 errors
- **Committed in:** a3a2891 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both auto-fixes necessary for successful execution. No scope creep.

## Issues Encountered
None beyond the blocking issues documented above.

## User Setup Required

**External services require manual configuration.** See [01-USER-SETUP.md](./01-USER-SETUP.md) for:
- Environment variables to add (SUPABASE_SERVICE_ROLE_KEY)
- Where to find the service role key in Supabase Dashboard

## Next Phase Readiness
- api_keys table is ready for key validation utilities in 01-02
- Service role client is ready for RLS-bypassing queries
- No blockers for Phase 1 Plan 2

---
*Phase: 01-database-foundation*
*Completed: 2026-02-04*
