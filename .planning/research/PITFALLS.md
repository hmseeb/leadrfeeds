# Domain Pitfalls: API Key Authentication and Rate Limiting

**Domain:** Public read-only REST API with API key authentication
**Context:** Adding API layer to existing SvelteKit + Supabase RSS reader
**Researched:** 2026-02-04
**Overall Confidence:** HIGH (verified via multiple authoritative sources)

---

## Critical Pitfalls

Mistakes that cause security breaches, data leaks, or require significant rewrites.

---

### Pitfall 1: Storing API Keys in Plaintext

**What goes wrong:** API keys are stored unhashed in the database. A database breach exposes all user API keys, allowing attackers to impersonate any user.

**Why it happens:** Developers treat API keys like usernames (identifiers) rather than passwords (secrets). The "just hash it later" mindset leads to shipping plaintext storage.

**Consequences:**
- Database breach = complete API compromise
- No ability to rotate keys without invalidating all access
- Regulatory/compliance violations

**Prevention:**
- Hash API keys using SHA-256 before storage (not bcrypt - see Pitfall 2)
- Only show the full key once at creation time
- Store a non-sensitive prefix (first 8 chars) for identification/lookup
- Implement the "short token + long token" pattern: prefix for lookup, hash of remainder for authentication

**Detection (warning signs):**
- Database column type is `varchar` without a "hash" naming convention
- Key can be retrieved and displayed to user after creation
- No one-way transformation in the insert query

**Phase to address:** Database Schema phase - must be designed correctly from the start

