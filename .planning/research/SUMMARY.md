# Project Research Summary

**Project:** LeadrFeeds Public API
**Domain:** Read-only REST API with API key authentication for RSS reader
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

LeadrFeeds is adding a read-only REST API to enable external integrations (AI agents, automation tools) to access user feed data. Based on comprehensive research, the recommended approach is to build API endpoints using SvelteKit API routes rather than Supabase Edge Functions. This keeps the entire stack in Node.js, reuses existing Supabase RPC functions, and maintains a single deployment pipeline on Vercel.

The architecture leverages SvelteKit's hooks.server.ts for centralized authentication middleware, stores hashed API keys in Supabase PostgreSQL, and implements rate limiting via Upstash Redis. Critical success factors include: (1) proper key security from day one (SHA-256 hashing with prefix lookup pattern), (2) atomic rate limiting to prevent race conditions, (3) consistent authentication across all endpoints, and (4) careful error handling to avoid information leakage.

Key risk: Security vulnerabilities in API key handling and rate limiting can expose user data or enable abuse. Mitigation: Follow established patterns for API key storage (hashing + prefix), use timing-safe comparisons, implement rate limiting with atomic operations, and centralize authentication in hooks rather than per-route checks.

## Key Findings

### Recommended Stack

The research strongly recommends building the API layer within the existing SvelteKit application rather than introducing separate services. This approach minimizes complexity while leveraging existing infrastructure.

**Core technologies:**
- **SvelteKit API routes** (existing v2.47.1): HTTP endpoints via `/api/v1/*` routes — already in stack, full Node.js runtime, reuses existing Supabase client and types
- **Supabase PostgreSQL** (existing): API key storage with hashing — leverages existing database, no new service needed, uses pgcrypto extension for secure hashing
- **Upstash Redis** (@upstash/ratelimit 2.0.8 + @upstash/redis 1.36.1): Rate limiting — serverless-compatible HTTP-based Redis, sliding window algorithm, global distribution
- **SvelteKit hooks** (built-in): Authentication middleware — standard pattern for request interception, uses sequence() to chain auth + rate limiting
- **nanoid** (^5.x): API key generation — cryptographically secure random strings with customizable length

**Alternative considered but rejected:** Supabase Edge Functions would require Deno runtime (limited npm compatibility), separate deployment pipeline, and code duplication. The existing SvelteKit + Vercel setup is better suited for this use case.

### Expected Features

Research into REST API best practices and competitive RSS reader APIs (Feedly, Inoreader) reveals clear feature expectations.

**Must have (table stakes):**
- API key authentication with create/revoke capability
- API key labels for identifying integrations
- Pagination (cursor-based for timeline, offset for stable lists)
- Basic filtering (by feed, date range, read/starred status)
- Consistent JSON response format with envelope pattern
- Proper HTTP status codes (200, 400, 401, 404, 429, 500)
- Rate limiting with X-RateLimit-* headers
- Clear error messages with codes and descriptions
- HTTPS only (already enforced by Vercel)
- API documentation (at minimum: auth instructions + endpoint list)

**Should have (competitive differentiators):**
- Full-text search across entries (already supported in get_user_timeline RPC)
- OpenAPI specification for machine-readable docs and auto-generated clients
- Field selection to reduce payload size (?fields=title,url)
- Cursor-based pagination for stable real-time feeds
- Collection filtering via existing RPC functions
- API key expiration for security
- Unread counts endpoint (already have get_unread_counts RPC)
- Interactive documentation (Swagger UI or similar)

**Defer (v2+):**
- Multiple output formats (JSON-feed, CSV)
- Bulk data export endpoints
- Webhook push notifications (adds significant complexity)
- Write operations (security risk for read-only use case)
- OAuth 2.0 (overkill for server-to-server read access)
- GraphQL (unnecessary complexity for known query patterns)

