# Requirements: LeadrFeeds API

**Defined:** 2026-02-04
**Core Value:** Users can access their data programmatically without limitations -- simple auth, comprehensive queries, reliable responses.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### API Key Management

- [ ] **KEY-01**: User can create API key with a custom label
- [ ] **KEY-02**: User can set expiration date when creating key
- [ ] **KEY-03**: User can revoke an active API key
- [ ] **KEY-04**: User can create multiple API keys (different integrations)
- [ ] **KEY-05**: User can view list of their API keys with status
- [x] **KEY-06**: API key is shown once on creation (hashed in database)

### API Authentication

- [x] **AUTH-01**: API validates key via Authorization header (Bearer token)
- [x] **AUTH-02**: API rejects expired keys with appropriate error
- [x] **AUTH-03**: API rejects revoked keys with appropriate error
- [x] **AUTH-04**: API uses timing-safe comparison to prevent attacks

### Entries Endpoint

- [ ] **ENT-01**: API returns user's feed entries with pagination
- [ ] **ENT-02**: API supports filtering entries by date range (start/end)
- [ ] **ENT-03**: API supports filtering entries by feed ID
- [ ] **ENT-04**: API supports filtering entries by category
- [ ] **ENT-05**: API supports filtering entries by read/unread status
- [ ] **ENT-06**: API supports filtering entries by starred status
- [ ] **ENT-07**: API supports full-text search across entry content

### Feeds Endpoint

- [ ] **FEED-01**: API returns user's subscribed feeds
- [ ] **FEED-02**: API returns feed metadata (title, URL, category)
- [ ] **FEED-03**: API returns unread count per feed

### Collections Endpoint

- [ ] **COLL-01**: API returns user's collections
- [ ] **COLL-02**: API returns feeds within each collection
- [ ] **COLL-03**: API supports filtering entries by collection

### Stats Endpoint

- [ ] **STAT-01**: API returns total unread count
- [ ] **STAT-02**: API returns total starred count
- [ ] **STAT-03**: API returns counts per feed

### Rate Limiting

- [x] **RATE-01**: API enforces per-key rate limits
- [x] **RATE-02**: API returns rate limit headers (remaining, reset)
- [x] **RATE-03**: API returns 429 with retry-after on limit exceeded

### Pagination

- [x] **PAGE-01**: API uses cursor-based pagination
- [x] **PAGE-02**: API returns next_cursor in response
- [x] **PAGE-03**: API supports configurable page size (with max limit)

### Documentation

- [ ] **DOC-01**: API has documentation page accessible to users
- [ ] **DOC-02**: Documentation includes endpoint reference
- [ ] **DOC-03**: Documentation includes authentication guide
- [ ] **DOC-04**: API provides OpenAPI/Swagger specification
- [ ] **DOC-05**: Documentation includes code examples

### Error Handling

- [x] **ERR-01**: API returns consistent error response format
- [x] **ERR-02**: API uses appropriate HTTP status codes
- [x] **ERR-03**: API error messages are helpful but don't leak internals

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Features

- **ENH-01**: Field selection (choose which fields to return)
- **ENH-02**: Bulk export endpoint (download all data)
- **ENH-03**: Interactive API documentation (try-it-out)
- **ENH-04**: Multiple output formats (JSON, CSV)

### Key Management Advanced

- **KEYADV-01**: Key usage analytics (requests per day)
- **KEYADV-02**: Key rotation with grace period
- **KEYADV-03**: Scoped permissions per key

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Write operations | Keep API read-only for safety and simplicity |
| Webhooks/push notifications | Polling is simpler; users can schedule their own fetches |
| GraphQL | REST is simpler, matches use case, well-understood |
| OAuth for API | API keys are simpler for machine-to-machine auth |
| Public endpoints | All data is private, requires authentication |
| Real-time streaming | RSS data updates on sync, not real-time |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KEY-01 | Phase 8 | Pending |
| KEY-02 | Phase 8 | Pending |
| KEY-03 | Phase 8 | Pending |
| KEY-04 | Phase 8 | Pending |
| KEY-05 | Phase 8 | Pending |
| KEY-06 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 1 | Complete |
| ENT-01 | Phase 5 | Pending |
| ENT-02 | Phase 5 | Pending |
| ENT-03 | Phase 5 | Pending |
| ENT-04 | Phase 5 | Pending |
| ENT-05 | Phase 5 | Pending |
| ENT-06 | Phase 5 | Pending |
| ENT-07 | Phase 5 | Pending |
| FEED-01 | Phase 6 | Pending |
| FEED-02 | Phase 6 | Pending |
| FEED-03 | Phase 6 | Pending |
| COLL-01 | Phase 7 | Pending |
| COLL-02 | Phase 7 | Pending |
| COLL-03 | Phase 7 | Pending |
| STAT-01 | Phase 7 | Pending |
| STAT-02 | Phase 7 | Pending |
| STAT-03 | Phase 7 | Pending |
| RATE-01 | Phase 4 | Complete |
| RATE-02 | Phase 4 | Complete |
| RATE-03 | Phase 4 | Complete |
| PAGE-01 | Phase 3 | Complete |
| PAGE-02 | Phase 3 | Complete |
| PAGE-03 | Phase 3 | Complete |
| DOC-01 | Phase 9 | Pending |
| DOC-02 | Phase 9 | Pending |
| DOC-03 | Phase 9 | Pending |
| DOC-04 | Phase 9 | Pending |
| DOC-05 | Phase 9 | Pending |
| ERR-01 | Phase 3 | Complete |
| ERR-02 | Phase 3 | Complete |
| ERR-03 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after roadmap creation*
