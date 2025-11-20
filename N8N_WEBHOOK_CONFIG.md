# n8n Webhook Configuration for LeadrFeeds

## Supabase Project Details

- **Project URL**: `https://zhcshvmklmuuqngshcdv.supabase.co`
- **Project ID**: `zhcshvmklmuuqngshcdv`
- **Region**: us-east-1

## Important: Use Service Role Key

**⚠️ CRITICAL**: You MUST use the **SERVICE_ROLE** key (not the anon key) for n8n webhook operations. The service role key bypasses Row Level Security (RLS) and allows n8n to insert feeds and entries.

To get your SERVICE_ROLE key:
1. Go to https://supabase.com/dashboard/project/zhcshvmklmuuqngshcdv/settings/api
2. Find the "service_role" key under "Project API keys"
3. Copy this key (it starts with `eyJ...`)

## n8n Workflow Configuration

### Step 1: Insert/Update Feed

Add an **HTTP Request** node with these settings:

**Method**: `POST`

**URL**: `https://zhcshvmklmuuqngshcdv.supabase.co/rest/v1/feeds`

**Authentication**: Generic Credential Type → Header Auth
- Name: `apikey`
- Value: `[YOUR_SERVICE_ROLE_KEY]`

**Headers** (Add these manually):
```
Content-Type: application/json
Prefer: resolution=merge-duplicates
Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
```

**Body** (JSON):
```json
{
  "id": "{{ $json.body.entry.feedId }}",
  "url": "{{ $json.body.feed.url }}",
  "title": "{{ $json.body.feed.title }}",
  "description": "{{ $json.body.feed.description }}",
  "site_url": "{{ $json.body.feed.siteUrl }}",
  "image": "{{ $json.body.feed.image }}",
  "checked_at": "{{ $json.body.feed.checkedAt }}",
  "ttl": {{ $json.body.feed.ttl }},
  "last_modified_header": "{{ $json.body.feed.lastModifiedHeader }}",
  "etag_header": "{{ $json.body.feed.etagHeader }}",
  "error_message": "{{ $json.body.feed.errorMessage }}",
  "error_at": "{{ $json.body.feed.errorAt }}"
}
```

**Note**: The `Prefer: resolution=merge-duplicates` header tells Supabase to update the feed if it already exists (based on the primary key `id`).

---

### Step 2: Insert Entry

Add another **HTTP Request** node with these settings:

**Method**: `POST`

**URL**: `https://zhcshvmklmuuqngshcdv.supabase.co/rest/v1/entries`

**Authentication**: Generic Credential Type → Header Auth
- Name: `apikey`
- Value: `[YOUR_SERVICE_ROLE_KEY]`

**Headers** (Add these manually):
```
Content-Type: application/json
Prefer: resolution=ignore-duplicates
Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
```

**Body** (JSON):
```json
{
  "id": "{{ $json.body.entry.id }}",
  "feed_id": "{{ $json.body.entry.feedId }}",
  "title": "{{ $json.body.entry.title }}",
  "description": "{{ $json.body.entry.description }}",
  "content": "{{ $json.body.entry.content }}",
  "author": "{{ $json.body.entry.author }}",
  "url": "{{ $json.body.entry.url }}",
  "guid": "{{ $json.body.entry.guid }}",
  "published_at": "{{ $json.body.entry.publishedAt }}",
  "inserted_at": "{{ $json.body.entry.insertedAt }}",
  "media": {{ $json.body.entry.media || 'null' }},
  "attachments": {{ $json.body.entry.attachments || 'null' }}
}
```

**Note**: The `Prefer: resolution=ignore-duplicates` header tells Supabase to skip inserting if the entry already exists (based on unique constraints on `id` or `url`).

---

## Workflow Structure

Your n8n workflow should look like this:

```
[Webhook Trigger]
    ↓
[HTTP Request: Insert/Update Feed]
    ↓
[HTTP Request: Insert Entry]
```

Both HTTP Request nodes should run sequentially (feed first, then entry).

---

## Database Features

The following features are automatically handled by the database:

1. **Auto-categorization**: Feeds are automatically categorized by domain (e.g., reddit.com → "Reddit")
2. **Subscriber count**: Automatically updated when users subscribe/unsubscribe
3. **Last entry timestamp**: Automatically updated when new entries are inserted
4. **Cleanup**: Old entries (beyond 1000 per feed) can be cleaned up by calling the `cleanup_old_entries()` function

---

## Testing Your Setup

1. Send a test webhook from Folo to your n8n endpoint
2. Check the n8n execution log for any errors
3. Verify the data in Supabase:
   - Go to https://supabase.com/dashboard/project/zhcshvmklmuuqngshcdv/editor
   - Check the `feeds` table - you should see your feed
   - Check the `entries` table - you should see your entry
   - Verify that `category` was auto-populated

---

## Troubleshooting

### Error: "new row violates row-level security policy"
- You're using the wrong API key. Make sure you're using the SERVICE_ROLE key, not the anon key.

### Error: "duplicate key value violates unique constraint"
- This is normal if the entry already exists. The `Prefer: resolution=ignore-duplicates` header should suppress this error.
- For feeds, `resolution=merge-duplicates` will update existing feeds instead of throwing an error.

### Error: "null value in column violates not-null constraint"
- Check that your webhook payload includes all required fields
- Required for feeds: `id`, `url`
- Required for entries: `id`, `feed_id`

### Entries not showing up in the app
- Make sure users have subscribed to the feed
- Entries are only visible to users who have subscribed to the parent feed (RLS enforced)

---

## Next Steps

After configuring n8n:
1. Test with a few webhook events
2. Verify data appears in Supabase
3. Proceed with building the SvelteKit frontend application
