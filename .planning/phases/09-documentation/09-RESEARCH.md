# Phase 9: Documentation - Research

**Researched:** 2026-02-05
**Domain:** API documentation, OpenAPI specification, static documentation pages
**Confidence:** HIGH

## Summary

This phase involves creating comprehensive API documentation for external users to integrate with the LeadrFeeds API. The existing API has four endpoints (entries, feeds, collections, stats) with Bearer token authentication, cursor-based pagination, and rate limiting (100 requests/minute).

Research confirms that the recommended approach is a **static documentation page built with SvelteKit** using Tailwind CSS for styling, following the existing codebase patterns. The documentation should include a dedicated route at `/docs/api`, an OpenAPI 3.1.0 specification served at `/api/openapi.json`, and inline code examples for curl, JavaScript, and Python.

The approach avoids external documentation tools (Swagger UI, RapiDoc) to keep the bundle small and maintain visual consistency with the existing app design. Instead, a custom documentation component structure with code highlighting via Prism.js provides the best balance of functionality and simplicity.

**Primary recommendation:** Build static documentation pages in SvelteKit using existing design patterns, serve OpenAPI spec as downloadable JSON, and provide multi-language code examples inline.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit | 2.x | Documentation page routing | Already in project |
| Tailwind CSS | 4.x | Documentation styling | Already in project |
| prismjs | 1.29+ | Code syntax highlighting | Lightweight, no build dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-svelte | (existing) | Icons for UI elements | Copy buttons, navigation |
| None needed | - | OpenAPI spec | Hand-written JSON, no generator |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom docs | Swagger UI | Larger bundle, different visual style |
| Custom docs | RapiDoc | Web component complexity, SSR issues |
| Hand-written spec | sveltekit-api | Adds build complexity, overkill for 4 endpoints |
| prismjs | shiki | Shiki heavier, prism sufficient for 3 languages |

**Installation:**
```bash
npm install prismjs @types/prismjs
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
├── routes/
│   ├── docs/
│   │   └── api/
│   │       ├── +page.svelte          # Main documentation page
│   │       └── +page.ts              # Optional: preload data
│   └── api/
│       └── openapi.json/
│           └── +server.ts            # OpenAPI spec endpoint
├── lib/
│   ├── components/
│   │   ├── docs/
│   │   │   ├── CodeBlock.svelte      # Syntax highlighted code
│   │   │   ├── EndpointCard.svelte   # Individual endpoint doc
│   │   │   ├── ParamTable.svelte     # Parameter documentation
│   │   │   └── ResponseExample.svelte # Response JSON display
│   │   └── ... existing components
│   └── data/
│       └── openapi-spec.ts           # OpenAPI spec as TypeScript object
```

### Pattern 1: Static Documentation Page
**What:** Single-page documentation with anchor navigation
**When to use:** Small API with 4-10 endpoints
**Example:**
```svelte
<!-- Source: Best practices from idratherbewriting.com -->
<script lang="ts">
  import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
  import EndpointCard from '$lib/components/docs/EndpointCard.svelte';

  // Table of contents for sticky navigation
  const sections = [
    { id: 'authentication', title: 'Authentication' },
    { id: 'entries', title: 'Entries' },
    { id: 'feeds', title: 'Feeds' },
    { id: 'collections', title: 'Collections' },
    { id: 'stats', title: 'Statistics' },
    { id: 'errors', title: 'Errors' },
    { id: 'rate-limiting', title: 'Rate Limiting' }
  ];
</script>

<div class="flex">
  <!-- Sticky sidebar navigation -->
  <nav class="hidden md:block sticky top-0 h-screen w-64">
    {#each sections as section}
      <a href="#{section.id}">{section.title}</a>
    {/each}
  </nav>

  <!-- Main content -->
  <main class="flex-1 max-w-4xl">
    <section id="authentication">...</section>
    <!-- More sections -->
  </main>
</div>
```

### Pattern 2: OpenAPI Spec Endpoint
**What:** Serve OpenAPI spec as downloadable JSON
**When to use:** Always - users expect this for tooling integration
**Example:**
```typescript
// Source: OpenAPI best practices (learn.openapis.org)
// app/src/routes/api/openapi.json/+server.ts
import type { RequestHandler } from './$types';
import { openApiSpec } from '$lib/data/openapi-spec';

export const GET: RequestHandler = async () => {
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="openapi.json"'
    }
  });
};
```

### Pattern 3: Multi-language Code Examples
**What:** Code examples in curl, JavaScript, and Python side-by-side
**When to use:** For each endpoint in documentation
**Example:**
```svelte
<!-- Source: API documentation best practices (swagger.io) -->
<script lang="ts">
  let selectedLang = $state<'curl' | 'javascript' | 'python'>('curl');

  const examples = {
    curl: `curl -X GET "https://leadrfeeds.com/api/v1/entries?limit=10" \\
  -H "Authorization: Bearer lf_your_api_key"`,
    javascript: `const response = await fetch('https://leadrfeeds.com/api/v1/entries?limit=10', {
  headers: {
    'Authorization': 'Bearer lf_your_api_key'
  }
});
const data = await response.json();`,
    python: `import requests

