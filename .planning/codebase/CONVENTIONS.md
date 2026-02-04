# Coding Conventions

**Analysis Date:** 2026-02-04

## Naming Patterns

**Files:**
- Svelte components: PascalCase (e.g., `EntryCard.svelte`, `Sidebar.svelte`, `AIChat.svelte`)
- TypeScript/JavaScript files: camelCase (e.g., `supabase.ts`, `auth.ts`, `sidebar.ts`)
- Utility/store files: camelCase (e.g., `screenSize.ts`, `collections.ts`)
- UI components in subdirectories: kebab-case (e.g., `card-content.svelte`, `dialog-footer.svelte`)
- Route files: SvelteKit convention with `+` prefix (e.g., `+page.svelte`, `+layout.svelte`, `+server.ts`)

**Functions:**
- camelCase for all functions (e.g., `createToastStore`, `formatDistanceToNow`, `getDomainCategory`)
- Async functions follow same camelCase pattern (e.g., `signUp`, `signIn`, `loadFeeds`)
- Event handlers use descriptive camelCase: `handleClick`, `handleKeyDown`, `handleConfirm`, `handleCancel`

**Variables:**
- Local state: camelCase (e.g., `messages`, `input`, `loading`, `apiKey`)
- Boolean flags: camelCase with descriptive prefixes (e.g., `isLoading`, `isMobileOpen`, `hasMore`, `showFilterMenu`)
- Constants: camelCase or UPPER_SNAKE_CASE depending on scope
  - Local constants: camelCase (e.g., `MIN_WIDTH`, `MAX_WIDTH` within functions)
  - Module-level constants: UPPER_SNAKE_CASE (e.g., `PAGE_SIZE = 1000`, `CACHE_TTL_MS = 5 * 60 * 1000`)

**Types:**
- Interfaces: PascalCase (e.g., `Props`, `Toast`, `Entry`, `ContextBadge`, `FeedWithUnread`)
- Type aliases: PascalCase (e.g., `Breakpoint`, `ChatMessage`)
- Database types imported from `$lib/types/database`: PascalCase with `Tables<>` generic (e.g., `Tables<"chat_messages">`)

## Code Style

**Formatting:**
- No explicit formatter configured (no `.prettierrc` or `prettier` in package.json)
- TypeScript strict mode enabled: `"strict": true` in `tsconfig.json`
- Indentation: 1 tab (visible in source files)
- Line length: No enforced limit observed

**Linting:**
- No ESLint configuration detected (no `.eslintrc.*` files)
- No lint errors in reviewed code

**Svelte 5 Runes (Required):**
All components must use Svelte 5 runes syntax exclusively:
```svelte
// State
let count = $state(0);

// Derived values
const double = $derived(count * 2);

// Props with destructuring
let { propName }: Props = $props();

// Effects for side effects
$effect(() => {
  // reactive side effects
});
```

## Import Organization

**Order (within script blocks):**
1. Svelte imports: `import { onMount, untrack } from 'svelte'`
2. SvelteKit imports: `import { page } from '$app/stores'`, `import { goto } from '$app/navigation'`
3. External library imports: `import { supabase } from '@supabase/supabase-js'`, `import { marked } from 'marked'`
4. Icon imports: `import { Star, X, Home } from 'lucide-svelte'`
5. Internal imports: `import { user } from '$lib/stores/auth'`, `import Sidebar from '$lib/components/Sidebar.svelte'`
6. Type imports: `import type { Tables } from '$lib/types/database'`

**Path Aliases:**
- `$lib`: Points to `src/lib/` (configured in SvelteKit)
- `$app`: SvelteKit's automatic alias for app internals
- All imports use aliases consistently (no relative paths from node_modules)

## Error Handling

**Patterns:**
- Supabase methods return `{ data, error }` tuple pattern
- Handle errors explicitly with null checks:
```typescript
const { data, error } = await supabase.auth.signUp({ email, password });
if (error) {
  console.error('Error signing up:', error);
  throw new Error('Failed to sign up');
}
```

- Specific error code handling for duplicate keys:
```typescript
if (error.code === '23505') {
  throw new Error(`A collection named "${name}" already exists`);
}
```

