# Phase 8: Key Management UI - Research

**Researched:** 2026-02-05
**Domain:** Svelte 5 UI Components / API Key Management UX
**Confidence:** HIGH

## Summary

This phase builds user-facing UI for API key management within the existing SvelteKit settings page. The backend infrastructure (api_keys table, generation/hashing utilities, validation) already exists from Phase 1. This research focuses on UI patterns, Svelte 5 component architecture, and security UX best practices.

The existing codebase already has well-established patterns for modals (ConfirmModal.svelte, SuggestFeedModal.svelte), form handling with Svelte 5 runes ($state, $derived, $bindable), and Supabase client usage. The settings page at `/routes/settings/+page.svelte` provides the integration point. The project uses date-fns v4.1.0 for date manipulation, Tailwind CSS for styling, and lucide-svelte for icons.

**Primary recommendation:** Build a new API Keys management section in the existing settings page using established component patterns (modals, cards), with a server endpoint for key creation that returns the full key once, then stores only the hash.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| svelte | ^5.41.0 | UI framework with runes | Project standard |
| @supabase/supabase-js | ^2.80.0 | Database client | Project standard |
| date-fns | ^4.1.0 | Date formatting/manipulation | Already installed, lightweight |
| lucide-svelte | ^0.553.0 | Icons | Project standard |
| tailwindcss | ^3.4.18 | Styling | Project standard |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing modal components | N/A | ConfirmModal, dialog patterns | Confirmation flows |
| Existing form patterns | N/A | Input, button styling | Form fields |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| date-fns | Native Date | date-fns already installed, better formatting |
| Custom date picker | shadcn-svelte DatePicker | Adds dependency - use native input[type="date"] instead |
| Server action | Form action | Server endpoint clearer for key creation flow |

**Installation:**
```bash
# No new dependencies required - all needed libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
├── routes/
│   ├── settings/
│   │   ├── +page.svelte           # Add API Keys section here
│   │   └── api-keys/
│   │       └── +server.ts         # POST: create key, DELETE: revoke key
│   └── api/v1/...                 # Existing API routes (unchanged)
├── lib/
│   ├── components/
│   │   └── ApiKeyModal.svelte     # Create key modal (shows key once)
│   ├── server/
│   │   └── api-keys.ts            # Existing utilities (Phase 1)
│   └── types/
│       └── database.ts            # api_keys types (already exists)
```

### Pattern 1: Server Endpoint for Key Creation
**What:** Use a SvelteKit server endpoint (+server.ts) instead of direct Supabase calls from the client
**When to use:** Any operation requiring service role (RLS bypass) or secrets (key generation)
**Why:** Key generation and hashing must happen server-side; full key should never be stored

```typescript
// Source: Existing codebase pattern (routes/api/v1/feeds/+server.ts)
// app/src/routes/settings/api-keys/+server.ts
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { generateApiKey, sha256 } from '$lib/server/api-keys';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
  // Get user from session (not API auth - this is web UI)
  const supabase = getSupabaseAdmin();

  // Get authenticated user from request
  const { data: { user } } = await supabase.auth.getUser(
    request.headers.get('Authorization')?.replace('Bearer ', '') || ''
  );

  if (!user) {
    throw error(401, 'Unauthorized');
  }

  const { label, expires_at } = await request.json();

  // Generate key and hash
  const { fullKey, prefix } = generateApiKey();
  const keyHash = await sha256(fullKey);

  // Store hash only
  const { data, error: dbError } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      label,
      key_prefix: prefix,
      key_hash: keyHash,
      expires_at: expires_at || null
    })
    .select('id, label, key_prefix, expires_at, created_at')
    .single();

  if (dbError) throw error(500, 'Failed to create key');

  // Return full key ONCE - never stored, never retrievable
  return json({
    ...data,
    full_key: fullKey  // Only time this is returned
  });
};
```

### Pattern 2: "Show Once" Modal with Copy
**What:** Modal that displays the full key exactly once with prominent copy functionality
**When to use:** Immediately after key creation
**Why:** Industry standard security pattern - keys stored as hashes cannot be recovered

```svelte
<!-- Source: Based on existing SuggestFeedModal.svelte pattern -->
<script lang="ts">
  import { Copy, Check, AlertTriangle } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    apiKey: string;
    onClose: () => void;
  }

  let { isOpen = $bindable(), apiKey, onClose }: Props = $props();
  let copied = $state(false);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(apiKey);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div class="bg-card border-2 border-border p-6 max-w-lg mx-4">
      <div class="flex items-center gap-2 text-secondary mb-4">
        <AlertTriangle size={20} />
        <span class="font-semibold">Save your API key now</span>
      </div>

      <p class="text-sm text-muted-foreground mb-4">
        This key will only be shown once. Copy it now and store it securely.
      </p>

      <div class="flex items-center gap-2 bg-background border border-border p-3 font-mono text-sm">
        <code class="flex-1 break-all">{apiKey}</code>
        <button onclick={copyToClipboard} class="p-2 hover:bg-accent rounded">
          {#if copied}
            <Check size={18} class="text-green-500" />
          {:else}
            <Copy size={18} />
          {/if}
        </button>
      </div>

      <button
        onclick={onClose}
        class="mt-4 w-full px-4 py-2 bg-primary text-primary-foreground"
      >
        I've saved my key
      </button>
    </div>
  </div>
{/if}
```

