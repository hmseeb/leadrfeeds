# Codebase Structure

**Analysis Date:** 2026-02-04

## Directory Layout

```
app/
├── src/
│   ├── lib/
│   │   ├── assets/               # Static assets (favicon, logos)
│   │   ├── components/           # Reusable Svelte components
│   │   │   ├── ui/              # shadcn-style UI components (button, card, input, etc.)
│   │   │   ├── collections/     # Collection-related components
│   │   │   ├── AIChat.svelte
│   │   │   ├── EntryCard.svelte
│   │   │   ├── Sidebar.svelte
│   │   │   ├── MobileHeader.svelte
│   │   │   ├── Toast.svelte
│   │   │   ├── ConfirmModal.svelte
│   │   │   ├── SuggestFeedModal.svelte
│   │   │   ├── LoadingSpinner.svelte
│   │   │   └── Skeleton.svelte
│   │   ├── services/            # Service layer (API clients, integrations)
│   │   │   └── supabase.ts      # Supabase client initialization
│   │   ├── stores/              # Svelte stores (state management)
│   │   │   ├── auth.ts          # Authentication store and functions
│   │   │   ├── sidebar.ts       # Sidebar state (feeds, unread counts)
│   │   │   ├── collections.ts   # Collections state and operations
│   │   │   ├── screenSize.ts    # Responsive breakpoints
│   │   │   ├── theme.ts         # Theme (dark/light) persistence
│   │   │   └── toast.ts         # Toast notifications
│   │   └── types/               # TypeScript type definitions
│   │       └── database.ts      # Supabase database schema types
│   ├── routes/                  # SvelteKit file-based routes
│   │   ├── auth/               # Authentication routes
│   │   │   ├── callback/       # OAuth and password recovery handler
│   │   │   │   └── complete/   # OAuth completion page
│   │   │   ├── login/          # Email/password login
│   │   │   ├── register/       # User registration
│   │   │   ├── forgot-password/# Password reset request
│   │   │   └── reset-password/ # Password reset form
│   │   ├── discover/           # Feed discovery and browsing
│   │   │   └── suggestions/    # Feed suggestions (admin only)
│   │   ├── timeline/           # Main feed reader
│   │   │   └── [filter]/       # Filtered timeline view
│   │   ├── collections/        # Collections management page
│   │   ├── settings/           # User settings page
│   │   ├── +layout.svelte      # Root layout (global styles, theme, toast)
│   │   ├── +layout.ts          # Root layout config (SSR true, prerender false)
│   │   └── +page.svelte        # Root index (auth check, redirect logic)
│   ├── app.css                 # Global styles with CSS variables (dark theme)
│   ├── app.d.ts                # TypeScript ambient declarations
│   └── app.html                # HTML shell template
├── static/                      # Static files (favicon, etc.)
├── svelte.config.js            # SvelteKit configuration
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
├── postcss.config.js           # PostCSS configuration
├── package.json                # Dependencies and scripts
├── package-lock.json           # Locked dependency versions
├── .env                        # Environment variables (secrets)
├── .env.example                # Environment variable template
├── .gitignore                  # Git ignore rules
└── README.md                   # Project documentation
```

## Directory Purposes

**`app/src/lib/components/`:**
- Purpose: Reusable Svelte components
- Contains: Page UI components (Sidebar, EntryCard, AIChat), modals, UI primitives
- Key files: `Sidebar.svelte` (feed navigation), `AIChat.svelte` (content analysis), `EntryCard.svelte` (feed entry display)

**`app/src/lib/components/ui/`:**
- Purpose: shadcn-style base UI components with Tailwind styling
- Contains: Button, Card, Dialog, Input, Textarea, Badge, Skeleton primitives
- Pattern: Single-responsibility components that combine styling and structure

**`app/src/lib/components/collections/`:**
- Purpose: Collection management UI
- Contains: CollectionItem, CollectionModal, IconPicker
- Usage: Collections page and sidebar collection display

**`app/src/lib/stores/`:**
- Purpose: Centralized state management with Svelte stores
- Contains: Authentication, sidebar feeds, collections, responsive layout, theme, notifications
- Pattern: Custom stores exported with subscribe method and action functions

**`app/src/lib/services/`:**
- Purpose: Integration with external services
- Contains: Supabase client initialization with database types
- Single file: `supabase.ts` - instantiates client with environment credentials

**`app/src/lib/types/`:**
- Purpose: TypeScript type definitions for database and utilities
- Contains: Supabase schema types auto-generated from database
- Critical file: `database.ts` - defines all table, RPC function, and view types

**`app/src/routes/`:**
- Purpose: SvelteKit file-based routing
- Contains: Page components (+page.svelte), layouts, server handlers
- Convention: Directory = URL segment, `[param]` = dynamic segment

**`app/src/routes/auth/`:**
- Purpose: Authentication UI and flows
- Pages: login, register, forgot-password, reset-password, callback handler
- Single server file: `callback/+server.ts` handles OAuth redirects and password recovery redirects

**`app/src/routes/discover/`:**
- Purpose: Feed discovery and subscription UI
- Pages: Main discover page (browse/search feeds), suggestions page (admin only)
- Features: Category filtering, subscription status filtering, feed suggestions

**`app/src/routes/timeline/[filter]/`:**
- Purpose: Main feed reader interface
- Dynamic filter parameter: `all`, `starred`, `unread`, or `feed-id`
- Features: Entry listing, sidebar, AI chat, mobile overlay controls, search, filtering

**`app/src/routes/collections/`:**
- Purpose: Collections management interface
- Features: Create/edit/delete collections, add feeds to collections, collection browsing

