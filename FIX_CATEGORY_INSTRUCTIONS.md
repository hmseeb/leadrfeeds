# Fix Feed Category Extraction in Database

## Problem
The `extract_category()` database function was extracting the subdomain instead of the main domain name:
- `blog.google.com` → "Blog" ❌
- Should be → "Google" ✅

## Solution
Run the SQL script `fix-category-function.sql` in your Supabase SQL Editor to update the database function.

## Steps

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Click **New query**
4. Copy and paste the contents of `fix-category-function.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)

## What This Does

1. **Updates the `extract_category()` function** to:
   - Extract the main domain (e.g., "google" from "blog.google.com")
   - For multi-level domains: uses second-to-last part
   - For simple domains: uses first part
   - Properly capitalizes the domain name

2. **Updates existing feeds** (optional):
   - The script includes a query to update all existing feed categories
   - If you don't want to update existing data, comment out the `UPDATE` statement

## Testing

After running the script, test with a few URLs:

```sql
-- Should return 'Google' (not 'Blog')
SELECT extract_category('https://blog.google/technology/ai/rss/');

-- Should return 'Techmeme'
SELECT extract_category('https://www.techmeme.com/feed');

-- Should return 'Ycombinator' (not 'News')
SELECT extract_category('https://news.ycombinator.com/rss');
```

## Notes

- The frontend code has already been fixed (committed in previous changes)
- This fix only affects the database function used when new feeds are added
- Existing feeds will be updated if you run the `UPDATE` statement in the script
- The discover page will automatically show the corrected categories after this fix