### Pattern 3: Key List with Status Indicators
**What:** Table/card list showing keys with visual status (active, expired, revoked)
**When to use:** Main API keys section in settings
**Why:** Users need to manage multiple keys with clear status visibility

```svelte
<!-- Source: Existing settings card pattern -->
{#each keys as key}
  <div class="flex items-center justify-between p-4 border-b border-border">
    <div>
      <div class="font-medium text-foreground">{key.label}</div>
      <div class="text-sm text-muted-foreground">
        {key.key_prefix}... | Created {formatDate(key.created_at)}
      </div>
    </div>

    <div class="flex items-center gap-3">
      <!-- Status badge -->
      {#if key.revoked_at}
        <span class="px-2 py-1 text-xs bg-destructive/10 text-destructive rounded">
          Revoked
        </span>
      {:else if key.expires_at && new Date(key.expires_at) < new Date()}
        <span class="px-2 py-1 text-xs bg-secondary/10 text-secondary rounded">
          Expired
        </span>
      {:else}
        <span class="px-2 py-1 text-xs bg-green-500/10 text-green-500 rounded">
          Active
        </span>
      {/if}

      <!-- Last used -->
      {#if key.last_used_at}
        <span class="text-xs text-muted-foreground">
          Last used {formatRelative(key.last_used_at)}
        </span>
      {/if}

      <!-- Revoke button -->
      {#if !key.revoked_at}
        <button onclick={() => confirmRevoke(key)} class="text-destructive">
          Revoke
        </button>
      {/if}
    </div>
  </div>
{/each}
```

### Pattern 4: Svelte 5 Form State Management
**What:** Use $state for form fields, $derived for validation
**When to use:** Create key form
**Why:** Clean reactive state without stores, matches existing codebase patterns

```svelte
<script lang="ts">
  let label = $state('');
  let expiresAt = $state<string | null>(null);
  let creating = $state(false);
  let error = $state('');

  const isValid = $derived(label.trim().length > 0);

  async function createKey() {
    if (!isValid) return;
    creating = true;
    error = '';

    try {
      const response = await fetch('/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          expires_at: expiresAt
        })
      });

      if (!response.ok) throw new Error('Failed to create key');

      const { full_key } = await response.json();
      // Show "save key" modal with full_key
    } catch (e) {
      error = e.message;
    } finally {
      creating = false;
    }
  }
</script>
```

### Anti-Patterns to Avoid
- **Storing full API key anywhere:** Never store, log, or cache the full key after creation
- **Client-side key generation:** Always generate on server with CSPRNG
- **Direct Supabase calls for key operations:** Use server endpoints that can access service role
- **Showing key multiple times:** Once created, key is unrecoverable (by design)
- **Complex date picker library:** Use native input[type="date"] - sufficient for expiration dates

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting | String manipulation | date-fns format/formatRelative | Already installed, handles edge cases |
| Clipboard copy | execCommand | navigator.clipboard.writeText | Modern API, works in all browsers |
| Confirmation dialogs | Custom modal | ConfirmModal.svelte | Already exists in codebase |
| Loading states | Custom spinner | existing patterns + Tailwind animate-spin | Consistent with codebase |
| Status badges | Custom styling | Existing badge patterns | Matches design system |

**Key insight:** The codebase already has modal, form, and card patterns. Reuse them rather than inventing new UI paradigms.

## Common Pitfalls

### Pitfall 1: Exposing Full Key After Creation
**What goes wrong:** Storing or returning full key on subsequent requests
**Why it happens:** Seems convenient to let users "see" their key again
**How to avoid:** Server endpoint returns full_key only on POST; database stores only hash
**Warning signs:** Any GET endpoint returning full key; any database column for unhashed key

### Pitfall 2: Client-Side Supabase for Key Operations
**What goes wrong:** Using browser Supabase client which respects RLS
**Why it happens:** Habit from other parts of the app
**How to avoid:** All key CRUD goes through server endpoints using getSupabaseAdmin()
**Warning signs:** Import of `$lib/services/supabase` (anon client) in key-related code

