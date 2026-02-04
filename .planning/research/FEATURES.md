# Feature Landscape: Read-Only REST API

**Domain:** Read-only data API with API key authentication for RSS reader
**Researched:** 2026-02-04
**Confidence:** MEDIUM (verified against multiple sources and established API patterns)

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **API key authentication** | Standard for server-to-server integrations; users expect to create/revoke keys | Medium | Hash keys in DB, show only once on creation |
| **API key labels** | Users need to identify which key is for which integration | Low | Simple text label per key |
| **Pagination** | Any list endpoint must paginate; adding later is a breaking change | Medium | Use cursor-based for timeline (real-time data), limit/offset acceptable for stable lists |
| **Basic filtering** | Users expect to filter entries by feed, date range, read/starred status | Medium | Already have RPC support via `get_user_timeline` |
| **Consistent response format** | JSON responses with predictable structure (data, pagination, errors) | Low | Envelope pattern: `{ data: [...], meta: { pagination }, error: null }` |
| **Proper HTTP status codes** | 200 for success, 400 for bad request, 401 for auth, 404 for not found, 429 for rate limit | Low | Developers expect REST semantics |
| **Rate limiting** | Protects database, prevents abuse, expected by all serious API consumers | Medium | Return `X-RateLimit-*` headers with limits and remaining |
| **Error messages** | Clear, actionable error responses with codes and descriptions | Low | `{ error: { code: "INVALID_FILTER", message: "..." } }` |
| **API documentation** | Developers need to know what endpoints exist and how to use them | Medium | At minimum: endpoint list, auth instructions, example requests |
| **HTTPS only** | All API calls must be secure; no HTTP fallback | Low | Already enforced by Vercel deployment |

## Differentiators

Features that set the API apart. Not expected, but valued by users.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Full-text search** | Query entries by keyword across title/description/content | Medium | Already supported in `get_user_timeline` RPC |
| **OpenAPI specification** | Machine-readable spec enables auto-generated clients, IDE integration, and tools like OpenClaw/MCP | Medium | Generate from route definitions; use OpenAPI 3.1 |
| **Field selection** | Let clients request only specific fields to reduce payload size | Medium | `?fields=title,url,published_at` pattern |
| **Cursor-based pagination** | Stable pagination for real-time feed data; no skipped/duplicated entries | Medium | Use `continuation` token pattern like Feedly API |
| **Multiple output formats** | JSON (default), JSON-feed format, or CSV export | High | JSON is mandatory; others are nice-to-have |
| **Collection filtering** | Query entries within a specific collection | Low | Already have `get_collection_timeline` RPC |
| **Bulk data export** | Download all data at once for backup/migration purposes | Medium | Single endpoint returning complete dataset in pages |
| **API key expiration** | Allow keys to auto-expire for security | Low | Optional expiration date per key |
| **Unread counts endpoint** | Get unread counts per feed/collection without fetching entries | Low | Already have `get_unread_counts` RPC |
| **Interactive documentation** | Swagger UI or similar "try it" interface | Medium | Treblle, Swagger UI, or Redoc |
| **Category filtering** | Filter entries/feeds by category | Low | Feed category already in data model |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Write operations via API** | Increases attack surface, risk of accidental data loss from automation, more complex auth scopes | Keep read-only; mutations require web UI with full auth |
| **Webhook push notifications** | Adds complexity (callback management, retry logic, failure modes), not needed for stated use cases | Users poll for data; document recommended polling intervals |
| **Public endpoints without auth** | Security risk, no way to rate limit or audit usage | All endpoints require valid API key |
| **Query string API keys** | Exposes keys in logs, browser history, caches | Require API key in `Authorization` header or `X-API-Key` header |
| **Overly granular endpoints** | Requires many API calls for simple operations (N+1 problem) | Design endpoints that return useful aggregates |
| **Tight coupling to internal schema** | Locks API to database structure, prevents future changes | Use DTOs that map internal data to stable external contracts |
| **OAuth 2.0 for this use case** | Overkill for server-to-server read-only access; adds unnecessary complexity | Simple API keys are appropriate for this scope |
| **GraphQL** | Learning curve for users, complexity for server, overkill for read-only data with known query patterns | REST with good filtering covers all use cases |
| **Versioned response schemas per endpoint** | Maintenance nightmare, fragmented documentation | Single API version in URL path (`/v1/`); evolve additively |
| **Session-based auth for API** | Stateful, doesn't work for server-to-server, cookie complexity | Stateless API key per request |
| **RPC-style endpoints** | `/getEntries`, `/markAsRead` breaks REST conventions, confuses consumers | Resource-oriented: `/entries`, `/feeds`, `/collections` |

