# Technology Stack

**Analysis Date:** 2026-02-04

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code and build configuration
- Svelte 5.41.0 - UI components with runes syntax ($state, $derived, $props, $effect)

**Secondary:**
- JavaScript - PostCSS and Tailwind configuration
- CSS/HTML - Styling and markup

## Runtime

**Environment:**
- Node.js - No specific version locked, .npmrc has engine-strict=true

**Package Manager:**
- npm - with package-lock.json committed

## Frameworks

**Core:**
- SvelteKit 2.47.1 - Full-stack meta framework for Svelte
- @sveltejs/adapter-vercel 6.1.1 - Vercel deployment adapter
- @sveltejs/vite-plugin-svelte 6.2.1 - Vite plugin for Svelte

**Build/Dev:**
- Vite 7.1.10 - Build tool and dev server
- svelte-check 4.3.3 - Type checking for Svelte components

**Styling:**
- Tailwind CSS 3.4.18 - Utility-first CSS framework
- @tailwindcss/typography 0.5.19 - Typography plugin for prose styling
- autoprefixer 10.4.21 - PostCSS plugin for vendor prefixes
- PostCSS 8.5.6 - CSS transformation tool

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.80.0 - PostgreSQL database, authentication, and realtime
- lucide-svelte 0.553.0 - Icon library with 550+ Svelte components

**UI & Content:**
- marked 17.0.0 - Markdown to HTML parser for AI chat responses
- canvas-confetti 1.9.4 - Confetti animation library for achievements
- @types/canvas-confetti 1.9.0 - TypeScript types for canvas-confetti
- date-fns 4.1.0 - Utility library for date manipulation in timelines

## Configuration

**Environment:**
- PUBLIC_SUPABASE_URL - Supabase project URL (public)
- PUBLIC_SUPABASE_ANON_KEY - Supabase anonymous key (public, scoped to anon role)
- User-configured: openrouter_api_key (stored in Supabase per-user settings)

**Build:**
- `tsconfig.json` - TypeScript compiler options with strict mode enabled
- `svelte.config.js` - SvelteKit configuration with Vercel adapter
- `vite.config.ts` - Vite configuration with SvelteKit plugin
- `tailwind.config.js` - Tailwind color theming with CSS variables
- `postcss.config.js` - PostCSS plugins for Tailwind and autoprefixer

**Styling:**
- Colors defined via CSS variables in HSL format in `src/app.css`
- Responsive breakpoints via Tailwind defaults (mobile-first)
- Custom sidebar color theme with 6 color variants

## Platform Requirements

**Development:**
- Node.js with npm
- Modern browser with ES6+ support

**Production:**
- Vercel (serverless deployment)
- Supabase PostgreSQL instance
- OpenRouter API (optional, for AI features)

---

*Stack analysis: 2026-02-04*
