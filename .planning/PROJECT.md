# LeadrFeeds API

## What This Is

A public read-only API for LeadrFeeds that gives users programmatic access to all their feed data. Users create and manage API keys to query entries, feeds, categories, starred items, and settings — enabling integrations with AI assistants, automation tools, dashboards, or any application that needs their feed data.

## Core Value

Users can access their data programmatically without limitations — simple auth, comprehensive queries, reliable responses.

## Requirements

### Validated

- ✓ User authentication with email/password — existing
- ✓ Feed subscriptions and management — existing
- ✓ Entry timeline with filtering (all, starred, unread, by feed) — existing
- ✓ Collections for organizing feeds — existing
- ✓ Read/star status tracking per entry — existing
- ✓ AI chat assistant integration — existing
- ✓ Feed discovery and suggestions — existing
- ✓ User settings storage — existing

### Active

- [ ] API key creation with labels
- [ ] API key expiration settings
- [ ] API key revocation
- [ ] Multiple API keys per user
- [ ] Query entries by date range
- [ ] Query entries by feed/category
- [ ] Query entries by read/starred status
- [ ] Full-text search across entries
- [ ] Query feeds and subscriptions
- [ ] Query collections
- [ ] Query user settings
- [ ] Rate limiting for API requests

### Out of Scope

- Write operations via API — Keep API read-only for safety and simplicity
- Webhook push notifications — Users poll for data, no push callbacks
- Public API without authentication — All endpoints require valid API key
- Admin/management API — This is user-facing only

## Context

LeadrFeeds is an existing RSS reader built with SvelteKit 2 and Supabase. The app already has:
- Full authentication system
- Timeline with RPC-based queries (`get_user_timeline`)
- Collections system
- User settings storage in Supabase

The API layer will:
- Add a new Supabase table for API keys
- Create SvelteKit API routes (or Supabase Edge Functions) for endpoints
- Leverage existing RPC functions where possible
- Add UI in settings for key management

Primary use case: User wants to give OpenClaw API access to summarize their feed daily and email them. But the API should be general-purpose for any integration.

## Constraints

- **Tech stack**: Must use existing Supabase + SvelteKit infrastructure — consistency with current architecture
- **Read-only**: No mutations via API — prevents accidental data loss from automation
- **Rate limiting**: Must protect database from abuse — reasonable limits per key
- **Security**: API keys must be hashed in database — never store plaintext secrets

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Read-only API | Simpler, safer for automation — mutations require web UI | — Pending |
| Per-user rate limits | Prevent single user from overwhelming database | — Pending |
| Hashed API keys | Security best practice — reveal key once on creation | — Pending |

---
*Last updated: 2026-02-04 after initialization*
