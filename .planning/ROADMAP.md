# Roadmap: LeadrFeeds API

## Overview

This roadmap delivers a public read-only API for LeadrFeeds, enabling users to programmatically access their feed data. The journey begins with secure database infrastructure for API keys, builds authentication and protection layers, then exposes endpoints for entries, feeds, collections, and stats. Key management UI and documentation complete the user experience. All 38 v1 requirements map to exactly one of 9 phases, following dependency order from foundation to polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Database Foundation** - API key table with SHA-256 hashing and prefix lookup
- [x] **Phase 2: Authentication Middleware** - Centralized key validation in hooks.server.ts
- [x] **Phase 3: Error Handling & Pagination** - Cross-cutting response infrastructure
- [ ] **Phase 4: Rate Limiting** - Upstash-based protection with headers
- [ ] **Phase 5: Entries Endpoint** - Core feed entry access with filtering
- [ ] **Phase 6: Feeds Endpoint** - Feed metadata and subscription data
- [ ] **Phase 7: Collections & Stats** - Secondary data endpoints
- [ ] **Phase 8: Key Management UI** - User-facing key CRUD in settings
- [ ] **Phase 9: Documentation** - OpenAPI spec and user guides

## Phase Details

### Phase 1: Database Foundation
**Goal**: Secure infrastructure exists for storing and validating API keys
**Depends on**: Nothing (first phase)
**Requirements**: KEY-06, AUTH-04
**Success Criteria** (what must be TRUE):
  1. API keys are stored as SHA-256 hashes in Supabase (never plaintext)
  2. Key lookup uses indexed prefix for O(1) performance
  3. Service role client exists and is isolated from browser code
  4. Key validation uses timing-safe comparison
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md - Database table and service role client
- [x] 01-02-PLAN.md - TypeScript types and key validation utilities

### Phase 2: Authentication Middleware
**Goal**: All /api/v1/* routes are protected by centralized API key validation
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. API request with valid key in Authorization header succeeds
  2. API request with expired key receives 401 with clear error
  3. API request with revoked key receives 401 with clear error
  4. API request without key receives 401
  5. User context is attached to request for downstream handlers
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md - Server hooks with API key authentication middleware
- [x] 02-02-PLAN.md - Fix lazy initialization for service role client (gap closure)

### Phase 3: Error Handling & Pagination
**Goal**: All API responses follow consistent format with proper error handling and pagination
**Depends on**: Phase 2
**Requirements**: ERR-01, ERR-02, ERR-03, PAGE-01, PAGE-02, PAGE-03
**Success Criteria** (what must be TRUE):
  1. All errors return consistent JSON format with code, message, and status
  2. HTTP status codes match error types (400, 401, 404, 429, 500)
  3. Error messages help users without leaking implementation details
  4. Paginated responses include cursor for next page
  5. Page size is configurable with enforced maximum
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md - Error response helpers and cursor pagination utilities

### Phase 4: Rate Limiting
**Goal**: API is protected from abuse with per-key rate limits and informative headers
**Depends on**: Phase 3
**Requirements**: RATE-01, RATE-02, RATE-03
**Success Criteria** (what must be TRUE):
  1. Each API key has independent rate limits
  2. All responses include X-RateLimit-Remaining and X-RateLimit-Reset headers
  3. Exceeded limits return 429 with Retry-After header
  4. Rate limiting uses atomic operations (no race conditions)
**Plans**: 1 plan

Plans:
- [ ] 04-01-PLAN.md - Upstash rate limiter with hooks.server.ts integration

### Phase 5: Entries Endpoint
**Goal**: Users can query their feed entries with filtering, search, and pagination
**Depends on**: Phase 4
**Requirements**: ENT-01, ENT-02, ENT-03, ENT-04, ENT-05, ENT-06, ENT-07
**Success Criteria** (what must be TRUE):
  1. GET /api/v1/entries returns paginated feed entries
  2. Entries can be filtered by date range (start_date, end_date)
  3. Entries can be filtered by feed_id
  4. Entries can be filtered by category
  5. Entries can be filtered by read/unread status
  6. Entries can be filtered by starred status
  7. Full-text search works across entry title and content
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Feeds Endpoint
**Goal**: Users can query their subscribed feeds and metadata
**Depends on**: Phase 5
**Requirements**: FEED-01, FEED-02, FEED-03
**Success Criteria** (what must be TRUE):
  1. GET /api/v1/feeds returns user's subscribed feeds
  2. Each feed includes metadata (title, URL, category)
  3. Each feed includes unread entry count
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Collections & Stats
**Goal**: Users can query collections and aggregate statistics
**Depends on**: Phase 6
**Requirements**: COLL-01, COLL-02, COLL-03, STAT-01, STAT-02, STAT-03
**Success Criteria** (what must be TRUE):
  1. GET /api/v1/collections returns user's collections
  2. Each collection includes its feeds
  3. Entries can be filtered by collection
  4. GET /api/v1/stats returns total unread count
  5. Stats include total starred count
  6. Stats include per-feed counts
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Key Management UI
**Goal**: Users can create, view, and revoke API keys in the web interface
**Depends on**: Phase 1 (can parallelize with Phases 5-7)
**Requirements**: KEY-01, KEY-02, KEY-03, KEY-04, KEY-05
**Success Criteria** (what must be TRUE):
  1. User can create API key with custom label
  2. User can set expiration date when creating key
  3. User can revoke an active API key
  4. User can manage multiple API keys
  5. User can view list of keys with status and last used time
  6. Full key is shown only once at creation (never again)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Documentation
**Goal**: External users have comprehensive documentation for API integration
**Depends on**: Phases 5-7 (documents completed endpoints)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05
**Success Criteria** (what must be TRUE):
  1. Documentation page is accessible to users
  2. All endpoints are documented with parameters and responses
  3. Authentication guide explains key creation and usage
  4. OpenAPI/Swagger specification is available for download
  5. Code examples exist for common languages (curl, JavaScript, Python)
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
(Phase 8 can parallelize with 5-7 if desired)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 2/2 | Complete | 2026-02-04 |
| 2. Authentication Middleware | 2/2 | Complete | 2026-02-04 |
| 3. Error Handling & Pagination | 1/1 | Complete | 2026-02-04 |
| 4. Rate Limiting | 0/1 | Not started | - |
| 5. Entries Endpoint | 0/? | Not started | - |
| 6. Feeds Endpoint | 0/? | Not started | - |
| 7. Collections & Stats | 0/? | Not started | - |
| 8. Key Management UI | 0/? | Not started | - |
| 9. Documentation | 0/? | Not started | - |

---
*Roadmap created: 2026-02-04*
*Total phases: 9 | Total v1 requirements: 38 | Coverage: 100%*