## Feature Dependencies

```
API Key Management (must exist first)
    |
    +-- API Key Creation UI (settings page)
    |       |
    |       +-- API Key Table in Supabase
    |
    +-- API Key Validation Middleware
            |
            +-- All API Endpoints depend on this
                    |
                    +-- /v1/entries (with filtering, pagination, search)
                    +-- /v1/feeds
                    +-- /v1/subscriptions
                    +-- /v1/collections
                    +-- /v1/collections/:id/entries
                    +-- /v1/settings
                    +-- /v1/stats (unread counts)

Rate Limiting
    |
    +-- Depends on API Key Validation
    +-- All endpoints inherit rate limits

OpenAPI Spec
    |
    +-- Depends on all endpoints being defined
    +-- Documentation depends on OpenAPI spec
```

## MVP Recommendation

For MVP, prioritize:

1. **API key creation/revocation** - Gate everything else
2. **Entries endpoint with filtering** - Primary use case (AI summarization)
3. **Feeds/subscriptions endpoint** - Needed to understand entry context
4. **Pagination (cursor-based)** - Non-negotiable for any list endpoint
5. **Rate limiting** - Protect the database from day one
6. **Basic documentation** - At minimum: auth instructions + endpoint list

Defer to post-MVP:
- **OpenAPI specification**: Valuable but can be added without breaking changes
- **Field selection**: Nice-to-have optimization
- **Multiple output formats**: JSON is sufficient initially
- **Interactive documentation**: Basic docs first, pretty docs later
- **Bulk export endpoint**: Can be composed from paginated endpoints by users
- **API key expiration**: Security enhancement, not blocking

## API Endpoint Recommendations

Based on the data model and use cases:

### Priority 1 (MVP)
| Endpoint | Description | Maps To |
|----------|-------------|---------|
| `GET /v1/entries` | List entries with filters | `get_user_timeline` RPC |
| `GET /v1/entries/:id` | Single entry detail | Direct query |
| `GET /v1/feeds` | List subscribed feeds | `user_subscriptions` + `feeds` |
| `GET /v1/feeds/:id` | Single feed detail | Direct query |
| `GET /v1/stats/unread` | Unread counts per feed | `get_unread_counts` RPC |

### Priority 2 (Post-MVP)
| Endpoint | Description | Maps To |
|----------|-------------|---------|
| `GET /v1/collections` | List user collections | `get_user_collections_with_counts` RPC |
| `GET /v1/collections/:id` | Collection detail | Direct query |
| `GET /v1/collections/:id/entries` | Entries in collection | `get_collection_timeline` RPC |
| `GET /v1/settings` | User settings (theme, filters) | `user_settings` table |
| `GET /v1/categories` | List available categories | Distinct categories from feeds |

## Query Parameter Patterns

Based on best practices research:

### Filtering
```
GET /v1/entries?feed_id=abc123
GET /v1/entries?is_starred=true
GET /v1/entries?is_read=false
GET /v1/entries?category=technology
GET /v1/entries?published_after=2026-01-01T00:00:00Z
GET /v1/entries?published_before=2026-02-01T00:00:00Z
```

### Search
```
GET /v1/entries?q=artificial+intelligence
```

### Pagination (cursor-based recommended)
```
GET /v1/entries?limit=50
GET /v1/entries?limit=50&cursor=eyJwdWJsaXNoZWRfYXQiOiIyMDI2...
```

### Combining
```
GET /v1/entries?feed_id=abc&is_starred=true&limit=20&q=AI
```

## Sources

- [REST API Best Practices - Postman Blog](https://blog.postman.com/rest-api-best-practices/)
- [Pagination Best Practices - Speakeasy](https://www.speakeasy.com/api-design/pagination)
- [Filtering Responses Best Practices - Speakeasy](https://www.speakeasy.com/api-design/filtering-responses)
- [API Key Best Practices - Google Cloud](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
- [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html)
- [REST Anti-Patterns - InfoQ](https://www.infoq.com/articles/rest-anti-patterns/)
- [Feedly API Documentation](https://developers.feedly.com/reference/introduction)
- [Inoreader API](https://www.inoreader.com/developers/)
- [REST API Design - Moesif](https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/)
- [API Design Best Practices - Hakia](https://hakia.com/engineering/api-design-best-practices/)