**Sources:**
- [Hashing API Keys To Improve Security - Octopus](https://octopus.com/blog/hashing-api-keys)
- [API Key Authentication Best Practices - Zuplo](https://zuplo.com/blog/2022/12/01/api-key-authentication)
- [How we implemented API keys - prefix.dev](https://prefix.dev/blog/how_we_implented_api_keys)

---

### Pitfall 2: Using bcrypt for API Key Hashing (Lookup Performance)

**What goes wrong:** Using bcrypt (designed for passwords) makes API key lookup O(n) - you must hash and compare against every key in the database. With 500+ keys, authentication takes seconds.

**Why it happens:** Password hashing best practices (bcrypt, argon2) are applied without understanding the different access pattern. Passwords are looked up by username first; API keys ARE the lookup key.

**Consequences:**
- API latency grows linearly with number of keys
- Database load increases per request
- Potential denial of service as keys accumulate

**Prevention:**
- Use SHA-256 for the hash (fast, deterministic)
- Store a prefix (e.g., first 8 chars of the key) for indexed lookup
- Pattern: `SELECT * FROM api_keys WHERE prefix = $1 AND key_hash = SHA256($2)`
- The prefix is indexed, narrowing the search; SHA-256 hash comparison is fast

**Detection:**
- Authentication endpoint response time increases over time
- Database queries scanning full `api_keys` table
- bcrypt/argon2 functions in key verification code

**Phase to address:** Database Schema phase - lookup pattern must be designed upfront

**Sources:**
- [API Key Authentication Best Practices - Zuplo](https://zuplo.com/blog/2022/12/01/api-key-authentication)
- [GitHub - prefixed-api-key](https://github.com/seamapi/prefixed-api-key)

---

### Pitfall 3: Timing Attacks on API Key Comparison

**What goes wrong:** Using standard string comparison (`===` or `==`) for API key validation. Attackers can guess keys character-by-character by measuring response times.

**Why it happens:** Standard string comparison short-circuits on first difference. Each matching character adds microseconds to response time - enough for statistical analysis.

**Consequences:**
- A 32-character key can be cracked with thousands of requests instead of 10^38 brute force attempts
- Shared hosting (same cloud region) makes attack more practical
- Rate limiting alone doesn't prevent it (attack works over time)

**Prevention:**
- Use constant-time comparison: `crypto.timingSafeEqual()` in Node.js
- Compare hashes, not raw keys (hashing adds consistent overhead)
- Ensure both compared values have the same length before comparison
- Add rate limiting as defense-in-depth (but don't rely on it alone)

**Detection:**
- Code review shows `===` or `==` on sensitive strings
- No import of `crypto.timingSafeEqual` or equivalent library
- Security audit flags timing vulnerability

**Phase to address:** API Authentication Middleware phase

**Sources:**
- [Timing Attack - A Hidden Risk When Comparing Secrets](https://dev.ngockhuong.com/posts/timing-attack-a-hidden-risk-when-comparing-secrets/)
- [vLLM Timing Attack Vulnerability - GitHub Advisory](https://github.com/vllm-project/vllm/security/advisories/GHSA-wr9h-g72x-mwhm)
- [GitHub - safe-compare](https://github.com/Bruce17/safe-compare)

---

### Pitfall 4: Inconsistent Authentication Across Routes

**What goes wrong:** New API routes don't go through authentication middleware. Some endpoints are accidentally public. Adding routes later bypasses auth checks.

**Why it happens:** SvelteKit's file-based routing means each `+server.ts` must explicitly check auth. No global middleware enforcement. Copy-paste errors omit auth checks.

**Consequences:**
- Data exposed without authentication
- Different endpoints have different security postures
- Security audits find inconsistent protection

**Prevention:**
- Use SvelteKit hooks (`hooks.server.ts`) as centralized auth middleware
- Pattern: All `/api/*` routes pass through a single `handle` function that validates API keys
- Fail closed: Routes without explicit public marking are protected by default
- Write integration tests that verify auth is required on all endpoints

**Detection:**
- Auth check code duplicated in multiple `+server.ts` files
- New endpoint added without auth test
- Security scanner finds unauthenticated endpoints

**Phase to address:** API Route Architecture phase - establish pattern before adding endpoints

**Sources:**
- [Auth.js | SvelteKit](https://authjs.dev/reference/sveltekit)
- [Implement JWT Authentication in SvelteKit API Routes](https://codevoweb.com/implement-jwt-authentication-in-sveltekit-api-routes/)
- [Protecting SvelteKit routes - DEV Community](https://dev.to/thiteago/protecting-sveltekit-routes-from-unauthenticated-users-nb9)

---

### Pitfall 5: Race Conditions in Rate Limiting

**What goes wrong:** Rate limiting logic reads count, increments, then writes. Concurrent requests slip through between read and write. 10 requests arrive simultaneously, all see "0 requests used."

**Why it happens:** "Read-then-write" pattern seems correct but isn't atomic. Database transactions don't help if check and increment are separate queries.

**Consequences:**
- Rate limits exceeded, sometimes significantly (10x or more)
- Burst attacks succeed against "protected" endpoints
- Database overload despite rate limiting

**Prevention:**
- Use atomic operations: Redis `INCR` or PostgreSQL `UPDATE ... RETURNING`
- For Redis: Use Lua scripts that combine check-and-increment atomically
- For Supabase/PostgreSQL: Single query pattern:
  ```sql
  UPDATE rate_limits
  SET count = count + 1, last_request = now()
  WHERE key_id = $1 AND count < $max_limit
  RETURNING count
  ```
- If RETURNING gives no rows, limit was exceeded

**Detection:**
- Rate limit check and increment are separate queries
- Logs show more requests than limit should allow
- Load testing with concurrent requests bypasses limits

**Phase to address:** Rate Limiting Implementation phase

**Sources:**
- [Race Condition Solution - No Locks for Rate Limiting with Redis](https://medium.com/@lordmoma/race-condition-solution-no-locks-for-rate-limiting-with-redis-bac0f071872e)
- [How to Build a Distributed Rate Limiting System Using Redis and Lua Scripts](https://www.freecodecamp.org/news/build-rate-limiting-system-using-redis-and-lua/)
- [Design a Distributed Rate Limiter - Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/distributed-rate-limiter)

---

### Pitfall 6: Information Leakage in Error Responses

**What goes wrong:** Error messages reveal system internals - stack traces, database errors, file paths, library versions. Attackers use this for reconnaissance.

**Why it happens:** Development error handling goes to production. Catching errors and returning them verbatim. Different error codes for "user not found" vs "wrong password."

**Consequences:**
- Attackers learn tech stack, versions, and architecture
- User enumeration via different error messages
- SQL/injection vulnerabilities revealed by error text

**Prevention:**
- Generic public errors: "Authentication failed" not "Invalid API key format"
- Same response for "key not found" and "key invalid" (prevents enumeration)
- Log detailed errors server-side, return sanitized errors to clients
- Use RFC 7807 "Problem Details" format for consistent structure
- Strip stack traces in production builds

**Detection:**
- Error responses contain "at line X" or file paths
- Different HTTP status codes for similar auth failures
- Error messages mention specific database columns or tables

**Phase to address:** API Response Design phase - establish error handling patterns early

**Sources:**
- [Error Handling - OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [REST API Security Best Practices - Levo](https://www.levo.ai/resources/blogs/rest-api-security-best-practices)
- [How to Handle and Return Errors in a REST API - Treblle](https://treblle.com/blog/rest-api-error-handling)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### Pitfall 7: Key Revocation Without Grace Period

**What goes wrong:** Revoking a key immediately breaks all integrations using it. Users accidentally revoke active keys. No "soft delete" option.

**Why it happens:** Simple implementation: DELETE FROM api_keys. No consideration for external systems that may be mid-request or scheduled.

**Consequences:**
- User's automation breaks unexpectedly
- Support tickets from confused users
- No way to "undo" accidental revocation

**Prevention:**
- Implement "revoked_at" timestamp instead of DELETE
- Grace period: Key returns warnings for 24 hours before full revocation
- Or: Two-step revocation (disable then delete after confirmation)
- Return clear error message explaining key was revoked (not just "unauthorized")

**Detection:**
- No "disabled" or "revoked" status on keys, only EXISTS/NOT EXISTS
- User can't undo key deletion
- Integrations fail silently after key revocation

**Phase to address:** Key Management UI phase

**Sources:**
- [How to Become Great at API Key Rotation - GitGuardian](https://blog.gitguardian.com/api-key-rotation-best-practices/)
- [API Key Management Best Practices - APIdog](https://apidog.com/blog/api-key-management-best-practices/)

---

### Pitfall 8: Missing Key Rotation Support

**What goes wrong:** Users can't rotate keys without downtime. Old key stops working before new key is deployed. No overlap period.

**Why it happens:** "Users can just create a new key and delete the old one" seems sufficient. Doesn't account for deployment lag in external systems.

**Consequences:**
- Users avoid rotation because it causes downtime
- Compromised keys stay active longer than necessary
- Compliance requirements for rotation can't be met

**Prevention:**
- Allow multiple active keys per user
- Rotation flow: Create new key -> Deploy to systems -> Revoke old key
- Optional: Built-in rotation with overlap period (both keys valid for X days)
- Document the rotation process explicitly

**Detection:**
- Schema allows only one key per user
- No guidance on key rotation in documentation
- Users asking "how do I rotate without downtime?"

**Phase to address:** Database Schema phase (allow multiple keys) + Documentation phase

**Sources:**
- [How to Become Great at API Key Rotation - GitGuardian](https://blog.gitguardian.com/api-key-rotation-best-practices/)
- [Hardening OAuth Tokens - Clutch Events](https://www.clutchevents.co/resources/hardening-oauth-tokens-in-api-security-token-expiry-rotation-and-revocation-best-practices)

---

### Pitfall 9: Fixed Window Rate Limiting Burst Attack

**What goes wrong:** Rate limit resets at fixed intervals (e.g., every minute at :00). Attacker sends 100 requests at 0:59, then 100 more at 1:01 - 200 requests in 2 seconds.

**Why it happens:** Fixed windows are simplest to implement. "100 requests per minute" implemented as counter that resets at minute boundaries.

**Consequences:**
- 2x the intended rate at window boundaries
- Burst traffic can still overwhelm database
- Attackers can predict exactly when limits reset

**Prevention:**
- Sliding window: Track requests in rolling time period
- Token bucket or leaky bucket algorithms
- Or: Fixed window with smaller intervals (per-second instead of per-minute)
- For Supabase: Store request timestamps, count requests in trailing window

**Detection:**
- Rate limit counter has a "reset_at" time
- Traffic spikes at predictable intervals
- Load tests show higher throughput than expected limit

**Phase to address:** Rate Limiting Implementation phase

**Sources:**
- [API Rate Limiting - Testfully](https://testfully.io/blog/api-rate-limit/)
- [Rate Limiting Best Practices - Cloudflare](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

---

### Pitfall 10: API Keys Passed in URL Query Parameters

**What goes wrong:** Keys in URLs get logged in server access logs, browser history, referrer headers, and proxy logs. Keys leak everywhere.

**Why it happens:** Simpler for testing: `curl https://api.example.com/feeds?key=xxx`. Easier to document. Some legacy APIs do it this way.

**Consequences:**
- Keys in server logs (potentially shared with third parties)
- Keys in browser history (on shared computers)
- Keys leaked via Referrer header to external links
- Cached by CDNs and proxies

**Prevention:**
- Always pass keys in `Authorization` header: `Authorization: Bearer lf_xxx`
- Or custom header: `X-API-Key: lf_xxx`
- Return 400 Bad Request if key detected in query string
- Document header-only authentication explicitly

**Detection:**
- API accepts `?api_key=` parameter
- Example code shows URL with key
- Grep access logs for API key patterns

**Phase to address:** API Route Architecture phase - establish from first endpoint

**Sources:**
- [API Keys: Weaknesses and security best practices - TechTarget](https://www.techtarget.com/searchsecurity/tip/API-keys-Weaknesses-and-security-best-practices)
- [API Key Security Best Practices - Legit Security](https://www.legitsecurity.com/aspm-knowledge-base/api-key-security-best-practices)

---

### Pitfall 11: No Prefix on API Keys (Identification Difficulty)

**What goes wrong:** Keys are random strings like `a3f8c2...`. Users can't identify which service a key belongs to. Leaked keys can't be traced. Scanners can't detect them.

**Why it happens:** Generated UUIDs or random strings seem sufficient. No consideration for key lifecycle management.

**Consequences:**
- Leaked key in logs/repos hard to identify as "LeadrFeeds key"
- GitHub secret scanning can't flag service-specific patterns
- Users mix up keys from different services
- Support can't help identify which key was compromised

**Prevention:**
- Prefix all keys with identifiable string: `lf_` or `leadrfeeds_`
- Format: `{prefix}_{random}` e.g., `lf_a3f8c2b1d4e5...`
- Register prefix pattern with GitHub secret scanning
- Include environment indicator if needed: `lf_live_` vs `lf_test_`

**Detection:**
- Keys are plain UUIDs or random strings
- No way to identify key source from the string
- Users asking "what service is this key for?"

**Phase to address:** Key Generation Implementation phase

**Sources:**
- [Best practices for building secure API Keys - freeCodeCamp](https://www.freecodecamp.org/news/best-practices-for-building-api-keys-97c26eabfea9/)
- [How we implemented API keys - prefix.dev](https://prefix.dev/blog/how_we_implented_api_keys)
- [GitHub - prefixed-api-key](https://github.com/seamapi/prefixed-api-key)

---

## Minor Pitfalls

Mistakes that cause annoyance or require small fixes.

---

### Pitfall 12: Missing Rate Limit Headers

**What goes wrong:** Clients don't know their rate limit status. They hit limits unexpectedly. No way to implement backoff without trial and error.

**Why it happens:** Rate limiting implemented server-side only. Response just returns 429 without context.

**Consequences:**
- Poor developer experience
- Clients waste requests discovering limits
- No proactive throttling possible

**Prevention:**
- Include standard headers on all responses:
  - `X-RateLimit-Limit`: Max requests allowed
  - `X-RateLimit-Remaining`: Requests left in window
  - `X-RateLimit-Reset`: Unix timestamp when window resets
- Include `Retry-After` header on 429 responses

**Detection:**
- 429 response has no headers explaining when to retry
- API documentation doesn't mention rate limits
- Clients polling to discover limits

**Phase to address:** Rate Limiting Implementation phase

**Sources:**
- [Rate Limiting Best Practices in REST API Design - Speakeasy](https://www.speakeasy.com/api-design/rate-limiting)
- [API Rate Limiting Explained - Postman](https://blog.postman.com/what-is-api-rate-limiting/)

---

### Pitfall 13: Incomplete Error Status Codes

**What goes wrong:** All errors return 400 or 500. Clients can't distinguish between "bad request", "unauthorized", "rate limited", and "server error".

**Why it happens:** Quick implementation catches all errors and returns generic status. No error categorization.

**Consequences:**
- Clients can't implement proper retry logic
- "Unauthorized" looks like "server error"
- Debugging becomes guesswork

**Prevention:**
- 400: Malformed request (bad JSON, missing required field)
- 401: Missing or invalid API key
- 403: Valid key but insufficient permissions (if implementing scopes)
- 404: Resource not found
- 429: Rate limit exceeded
- 500: Unexpected server error (should be rare)

**Detection:**
- Single catch block returns same status for all errors
- Clients unable to distinguish error types
- Logs show 500 for auth failures

**Phase to address:** API Response Design phase

---

### Pitfall 14: No Key Labels/Descriptions

**What goes wrong:** Users create multiple keys but can't remember what each is for. Keys named "API Key 1", "API Key 2". Confusion about which to revoke.

**Why it happens:** Schema only has key_hash and user_id. No metadata fields.

**Consequences:**
- Users revoke wrong key
- Can't audit which integration uses which key
- Support requests about key identification

**Prevention:**
- Allow user-defined label/name for each key
- Optional description field
- Show "last used" timestamp for each key
- Default label to creation date if not provided

**Detection:**
- Keys displayed as truncated hashes only
- No way to name or describe keys
- Users asking "which key is which?"

**Phase to address:** Database Schema phase + Key Management UI phase

---

### Pitfall 15: API Documentation Staleness

**What goes wrong:** Documentation written at launch, never updated. New endpoints undocumented. Changed response formats not reflected. Examples use deprecated patterns.

**Why it happens:** Documentation treated as one-time task. No process for keeping docs in sync with code. Separate docs repo from code.

**Consequences:**
- Developers integrate with outdated information
- Support burden increases
- Trust in API decreases

**Prevention:**
- OpenAPI/Swagger spec generated from code annotations
- Documentation tests that verify examples work
- Changelog for API changes
- Version documentation alongside code

**Detection:**
- Docs in separate repository from code
- No mention of recent features in docs
- Example code doesn't work

**Phase to address:** Documentation phase - establish generation process early

**Sources:**
- [10 Common Developer Documentation Mistakes to Avoid - Document360](https://document360.com/blog/developer-documentation-mistakes/)
- [Most Frequent Mistakes to Avoid in API Documentation - Archbee](https://www.archbee.com/blog/api-documentation-mistakes)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|----------------|------------|
| Database Schema | Plaintext key storage (P1) | Design hash + prefix pattern from start |
| Database Schema | bcrypt for key hashing (P2) | Use SHA-256 + prefix index |
| Database Schema | Single key per user (P8) | Allow multiple active keys |
| Database Schema | No metadata fields (P14) | Add label, description, last_used |
| Key Generation | No key prefix (P11) | Format: `lf_{random}` |
| API Route Architecture | Inconsistent auth (P4) | Centralized hooks.server.ts handler |
| API Route Architecture | Keys in URL (P10) | Header-only authentication |
| API Authentication | Timing attacks (P3) | crypto.timingSafeEqual() |
| Rate Limiting | Race conditions (P5) | Atomic UPDATE...RETURNING |
| Rate Limiting | Fixed window burst (P9) | Sliding window algorithm |
| Rate Limiting | No headers (P12) | X-RateLimit-* headers |
| API Response Design | Information leakage (P6) | Generic errors, RFC 7807 |
| API Response Design | Wrong status codes (P13) | Proper HTTP status mapping |
| Key Management UI | Immediate revocation (P7) | Grace period or soft delete |
| Documentation | Staleness (P15) | Generate from code, test examples |

---

## Supabase-Specific Considerations

Since LeadrFeeds uses Supabase, these additional considerations apply:

### RLS for API Keys Table
- The `api_keys` table MUST have RLS enabled
- Policy: Users can only see/manage their own keys
- Service role for key validation in API routes

### Edge Functions vs SvelteKit Routes
- If using Supabase Edge Functions: Auth middleware is different pattern
- If using SvelteKit `+server.ts`: Use hooks for centralized auth
- Recommendation: SvelteKit routes for consistency with existing codebase

### Rate Limiting Storage
- Option 1: Supabase table with atomic updates
- Option 2: Supabase Edge Function with built-in rate limiting
- Option 3: External service (Upstash Redis) for high-volume
- Recommendation for MVP: Supabase table, simple sliding window

**Source:** [Securing your API - Supabase Docs](https://supabase.com/docs/guides/api/securing-your-api)

---

## Summary: Top 5 Pitfalls by Impact

1. **Plaintext key storage** - Security breach exposes all users
2. **Timing attacks** - Keys can be guessed character-by-character
3. **Inconsistent auth** - Endpoints accidentally public
4. **Race conditions in rate limiting** - Limits bypassed
5. **Information leakage** - Errors reveal system internals

Address these in their respective phases. The schema decisions (1, 2) must be correct from the start - they're expensive to change later.

---

*Research completed: 2026-02-04*
*Confidence: HIGH - findings verified across multiple authoritative sources*