response = requests.get(
    'https://leadrfeeds.com/api/v1/entries',
    params={'limit': 10},
    headers={'Authorization': 'Bearer lf_your_api_key'}
)
data = response.json()`
  };
</script>

<div class="tabs">
  <button onclick={() => selectedLang = 'curl'}>cURL</button>
  <button onclick={() => selectedLang = 'javascript'}>JavaScript</button>
  <button onclick={() => selectedLang = 'python'}>Python</button>
</div>
<CodeBlock code={examples[selectedLang]} language={selectedLang} />
```

### Anti-Patterns to Avoid
- **Auto-generating docs from types:** Four endpoints don't warrant build complexity
- **Embedding Swagger UI:** Adds ~500KB to bundle, visual mismatch with app
- **Multiple documentation pages:** Single-page with anchors is better for small APIs
- **Documentation behind auth:** API docs should be public to aid discovery

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Syntax highlighting | Regex-based highlighter | prismjs | Edge cases, security concerns |
| Copy to clipboard | Manual clipboard API | navigator.clipboard.writeText | Browser API is simpler |
| OpenAPI validation | Custom validation | Online validator (optional) | Specs are simple, manual review sufficient |

**Key insight:** For a 4-endpoint API, the documentation itself is straightforward. The complexity is in presentation, not generation.

## Common Pitfalls

### Pitfall 1: Documentation Drift
**What goes wrong:** Documentation becomes outdated as API evolves
**Why it happens:** Docs separate from code, no automated sync
**How to avoid:**
- Keep OpenAPI spec in TypeScript file (type-checked)
- Reference spec values in documentation components
- Update docs in same PR as API changes
**Warning signs:** Response examples don't match actual responses

### Pitfall 2: Missing Error Documentation
**What goes wrong:** Users confused by error responses
**Why it happens:** Developers focus on success cases
**How to avoid:**
- Document ALL error codes (400, 401, 403, 404, 429, 500)
- Show example error response bodies
- Explain what causes each error
**Warning signs:** Support requests about error handling

### Pitfall 3: Unclear Authentication Flow
**What goes wrong:** Users can't figure out how to get/use API keys
**Why it happens:** Assumes users know where to create keys
**How to avoid:**
- Step-by-step guide with screenshots
- Link directly to Settings page
- Explain Bearer token format explicitly
**Warning signs:** "Where do I get an API key?" questions

### Pitfall 4: Code Examples That Don't Work
**What goes wrong:** Copy-paste examples fail
**Why it happens:** Placeholder values, missing headers, wrong syntax
**How to avoid:**
- Test all examples manually
- Use consistent placeholder format (YOUR_API_KEY)
- Include all required headers
**Warning signs:** GitHub issues about broken examples

### Pitfall 5: Mobile Unfriendly Documentation
**What goes wrong:** Code blocks overflow, navigation unusable on mobile
**Why it happens:** Desktop-first design
**How to avoid:**
- Horizontal scroll for code blocks
- Collapsible navigation on mobile
- Test on actual mobile devices
**Warning signs:** Poor mobile analytics for docs page

## Code Examples

Verified patterns from official sources:

### Prism.js Integration in Svelte 5
```svelte
<!-- CodeBlock.svelte -->
<script lang="ts">
  import Prism from 'prismjs';
  import 'prismjs/components/prism-bash';
  import 'prismjs/components/prism-javascript';
  import 'prismjs/components/prism-python';
  import 'prismjs/components/prism-json';
  import { Copy, Check } from 'lucide-svelte';

  interface Props {
    code: string;
    language: 'bash' | 'javascript' | 'python' | 'json';
  }

  let { code, language }: Props = $props();
  let copied = $state(false);

  const highlighted = $derived(
    Prism.highlight(code, Prism.languages[language], language)
  );

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

<div class="relative group">
  <button
    onclick={copyCode}
    class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
  >
    {#if copied}
      <Check size={16} class="text-green-500" />
    {:else}
      <Copy size={16} class="text-muted-foreground" />
    {/if}
  </button>
  <pre class="overflow-x-auto p-4 bg-card border border-border rounded-lg">
    <code class="language-{language}">{@html highlighted}</code>
  </pre>
</div>

<style>
  /* Prism theme overrides for dark mode */
  :global(.token.comment) { color: hsl(var(--muted-foreground)); }
  :global(.token.string) { color: hsl(var(--accent)); }
  :global(.token.keyword) { color: hsl(var(--primary)); }
</style>
```