**`app/src/routes/settings/`:**
- Purpose: User settings and preferences
- Features: Account settings, API key management, theme preferences

## Key File Locations

**Entry Points:**
- `app/src/routes/+layout.svelte`: Root layout, theme loader, Toast mount
- `app/src/routes/+page.svelte`: Home redirect (checks subscriptions)
- `app/src/routes/+layout.ts`: Root config (SSR enabled, no prerender)

**Configuration:**
- `app/src/app.css`: Global styles with CSS variables (dark theme colors)
- `app/src/app.html`: HTML template shell
- `tailwind.config.js`: Tailwind CSS classes and breakpoints
- `svelte.config.js`: SvelteKit adapter (Vercel) and preprocessing
- `tsconfig.json`: TypeScript strict mode, path aliases

**Core Logic:**
- `app/src/lib/stores/auth.ts`: Authentication state and Supabase auth functions
- `app/src/lib/stores/sidebar.ts`: Feed subscription loading, unread counts, refresh interval
- `app/src/lib/stores/collections.ts`: Collections CRUD operations
- `app/src/lib/services/supabase.ts`: Supabase client initialization
- `app/src/lib/types/database.ts`: TypeScript types for database schema

**Major Components:**
- `app/src/lib/components/Sidebar.svelte`: Navigation sidebar with feed list
- `app/src/lib/components/AIChat.svelte`: AI-powered content analysis chat
- `app/src/lib/components/EntryCard.svelte`: Feed entry display card
- `app/src/lib/components/collections/CollectionModal.svelte`: Collection CRUD UI

**Testing:**
- Not present. No test files found in codebase.

## Naming Conventions

**Files:**

- **Components:** PascalCase.svelte (e.g., `Sidebar.svelte`, `EntryCard.svelte`)
- **Stores:** camelCase.ts (e.g., `auth.ts`, `sidebar.ts`)
- **Routes:** lowercase with hyphens (e.g., `forgot-password/`, `reset-password/`)
- **Dynamic routes:** Square brackets (e.g., `[filter]/`, `[id]/`)
- **Server files:** `+server.ts`
- **Page files:** `+page.svelte`
- **Layout files:** `+layout.svelte`, `+layout.ts`

**Directories:**

- **Routes:** lowercase (e.g., `auth/`, `discover/`, `timeline/`)
- **Components:** lowercase (e.g., `components/`, `ui/`, `collections/`)
- **Services/Utils:** lowercase (e.g., `services/`, `stores/`, `types/`)

**Variables & Functions:**

- **Variables:** camelCase (e.g., `entries`, `selectedEntry`, `isLoading`)
- **State variables:** camelCase prefixed with descriptive noun (e.g., `isSidebarOpen`, `searchQuery`, `activeFeedId`)
- **Derived values:** camelCase (e.g., `filteredEntries`, `activeFilterCount`)
- **Functions:** camelCase (e.g., `handleLogin()`, `loadFeeds()`, `getDomainCategory()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `BREAKPOINTS`, `limit`)
- **Booleans:** Prefix with is/has/should (e.g., `isDesktopMode`, `hasMore`, `shouldRender`)

**Types:**

- **Interfaces:** PascalCase (e.g., `FeedWithUnread`, `Collection`, `AIContextEntry`)
- **Type aliases:** PascalCase (e.g., `TimelineEntry`)

## Where to Add New Code

**New Feature (new route/page):**
- Primary code: `app/src/routes/[feature-name]/+page.svelte`
- Store if needed: `app/src/lib/stores/[feature-name].ts`
- Components: `app/src/lib/components/[FeatureName]*.svelte`

**New Component/Module:**
- Reusable component: `app/src/lib/components/[ComponentName].svelte`
- UI primitive: `app/src/lib/components/ui/[component-name].svelte`
- Feature-specific component: `app/src/lib/components/[feature]/[ComponentName].svelte`

**Utilities:**
- Shared helpers: Create new file in `app/src/lib/` (e.g., `app/src/lib/utils.ts`)
- Type utilities: `app/src/lib/types/`
- Service integration: `app/src/lib/services/`

**Store for new feature:**
- Pattern: Create `app/src/lib/stores/[feature].ts`
- Export custom store via `createXyzStore()` function
- Methods: `loadData()`, `createItem()`, `deleteItem()`, etc.
- Subscribe pattern: `subscribe, set, update` from writable

**New page route:**
- Create directory: `app/src/routes/[page-name]/`
- Create file: `app/src/routes/[page-name]/+page.svelte`
- Optional layout: `app/src/routes/[page-name]/+layout.svelte` (if custom layout needed)
- Optional server: `app/src/routes/[page-name]/+server.ts` (if API handler needed)

**Dynamic routes:**
- Use brackets: `app/src/routes/[param]/+page.svelte`
- Access via `$page.params.param` in component

## Special Directories

**`app/.svelte-kit/`:**
- Purpose: SvelteKit compiler output and build artifacts
- Generated: Yes
- Committed: No (in .gitignore)

**`app/static/`:**
- Purpose: Static files served at root (favicon, logo, etc.)
- Generated: No
- Committed: Yes

**`app/node_modules/`:**
- Purpose: Installed npm dependencies
- Generated: Yes
- Committed: No (in .gitignore)

**`.env` and `.env.example`:**
- Purpose: Environment variables and secrets
- `.env`: Actual credentials (never committed)
- `.env.example`: Template showing required vars (committed)
- Required: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`

---

*Structure analysis: 2026-02-04*
