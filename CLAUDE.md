# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LeadrFeeds is an RSS feed reader application built with SvelteKit 2 and Svelte 5. Users can discover feeds, subscribe to them, read entries in a timeline, star favorites, and use an AI assistant for content analysis.

## Development Commands

All commands run from the `app/` directory:

```bash
cd app

# Start development server
npm run dev

# Type checking
npm run check

# Type checking in watch mode
npm run check:watch

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Tech Stack
- **Framework**: SvelteKit 2 with Svelte 5 (uses runes: `$state`, `$derived`, `$props`, `$effect`)
- **Styling**: Tailwind CSS with shadcn-style CSS variables (defined in `app.css`)
- **Database**: Supabase (PostgreSQL with RLS)
- **Deployment**: Vercel (`@sveltejs/adapter-vercel`)
- **AI**: OpenRouter API integration

### Key Directories
```
app/
├── src/
│   ├── lib/
│   │   ├── components/    # Svelte components
│   │   ├── services/      # Supabase client
│   │   ├── stores/        # Svelte stores (auth, screenSize)
│   │   └── types/         # TypeScript types (database.ts)
│   └── routes/            # SvelteKit file-based routing
│       ├── auth/          # Login, register, callback
│       ├── discover/      # Feed discovery + suggestions
│       ├── settings/      # User settings
│       └── timeline/[filter]/  # Main feed reader
```

### Core Data Flow
1. **Feed Sync**: External service (Folo) sends webhooks → n8n → Supabase
2. **User Data**: Subscriptions, read status, stars stored in Supabase with RLS
3. **Timeline**: Uses `get_user_timeline` RPC function for efficient entry retrieval

### Responsive Design
The app uses a custom `useDesktopLayout` store (`lib/stores/screenSize.ts`) that adapts to:
- Mobile: < 768px
- Tablet portrait: Mobile layout
- Tablet landscape: Desktop layout
- Desktop: ≥ 1024px

Desktop shows persistent sidebar; mobile shows overlay sidebar with hamburger menu.

### Database Schema (Supabase)

Key tables:
- `feeds` - RSS feed metadata
- `entries` - Feed entries/posts
- `user_subscriptions` - User feed subscriptions
- `user_entry_status` - Read/starred status per user
- `user_settings` - Preferences, API keys
- `chat_messages` - AI conversation history

Key RPC functions:
- `get_user_timeline` - Paginated timeline with join data
- `get_discovery_feeds` - Browse available feeds
- `get_unread_counts` - Unread counts per feed
- `mark_entry_read`, `toggle_entry_star` - Status updates

### Component Patterns

**Svelte 5 Runes**: All components use the new runes syntax:
```svelte
let count = $state(0);
const double = $derived(count * 2);
let { propName }: Props = $props();
$effect(() => { /* reactive side effects */ });
```

**Image Error Handling**: Use `HTMLImageElement` cast for onerror handlers:
```svelte
onerror={(e) => {
  const target = e.target as HTMLImageElement;
  target.src = 'fallback.svg';
}}
```

**onMount with cleanup**: Wrap async operations in IIFE to properly return cleanup:
```svelte
onMount(() => {
  const cleanup = setupSomething();
  (async () => { await loadData(); })();
  return cleanup;
});
```

### Environment Variables

Required in `.env`:
```
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

### CSS Variables (Theming)

Colors defined in `app.css` using HSL CSS variables:
- `--background`, `--foreground`
- `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`
- `--card`, `--popover`, `--border`, `--input`, `--ring`

### Known TypeScript Issues

The database types (`lib/types/database.ts`) may be out of sync with actual schema. Tables/functions not in types:
- `feed_suggestions` table
- `get_pending_suggestions_count` RPC
- `get_suggestion_feed_status` RPC

Regenerate types with Supabase CLI if needed.
