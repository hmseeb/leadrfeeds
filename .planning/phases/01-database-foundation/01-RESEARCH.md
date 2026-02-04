# Phase 1: Database Foundation - Research

**Researched:** 2026-02-04
**Domain:** API key storage with SHA-256 hashing, prefix lookup, service role client isolation
**Confidence:** HIGH

## Summary

This phase establishes secure infrastructure for API key storage and validation. Research confirms the standard approach is a "prefix + hash" pattern: store a short prefix (first 8 characters) for efficient indexed lookup, store the SHA-256 hash of the full key for verification, and use timing-safe comparison to prevent timing attacks.

The key technical components are:
1. **Database table** with indexed prefix column and hash column (never plaintext)
2. **Service role Supabase client** isolated in `$lib/server/` directory (SvelteKit's server-only module pattern)
3. **SHA-256 hashing** via Web Crypto API (`crypto.subtle.digest`) - works in both Node.js and browser
4. **Timing-safe comparison** via `crypto.timingSafeEqual()` for hash verification

**Primary recommendation:** Create `api_keys` table with `key_prefix` (indexed, VARCHAR(8)) and `key_hash` (TEXT, SHA-256 hex) columns. Service role client lives in `$lib/server/supabase.ts`, importing `SUPABASE_SERVICE_ROLE_KEY` from `$env/static/private`.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | existing | Service role client for key validation | Already in project, supports service_role bypass of RLS |
| Web Crypto API | native | SHA-256 hashing | Built into Node.js and browsers, no external dependency |
| Node.js `crypto` | native | Timing-safe comparison | `timingSafeEqual()` is the standard constant-time comparison |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `$env/static/private` | SvelteKit | Service role key access | Import private env vars in server-only modules |
| `$lib/server/` | SvelteKit | Server code isolation | Prevent secrets leaking to browser bundle |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 | bcrypt | bcrypt is too slow for key lookup (250ms per hash vs <1ms) |
| Web Crypto | External library | Web Crypto is native, cross-platform, no dependencies |
| Supabase service role | Supabase anon + RPC | Service role is simpler, direct access without RLS hop |

**Installation:**
```bash
# No new packages needed - all tools are native or already installed
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
├── server/                    # Server-only modules (SvelteKit enforced)
│   ├── supabase.ts            # Service role client (bypasses RLS)
│   └── api-keys.ts            # Key validation utilities
├── services/
│   └── supabase.ts            # Existing anon client (browser-safe)
└── types/
    └── database.ts            # Add api_keys table types
```

### Pattern 1: Prefix + Hash Lookup
**What:** Store 8-character prefix for indexed lookup, full SHA-256 hash for verification
**When to use:** Always for API key storage
**Example:**
```typescript
// Source: https://zuplo.com/blog/2022/12/01/api-key-authentication
// Key generation (shown once to user)
const fullKey = `lf_${crypto.randomUUID().replace(/-/g, '')}`;
const prefix = fullKey.slice(0, 8);  // "lf_a3f8c"
const hash = await sha256(fullKey);   // Full SHA-256 hash

// Database stores: { prefix, key_hash, user_id, ... }
// User sees: lf_a3f8c2b1d4e5f6a7b8c9d0e1f2a3b4c5
```

### Pattern 2: Service Role Client Isolation
**What:** Separate Supabase client using service_role key, isolated in `$lib/server/`
**When to use:** Any operation requiring RLS bypass (key validation, admin operations)
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z
// $lib/server/supabase.ts - CANNOT be imported in browser code
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

export const supabaseAdmin = createClient<Database>(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);
```

### Pattern 3: Timing-Safe Hash Comparison
**What:** Use `crypto.timingSafeEqual()` to compare hashes, preventing timing attacks
**When to use:** Any comparison of secret values (hashes, tokens, keys)
**Example:**
```typescript
// Source: https://nodejs.org/en/docs/guides/security
import { timingSafeEqual } from 'crypto';

function verifyKeyHash(providedKey: string, storedHash: string): boolean {
  const providedHash = await sha256(providedKey);

  // Both must be same length for timingSafeEqual
  const a = Buffer.from(providedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

### Anti-Patterns to Avoid
- **Storing plaintext API keys:** Even "just for development" - hashes from day one
- **Using bcrypt/argon2 for API keys:** Too slow for lookup; use SHA-256
- **Service role in SSR client:** SSR clients share user sessions which override service_role
- **Using `===` for hash comparison:** Vulnerable to timing attacks
- **Importing service role client in browser code:** Leaks secret key

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom implementation | `crypto.subtle.digest('SHA-256', ...)` | Native, tested, cross-platform |
| Timing-safe compare | `===` comparison | `crypto.timingSafeEqual()` | Constant-time prevents timing attacks |
| Random key generation | `Math.random()` | `crypto.randomUUID()` or `crypto.getRandomValues()` | CSPRNG required for security |
| Hex encoding | Manual bitwise | `Buffer.toString('hex')` or `Uint8Array.toHex()` | Standard, tested |

**Key insight:** Cryptographic operations have subtle correctness requirements. Native implementations are audited; custom implementations often have timing leaks or edge cases.

## Common Pitfalls

### Pitfall 1: bcrypt for API Keys (Performance Disaster)
**What goes wrong:** Using bcrypt (designed for passwords) makes key lookup O(n) - must hash and compare against every key
**Why it happens:** Password best practices applied without understanding different access pattern
**How to avoid:** Use SHA-256 with prefix index. Lookup: `WHERE prefix = $1`, then timing-safe compare hash
**Warning signs:** Auth latency increases as keys accumulate; database scans on every request

### Pitfall 2: Service Role Overridden by User Session
**What goes wrong:** SSR client initialized with service_role has user session applied, which overrides service role privileges
**Why it happens:** SSR clients share session from cookies; the session's JWT replaces the Authorization header
**How to avoid:** Create a SEPARATE client for service_role operations using plain `@supabase/supabase-js`, not the SSR helper
**Warning signs:** RLS errors when using what you thought was service_role client

### Pitfall 3: Timing Attack via String Comparison
**What goes wrong:** Using `===` for hash comparison leaks timing information; attackers can guess keys character-by-character
**Why it happens:** `===` short-circuits on first different character, adding microseconds per matching char
**How to avoid:** Always use `crypto.timingSafeEqual()` for secret comparisons
**Warning signs:** Security audit flags; no import of `timingSafeEqual` in auth code

### Pitfall 4: Importing Server Code in Browser
**What goes wrong:** Service role key ends up in browser bundle
**Why it happens:** Forgetting to use `$lib/server/` or `.server.ts` naming
**How to avoid:** Place all service role code in `$lib/server/` directory; SvelteKit will error on accidental import
**Warning signs:** Build succeeds but key visible in client bundle; SvelteKit shows import chain error

### Pitfall 5: Non-Indexed Prefix Lookup
**What goes wrong:** Prefix lookups still scan full table because no index exists
**Why it happens:** Adding column without index; assuming PostgreSQL auto-indexes
**How to avoid:** Explicitly create index: `CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix)`
**Warning signs:** EXPLAIN shows Seq Scan instead of Index Scan

## Code Examples

Verified patterns from official sources:

### SHA-256 Hashing (Web Crypto API)
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
// Works in Node.js (18+), Deno, browsers, Cloudflare Workers

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
```

### Timing-Safe Hash Comparison
```typescript
// Source: https://nodejs.org/en/docs/guides/security
import { timingSafeEqual } from 'crypto';

export function secureCompareHashes(hash1: string, hash2: string): boolean {
  const buf1 = Buffer.from(hash1, 'hex');
  const buf2 = Buffer.from(hash2, 'hex');

  // timingSafeEqual requires same length
  if (buf1.length !== buf2.length) {
    return false;
  }

  return timingSafeEqual(buf1, buf2);
}
```

### API Key Generation
```typescript
// Source: https://www.codegenes.net/blog/what-s-the-best-approach-for-generating-a-new-api-key/
export function generateApiKey(): { fullKey: string; prefix: string } {
  // Use CSPRNG for secure random generation
  const randomPart = crypto.randomUUID().replace(/-/g, '');
  const fullKey = `lf_${randomPart}`;  // lf_ prefix for LeadrFeeds
  const prefix = fullKey.slice(0, 8);   // First 8 chars for lookup

  return { fullKey, prefix };
}
```

### Service Role Client (SvelteKit)
```typescript
// Source: https://svelte.dev/docs/kit/server-only-modules
// File: $lib/server/supabase.ts

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/dynamic/public';
import type { Database } from '$lib/types/database';

// This client BYPASSES RLS - use only for admin operations
export const supabaseAdmin = createClient<Database>(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

### Database Schema (SQL)
```sql
-- Source: https://makerkit.dev/blog/tutorials/supabase-api-key-management

-- API keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  key_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for O(1) prefix lookup
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- Index for user's keys listing
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys (for UI listing)
CREATE POLICY "Users can view own keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own keys
CREATE POLICY "Users can create own keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own keys (revoke)
CREATE POLICY "Users can update own keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypasses all RLS for key validation
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt for API keys | SHA-256 + prefix | Industry standard | O(1) lookup vs O(n) |
| Manual secret compare | `timingSafeEqual()` | Node 6 (2016) | Prevents timing attacks |
| Importing secrets in components | `$lib/server/` isolation | SvelteKit 1.0 | Build-time prevention |
| Single Supabase client | Separate anon + service_role | Supabase SSR patterns | Prevents session override |

**Deprecated/outdated:**
- Using `env.SUPABASE_SERVICE_ROLE_KEY` directly: Use `$env/static/private` module
- `.server.js` in components: Place in `$lib/server/` directory for clarity

## Open Questions

Things that couldn't be fully resolved:

1. **Key expiration check in database vs middleware**
   - What we know: Both approaches work; database check is slightly more efficient
   - What's unclear: Whether to add RPC function or check in middleware
   - Recommendation: Start with middleware check; can add RPC later for optimization

2. **Key metadata storage (IP, user agent)**
   - What we know: Useful for security auditing
   - What's unclear: Privacy implications, storage cost
   - Recommendation: Defer to Phase 8 (Key Management UI) - not required for Phase 1

## Sources

### Primary (HIGH confidence)
- [MDN SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) - SHA-256 hashing API
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security) - timingSafeEqual usage
- [SvelteKit Server-Only Modules](https://svelte.dev/docs/kit/server-only-modules) - $lib/server isolation
- [Supabase Service Role Troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) - Client isolation patterns

### Secondary (MEDIUM confidence)
- [Makerkit Supabase API Key Management](https://makerkit.dev/blog/tutorials/supabase-api-key-management) - Complete implementation pattern
- [API Key Authentication Best Practices - Zuplo](https://zuplo.com/blog/2022/12/01/api-key-authentication) - Prefix + hash pattern
- [PostgreSQL B-Tree Index Performance](https://naveenkumar-c.medium.com/indexing-on-prefix-searches-using-like-in-postgresql-277f034a87a7) - Index optimization

### Tertiary (LOW confidence)
- None - all findings verified with authoritative sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - native APIs, official documentation
- Architecture: HIGH - SvelteKit official patterns, Supabase official troubleshooting
- Pitfalls: HIGH - verified in prior PITFALLS.md research with multiple sources

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, no expected changes)