### Pitfall 3: Missing Session Validation on Server Endpoint
**What goes wrong:** Endpoint doesn't verify user is authenticated
**Why it happens:** Confusing session auth with API key auth
**How to avoid:** Server endpoint must check user session (not API key - that's for /api/v1/*)
**Warning signs:** Endpoint accepts requests without checking logged-in user

### Pitfall 4: Forgetting to Handle Revoked/Expired Keys in UI
**What goes wrong:** All keys look the same, users can't tell which are active
**Why it happens:** Only thinking about "happy path" of active keys
**How to avoid:** Status badges, disabled revoke buttons, clear visual hierarchy
**Warning signs:** No conditional rendering based on revoked_at/expires_at

### Pitfall 5: Not Using Bindable for Modal State
**What goes wrong:** Modal doesn't close properly, state gets out of sync
**Why it happens:** Missing $bindable on isOpen prop
**How to avoid:** Use `isOpen = $bindable()` pattern from existing modals
**Warning signs:** Modal stays open after action, parent state not updated

### Pitfall 6: Date Input Timezone Issues
**What goes wrong:** Expiration date off by a day
**Why it happens:** input[type="date"] returns local date, stored as UTC
**How to avoid:** Parse as date-only, set to end of day UTC for expiration
**Warning signs:** Keys expiring at midnight when user expected end of day

## Code Examples

Verified patterns from official sources and existing codebase:

### Clipboard API
```typescript
// Source: MDN Web Docs - modern async clipboard API
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}
```

### Date Formatting with date-fns
```typescript
// Source: date-fns documentation
import { format, formatDistanceToNow, parseISO } from 'date-fns';

// Display creation date
format(parseISO(key.created_at), 'MMM d, yyyy');
// => "Feb 5, 2026"

// Display relative time for last_used_at
formatDistanceToNow(parseISO(key.last_used_at), { addSuffix: true });
// => "2 hours ago"

// Check if expired
const isExpired = key.expires_at && parseISO(key.expires_at) < new Date();
```

### Session Authentication in Server Endpoint
```typescript
// Source: Existing pattern from codebase, adapted for session auth
import { getSupabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const supabase = getSupabaseAdmin();

  // For web UI, get session from cookies (not API key)
  const accessToken = cookies.get('sb-access-token');
  const refreshToken = cookies.get('sb-refresh-token');

  if (!accessToken) {
    throw error(401, 'Not authenticated');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    throw error(401, 'Invalid session');
  }

  // Now proceed with user.id for operations
};
```

### Native Date Input with Minimum Date
```svelte
<!-- Source: HTML5 spec, adapted for Svelte 5 -->
<script lang="ts">
  import { format } from 'date-fns';

  let expiresAt = $state<string>('');

  // Minimum date is tomorrow
  const minDate = $derived(
    format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
  );
</script>

<input
  type="date"
  bind:value={expiresAt}
  min={minDate}
  class="px-4 py-2 bg-background border border-border rounded-md"
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Svelte stores ($:) | Svelte 5 runes ($state, $derived) | Svelte 5 (Oct 2024) | Cleaner reactivity, fine-grained updates |
| on:click | onclick | Svelte 5 | Native event handlers |
| createEventDispatcher | Callback props | Svelte 5 | Simpler component communication |
| document.execCommand | navigator.clipboard | ~2020 | Async, works in secure contexts |

**Deprecated/outdated:**
- `createEventDispatcher`: Use callback props instead (existing codebase already does this)
- Svelte stores for component state: Use $state runes
- `let` for reactive vars: Use `$state` explicitly

## Open Questions

Things that couldn't be fully resolved:

1. **Supabase session access in server endpoints**
   - What we know: Server endpoints can use getSupabaseAdmin() to bypass RLS
   - What's unclear: Best way to get current user's session in +server.ts for web UI routes
   - Recommendation: Use SvelteKit's load function to pass user, or check access/refresh tokens from cookies

2. **Pagination for many API keys**
   - What we know: Most users will have 1-5 keys
   - What's unclear: Edge case of users with 50+ keys
   - Recommendation: Start without pagination, add if needed (YAGNI)

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns (ConfirmModal.svelte, SuggestFeedModal.svelte, settings page)
- Existing api-keys.ts server utilities (Phase 1 implementation)
- Existing hooks.server.ts authentication patterns
- database.ts types for api_keys table

### Secondary (MEDIUM confidence)
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide) - Runes syntax
- [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) - Copy functionality
- [date-fns Documentation](https://date-fns.org/docs/) - Date formatting

### Tertiary (LOW confidence)
- [API Key Security Best Practices 2026](https://dev.to/alixd/api-key-security-best-practices-for-2026-1n5d) - "Show once" pattern validation
- [Google Cloud API Keys Best Practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices) - General UX patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, patterns verified in codebase
- Architecture: HIGH - Based on existing codebase patterns, minimal new decisions
- Pitfalls: HIGH - Based on actual implementation experience and security best practices
- Code examples: HIGH - Sourced from existing codebase and official documentation

**Research date:** 2026-02-05
**Valid until:** 30 days (stable patterns, established codebase)