### OpenAPI 3.1.0 Specification Structure
```typescript
// Source: OpenAPI Specification v3.1.0 (spec.openapis.org)
// $lib/data/openapi-spec.ts
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'LeadrFeeds API',
    version: '1.0.0',
    description: 'Read-only API for accessing your feed data programmatically.'
  },
  servers: [
    { url: 'https://leadrfeeds.com/api/v1', description: 'Production' }
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key from Settings > API Keys'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              status: { type: 'integer' }
            }
          }
        }
      },
      // ... more schemas
    }
  },
  paths: {
    '/entries': { /* ... */ },
    '/feeds': { /* ... */ },
    '/collections': { /* ... */ },
    '/stats': { /* ... */ }
  }
} as const;
```

### Documentation Page Layout
```svelte
<!-- Source: Moesif blog best practices -->
<!-- routes/docs/api/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MobileHeader from '$lib/components/MobileHeader.svelte';
  import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
  import { useDesktopLayout } from '$lib/stores/screenSize';
  import { Download } from 'lucide-svelte';

  const isDesktopMode = $derived($useDesktopLayout);
  let isSidebarOpen = $state(false);
  let activeSection = $state('overview');

  const sections = [
    { id: 'overview', title: 'Overview' },
    { id: 'authentication', title: 'Authentication' },
    { id: 'entries', title: 'GET /entries' },
    { id: 'feeds', title: 'GET /feeds' },
    { id: 'collections', title: 'GET /collections' },
    { id: 'stats', title: 'GET /stats' },
    { id: 'errors', title: 'Error Handling' },
    { id: 'rate-limits', title: 'Rate Limits' }
  ];

  // Intersection observer for active section tracking
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            activeSection = entry.target.id;
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  });
</script>
```

### Parameter Documentation Table
```svelte
<!-- ParamTable.svelte -->
<script lang="ts">
  interface Param {
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: string;
  }

  let { params }: { params: Param[] } = $props();
</script>

<div class="overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-border">
        <th class="text-left py-2 px-3 font-medium">Parameter</th>
        <th class="text-left py-2 px-3 font-medium">Type</th>
        <th class="text-left py-2 px-3 font-medium">Required</th>
        <th class="text-left py-2 px-3 font-medium">Description</th>
      </tr>
    </thead>
    <tbody>
      {#each params as param}
        <tr class="border-b border-border/50">
          <td class="py-2 px-3 font-mono text-primary">{param.name}</td>
          <td class="py-2 px-3 text-muted-foreground">{param.type}</td>
          <td class="py-2 px-3">
            {#if param.required}
              <span class="text-destructive">Yes</span>
            {:else}
              <span class="text-muted-foreground">No</span>
            {/if}
          </td>
          <td class="py-2 px-3">{param.description}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Swagger UI embed | Custom lightweight docs | 2024+ | Better performance, brand consistency |
| OpenAPI 2.0 (Swagger) | OpenAPI 3.1.0 | 2021 | JSON Schema alignment, cleaner syntax |
| Server-generated docs | Static docs with type-safe spec | 2023+ | Better DX, compile-time validation |

**Deprecated/outdated:**
- OpenAPI 2.0: Use 3.1.0 for JSON Schema compatibility
- Separate docs site: Integrated docs pages preferred for small APIs
- ReDoc/Swagger UI for small APIs: Overkill, use custom components

## Open Questions

Things that couldn't be fully resolved:

1. **Documentation URL placement**
   - What we know: /docs/api is standard, public access recommended
   - What's unclear: Should docs be accessible without auth? (Recommended: yes)
   - Recommendation: Make docs public, only API calls require auth

2. **Link from Settings page**
   - What we know: API Keys section should link to docs
   - What's unclear: Exact UX for the link
   - Recommendation: Add "View API Documentation" link in API Keys section

3. **Navigation integration**
   - What we know: Sidebar exists with main app navigation
   - What's unclear: Should docs have app Sidebar or standalone?
   - Recommendation: Keep app Sidebar for logged-in users, simple header for public

## Sources

### Primary (HIGH confidence)
- OpenAPI Specification v3.1.0 - https://spec.openapis.org/oas/v3.1.0.html
- SvelteKit Routing - https://svelte.dev/docs/kit/routing
- OpenAPI Best Practices - https://learn.openapis.org/best-practices.html

### Secondary (MEDIUM confidence)
- Swagger API Documentation Best Practices - https://swagger.io/blog/api-documentation/best-practices-in-api-documentation/
- Moesif Static Documentation Patterns - https://www.moesif.com/blog/technical/documentation/Designing-Good-Static-REST-API-Documentation/
- idratherbewriting Design Patterns - https://idratherbewriting.com/learnapidoc/pubapis_design_patterns.html

### Tertiary (LOW confidence)
- RapiDoc Web Component - researched but not recommended due to complexity
- sveltekit-api auto-generation - researched but overkill for 4 endpoints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Prism.js well-established, SvelteKit patterns verified
- Architecture: HIGH - Static page pattern matches existing codebase
- Pitfalls: MEDIUM - Based on general API documentation experience
- Code examples: HIGH - Patterns verified against official docs

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - documentation patterns are stable)