- Try-catch for unexpected errors in utility functions:
```typescript
function getTimeAgo(dateString: string) {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return "";
  }
}
```

- No try-catch wrapping for most async operations; errors returned from SDK methods
- Navigation errors use `throw redirect()` pattern in server routes

## Logging

**Framework:** `console` object directly

**Patterns:**
- `console.error()` for error cases with context (e.g., `console.error('Error loading feeds:', error)`)
- No info, warn, or debug logging observed in codebase
- Errors logged immediately when caught

## Comments

**When to Comment:**
- Minimal commenting observed in codebase
- Comments used for:
  - Non-obvious algorithm logic (e.g., "Filter out tracking pixels" in thumbnail extraction)
  - Important state management behavior
  - OAuth/auth flow steps (marked with inline comments like "// Handle OAuth errors")
  - SVG data comments (inline SVG markup)

**JSDoc/TSDoc:**
- Not used in codebase
- No function-level documentation blocks
- Type safety via TypeScript interfaces/types instead

## Function Design

**Size:**
- Functions average 10-50 lines for business logic
- Component handlers very short (1-5 lines)
- Utility functions self-contained and focused (e.g., `getTimeAgo`, `extractThumbnail`, `getDomainCategory`)

**Parameters:**
- Single `Props` interface parameter in Svelte components with destructuring:
```svelte
let { propName, onCallback }: Props = $props();
```
- Supabase SDK calls use object parameters with implicit typing
- Callback functions passed as props (e.g., `onToggleStar`, `onMarkRead`)

**Return Values:**
- Store functions return object with `subscribe` method and action functions
- Async functions return `{ data, error }` from Supabase or throw Error
- Event handlers return void
- Utility functions return typed values or null

## Module Design

**Exports:**
- Named exports for utility functions (e.g., `export const user`, `export const session`, `export async function signUp()`)
- Default exports for Svelte components in UI library (e.g., `export { default as Button }` in `index.ts`)
- Store functions exported as default created store (e.g., `export const toast = createToastStore()`)

**Barrel Files:**
- Used in UI components: `src/lib/components/ui/index.ts` exports all UI components
- One per directory pattern not strictly applied

## Svelte Component Patterns

**Reactive Declarations:**
- Use `$derived()` for derived state and computations
- Use `$effect()` for side effects with automatic cleanup
- Avoid manual subscription handling

**Two-way Binding:**
- Use `$bindable()` for two-way props (e.g., in ConfirmModal for `isOpen` state)

**Event Handling:**
- Stop propagation explicitly: `e.stopPropagation()`
- Prevent default: `e.preventDefault()`
- Keyboard event handling in modals for Escape key

**Image Error Handling:**
- Cast `HTMLImageElement` for onerror handlers:
```svelte
onerror={(e) => {
  const target = e.target as HTMLImageElement;
  target.src = 'fallback.svg';
}}
```

**OnMount with Cleanup:**
```svelte
onMount(() => {
  let cleanup: (() => void) | undefined;
  (async () => {
    cleanup = await loadData();
  })();
  return () => {
    cleanup?.();
  };
});
```

## Styling

**Framework:** Tailwind CSS with CSS variables

**CSS Variables (Theming):**
Defined in `src/app.css` using HSL format:
- `--background`, `--foreground`
- `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`
- `--card`, `--popover`, `--border`, `--input`, `--ring`
- `--chart-4` for success states

**Tailwind Usage:**
- Responsive classes with md: and lg: prefixes (mobile-first)
- Shadow effects: `shadow-sm`, `shadow-md`, `shadow-lg` with color variants
- Hover states with transitions: `hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200`
- Outline focus rings on interactive elements: `focus-visible:ring-2`
- Disabled states with opacity: `disabled:opacity-50`
- Line clamps: `line-clamp-2` for text truncation

**Interactive Elements:**
- Buttons use shadow-based 3D effect: `shadow-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`
- Smooth transitions: `transition-all duration-200`
- Minimum touch target: `min-h-[44px] min-w-[44px]` on buttons

---

*Convention analysis: 2026-02-04*