**Anti-features (explicitly avoid):**
- Write operations via API (keep mutations in web UI only)
- Public endpoints without auth (all endpoints require API key)
- Query string API keys (exposes keys in logs)
- Session-based auth for API (doesn't work server-to-server)

### Architecture Approach

The API layer integrates into the existing SvelteKit application using a middleware pattern. SvelteKit's hooks.server.ts intercepts all /api/v1/* requests, validates API keys against Supabase, checks rate limits via Upstash Redis, and attaches user context to event.locals for route handlers.

**Major components:**

1. **hooks.server.ts middleware** — Intercepts all API requests, validates API keys via Supabase RPC, checks rate limits, attaches user context to event.locals using sequence() pattern
2. **API key storage (api_keys table)** — Private Supabase table stores SHA-256 hashed keys with prefix for indexed lookup, includes metadata (name, permissions, expiration, last_used)
3. **Supabase service client** — Separate client with service_role key bypasses RLS, allows querying data for API key owner, never exposed to browser
4. **SvelteKit API routes** — File-based routes under /api/v1/* handle HTTP methods, reuse existing RPC functions (get_user_timeline, get_unread_counts), return standardized JSON responses
5. **Upstash rate limiter** — Redis-backed sliding window algorithm prevents burst attacks, tracks per-key usage, returns standard rate limit headers

**Data flow:** Request with Authorization header → hooks.server.ts extracts key → validates against api_keys table (SHA-256 hash comparison) → checks rate limit → attaches user_id to locals → route handler executes → calls existing RPC with user_id → transforms response → returns JSON with rate limit headers.

**Key patterns:**
- URL path versioning (/api/v1/) for long-term stability
- Service role client separate from anon client to avoid session conflicts
- Type-safe locals via app.d.ts extension
- Reuse existing RPC functions (get_user_timeline, get_discovery_feeds)
- Atomic rate limiting with Redis INCR to prevent race conditions

### Critical Pitfalls

Top security and architectural pitfalls identified across multiple authoritative sources:

1. **Plaintext key storage** — Storing unhashed API keys in database leads to complete compromise on breach. Prevention: Hash keys with SHA-256, store prefix (first 8 chars) for indexed lookup, show full key only once at creation. This must be designed correctly in the schema phase.

2. **Timing attacks on key comparison** — Using standard string comparison (===) allows attackers to guess keys character-by-character by measuring response times. Prevention: Use crypto.timingSafeEqual() for constant-time comparison, compare hashes not raw keys.

3. **Inconsistent authentication** — New routes bypass auth because SvelteKit's file-based routing requires explicit checks. Prevention: Centralize auth in hooks.server.ts, fail closed (all /api/* routes protected by default), write integration tests verifying auth on all endpoints.

4. **Race conditions in rate limiting** — Read-then-increment pattern allows concurrent requests to bypass limits. Prevention: Use atomic operations (Redis INCR or PostgreSQL UPDATE...RETURNING), Lua scripts for check-and-increment.

5. **Information leakage in errors** — Stack traces and database errors reveal system internals to attackers. Prevention: Generic public errors, log details server-side only, same response for "key not found" vs "key invalid", use RFC 7807 Problem Details format.

6. **bcrypt for API key hashing** — Using bcrypt (designed for passwords) creates O(n) lookup requiring comparison against all keys. Prevention: Use SHA-256 with prefix-based indexed lookup for O(1) performance.

7. **Fixed window rate limiting** — Window resets at fixed intervals allow burst attacks (100 requests at 0:59, 100 at 1:01 = 200 in 2 seconds). Prevention: Sliding window or token bucket algorithm.

8. **API keys in URL parameters** — Keys in URLs leak via server logs, browser history, referrer headers. Prevention: Header-only authentication (Authorization: Bearer or X-API-Key), return 400 if key detected in query string.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order and groups related functionality:

### Phase 1: Foundation (Database + Auth Infrastructure)
**Rationale:** All API endpoints depend on authentication working. Database schema decisions (hashing strategy, prefix pattern) are expensive to change later and must be correct from the start.

**Delivers:**
- api_keys table in Supabase with SHA-256 hashing and prefix lookup
- Service role Supabase client configuration
- API key validation function (RPC or server-side)
- Type-safe app.d.ts extensions for event.locals

**Addresses:**
- API key authentication (table stakes from FEATURES.md)
- Proper key storage security

**Avoids:**
- Plaintext key storage (Pitfall #1)
- bcrypt lookup performance issues (Pitfall #6)
- Inconsistent auth (Pitfall #3)

**Research flag:** Standard patterns well-documented, skip phase research.

### Phase 2: Authentication Middleware
**Rationale:** Centralized auth must exist before any endpoint goes live. SvelteKit's sequence pattern ensures consistent protection across all routes.

**Delivers:**
- hooks.server.ts with apiKeyAuth middleware
- Header-based key extraction (Authorization: Bearer)
- Timing-safe key comparison
- User context attachment to event.locals
- Integration tests for auth coverage

**Addresses:**
- Consistent authentication (table stakes from FEATURES.md)
- Proper HTTP status codes

**Avoids:**
- Inconsistent authentication across routes (Pitfall #3)
- Timing attacks (Pitfall #2)
- Keys in URL parameters (Pitfall #8)

**Uses:**
- SvelteKit hooks and sequence() from STACK.md
- Service role client from Phase 1

**Research flag:** Standard patterns, skip phase research.

### Phase 3: Rate Limiting
**Rationale:** Rate limiting must be in place before API goes public to prevent abuse and cost overruns. Upstash setup is prerequisite for rate limiting middleware.

**Delivers:**
- Upstash Redis account and configuration
- Rate limiting middleware in hooks.server.ts
- Atomic increment operations
- X-RateLimit-* headers on all responses
- Tiered limits (free/standard/premium)

**Addresses:**
- Rate limiting (table stakes from FEATURES.md)
- Rate limit headers (prevents poor developer experience)

**Avoids:**
- Race conditions in rate limiting (Pitfall #4)
- Fixed window burst attacks (Pitfall #7)
- Missing rate limit headers (Pitfall #12)

**Uses:**
- @upstash/ratelimit + @upstash/redis from STACK.md
- Sliding window algorithm

**Research flag:** Upstash well-documented, but may need research-phase if custom rate limit patterns needed.

### Phase 4: Core API Endpoints
**Rationale:** With auth and rate limiting in place, endpoints can be built safely. Prioritize endpoints that reuse existing RPC functions to minimize implementation complexity.

**Delivers:**
- GET /api/v1/entries (with filtering, pagination, search)
- GET /api/v1/entries/:id
- GET /api/v1/feeds
- GET /api/v1/feeds/:id
- GET /api/v1/stats/unread
- Standardized response envelope pattern
- Proper error handling

**Addresses:**
- Entries endpoint (MVP priority from FEATURES.md)
- Feeds/subscriptions endpoint (MVP priority)
- Pagination (table stakes)
- Filtering (table stakes)
- Consistent response format (table stakes)

**Avoids:**
- Information leakage in errors (Pitfall #5)
- Incomplete error status codes (Pitfall #13)

**Uses:**
- Existing RPC functions (get_user_timeline, get_unread_counts)
- SvelteKit API routes pattern from ARCHITECTURE.md

**Research flag:** Standard REST patterns, skip phase research.

### Phase 5: API Key Management UI
**Rationale:** Users need a way to create and manage API keys through the web interface. Can be built in parallel with Phase 4 endpoints.

**Delivers:**
- Key generation UI in settings page
- Key listing with labels and last_used timestamps
- Key revocation with grace period
- Show full key only once on creation
- Support for multiple keys per user

**Addresses:**
- API key labels (table stakes from FEATURES.md)
- Key management

**Avoids:**
- No key rotation support (Pitfall #8)
- Immediate revocation without grace period (Pitfall #7)
- No key labels (Pitfall #14)
- No prefix on keys (Pitfall #11)

**Uses:**
- Existing Svelte 5 component patterns
- nanoid for key generation from STACK.md

**Research flag:** Standard CRUD patterns, skip phase research.

### Phase 6: Documentation
**Rationale:** API is functional but needs documentation for external users. OpenAPI spec enables auto-generated clients and interactive docs.

**Delivers:**
- OpenAPI 3.1 specification
- Interactive documentation (Swagger UI)
- Authentication guide
- Code examples (curl, JavaScript, Python)
- Rate limit documentation
- Changelog for API updates

**Addresses:**
- API documentation (table stakes from FEATURES.md)
- OpenAPI specification (differentiator from FEATURES.md)
- Interactive documentation (differentiator)

**Avoids:**
- API documentation staleness (Pitfall #15)

**Research flag:** May need research-phase for OpenAPI generation patterns in SvelteKit.

### Phase 7: Enhanced Features (Post-MVP)
**Rationale:** After core functionality is stable, add competitive differentiators. These don't block launch.

**Delivers:**
- Collections endpoints (GET /api/v1/collections)
- Field selection (?fields=title,url)
- API key expiration enforcement
- Category filtering
- Bulk export endpoint

**Addresses:**
- Differentiator features from FEATURES.md

**Research flag:** Field selection and bulk export may need research-phase for efficient implementation patterns.

### Phase Ordering Rationale

- **Sequential foundation (Phases 1-3):** Database schema, auth, and rate limiting must be complete before any endpoint is built. These are cross-cutting concerns that affect all routes.
- **Parallel development (Phases 4-5):** Endpoints and key management UI can be built simultaneously once foundation is complete.
- **Documentation follows implementation (Phase 6):** OpenAPI spec generated from working endpoints ensures accuracy.
- **Defer enhancements (Phase 7):** Features without clear MVP need can be added without breaking changes.

This ordering avoids the critical pitfalls identified in research:
- Schema decisions (hashing, prefix) made upfront before endpoints exist
- Authentication centralized before routes proliferate
- Rate limiting atomic from the start, no retrofitting
- Documentation generated from code, reducing staleness risk

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (Rate Limiting):** If custom rate limit patterns needed beyond Upstash's standard algorithms, may require research into advanced configurations
- **Phase 6 (Documentation):** OpenAPI generation in SvelteKit is less standardized than in frameworks like FastAPI; may need research into tools like swagger-jsdoc or manual spec writing
- **Phase 7 (Enhanced Features):** Field selection and bulk export patterns for efficient implementation

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Database schema patterns well-documented in sources
- **Phase 2 (Auth Middleware):** SvelteKit hooks pattern is official and well-documented
- **Phase 4 (Core Endpoints):** REST API patterns are standardized
- **Phase 5 (Key Management UI):** Standard CRUD operations in existing Svelte 5 app

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SvelteKit API routes verified with official docs; Upstash is industry standard for serverless rate limiting; all package versions confirmed |
| Features | HIGH | Feature expectations verified across multiple competitive APIs (Feedly, Inoreader) and REST API best practice guides |
| Architecture | HIGH | SvelteKit hooks pattern is official; service role client pattern documented by Supabase; all sources are authoritative |
| Pitfalls | HIGH | Security pitfalls verified across OWASP, official library docs, and multiple security guides; patterns confirmed with real-world vulnerability disclosures |

**Overall confidence:** HIGH

Research is comprehensive with verification from official documentation and multiple authoritative sources. The recommended approach (SvelteKit API routes) aligns with existing codebase patterns, minimizing risk.

### Gaps to Address

While research confidence is high, the following areas may need validation during implementation:

- **Upstash free tier limits:** Research shows 10K commands/day free tier, but actual usage patterns (how many Redis operations per API request) need measurement to confirm this is sufficient for initial launch. Validation: Monitor Upstash usage during development and early beta.

- **OpenAPI spec generation:** SvelteKit doesn't have official OpenAPI tooling like FastAPI. May need to evaluate manual spec writing vs third-party libraries (swagger-jsdoc, openapi-typescript). Validation: Prototype in Phase 6 to determine best approach.

- **RPC function parameters:** Research assumes existing RPC functions (get_user_timeline, get_unread_counts) have appropriate parameters for API use cases. Need to verify parameter coverage. Validation: Review RPC signatures against API endpoint requirements in Phase 4.

- **Service role key exposure risk:** Environment variable management needs to ensure SUPABASE_SERVICE_ROLE_KEY never leaks to client. Validation: Verify Vercel environment variable security and ensure key is only imported in server-side code (never in routes/+page.svelte).

- **Key rotation UX:** Research recommends supporting multiple active keys for rotation, but exact UX flow needs design. Validation: Prototype key rotation workflow in Phase 5 to ensure it's intuitive.

## Sources

### Primary (HIGH confidence)
- [SvelteKit Routing Documentation](https://svelte.dev/docs/kit/routing) — API route patterns, +server.ts files
- [SvelteKit Hooks Documentation](https://svelte.dev/docs/kit/hooks) — Middleware via hooks.server.ts and sequence()
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — Service role client pattern
- [Upstash Ratelimit Documentation](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview) — Rate limiting SDK and algorithms
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html) — Error security patterns
- [API Key Authentication Best Practices - Zuplo](https://zuplo.com/blog/2022/12/01/api-key-authentication) — Hashing and lookup patterns
- [REST API Best Practices - Postman](https://blog.postman.com/rest-api-best-practices/) — General REST patterns

### Secondary (MEDIUM confidence)
- [Upstash SvelteKit Guide](https://upstash.com/blog/sveltekit-rate-limiting) — Implementation examples
- [Supabase API Key Management - MakerKit](https://makerkit.dev/blog/tutorials/supabase-api-key-management) — Schema patterns
- [Feedly API Documentation](https://developers.feedly.com/reference/introduction) — Competitive analysis
- [Inoreader API](https://www.inoreader.com/developers/) — Competitive analysis
- [API Design Best Practices - Speakeasy](https://www.speakeasy.com/api-design/pagination) — Pagination patterns
- [Hashing API Keys - Octopus](https://octopus.com/blog/hashing-api-keys) — Security rationale
- [API Rate Limiting Best Practices - Cloudflare](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/) — Rate limiting strategies
- [Timing Attack Security - Dev.to](https://dev.ngockhuong.com/posts/timing-attack-a-hidden-risk-when-comparing-secrets/) — Timing attack patterns
- [GitHub prefixed-api-key](https://github.com/seamapi/prefixed-api-key) — Key prefix patterns

### Tertiary (LOW confidence)
- [sveltekit-rate-limiter](https://github.com/ciscoheat/sveltekit-rate-limiter) — Community library (not recommended for serverless)
- [svelte-api-keys](https://github.com/CaptainCodeman/svelte-api-keys) — Community example (reference only)

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
