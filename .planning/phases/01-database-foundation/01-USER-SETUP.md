# Phase 01: User Setup Required

**Generated:** 2026-02-04
**Phase:** 01-database-foundation
**Status:** Incomplete

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard -> Project Settings -> API -> service_role key (secret) | `.env` |

## Getting the Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select the **leadrfeeds** project
3. Navigate to **Project Settings** (gear icon in sidebar)
4. Click **API** in the left menu
5. Find **service_role** key in the "Project API keys" section
6. Click "Reveal" to show the key
7. Copy the full key value

## Adding to Environment

Add to your `app/.env` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Security Notes:**
- The service role key bypasses Row Level Security - treat it as a secret
- Never commit `.env` to git (it should be in `.gitignore`)
- Only use on server-side code (the client is in `$lib/server/`)

## Verification

After adding the key, verify it works:

```bash
cd app
npm run check
```

The TypeScript check should pass without errors.

To verify at runtime, start the dev server:

```bash
npm run dev
```

If the key is missing, you'll see an error: `SUPABASE_SERVICE_ROLE_KEY is not set`

---
**Once all items complete:** Mark status as "Complete"
