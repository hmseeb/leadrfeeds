-- =====================================================
-- Feed Waitlist & Auto-Subscribe System
-- =====================================================
-- This script creates a waitlist system where users who suggest feeds
-- are automatically subscribed when the feed is created in the database.
-- It also prevents duplicate suggestions by adding users to the waitlist.

-- =====================================================
-- 1. Create feed_waitlist table
-- =====================================================

CREATE TABLE IF NOT EXISTS feed_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_url TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    subscribed BOOLEAN DEFAULT FALSE,
    subscribed_at TIMESTAMPTZ,
    feed_id TEXT REFERENCES feeds(id) ON DELETE SET NULL,
    UNIQUE(feed_url, user_id)  -- Prevent same user waiting twice for same URL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_feed_waitlist_url ON feed_waitlist(feed_url);
CREATE INDEX IF NOT EXISTS idx_feed_waitlist_user ON feed_waitlist(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_waitlist_subscribed ON feed_waitlist(subscribed) WHERE subscribed = FALSE;

-- Enable RLS
ALTER TABLE feed_waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop first to allow re-running)
DROP POLICY IF EXISTS "Users can view their own waitlist entries" ON feed_waitlist;
DROP POLICY IF EXISTS "Owner can view all waitlist entries" ON feed_waitlist;

CREATE POLICY "Users can view their own waitlist entries"
    ON feed_waitlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Owner can view all waitlist entries"
    ON feed_waitlist FOR SELECT
    USING (auth.jwt() ->> 'email' = 'hsbazr@gmail.com');

-- =====================================================
-- 2. Update submit_feed_suggestion to handle duplicates
-- =====================================================

CREATE OR REPLACE FUNCTION submit_feed_suggestion(
    p_feed_url TEXT,
    p_feed_title TEXT DEFAULT NULL,
    p_feed_description TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_suggestion_id UUID;
    v_existing_suggestion_id UUID;
    v_normalized_url TEXT;
BEGIN
    -- Get user info from JWT
    v_user_id := auth.uid();
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;

    -- Normalize URL (remove trailing slashes, lowercase)
    v_normalized_url := LOWER(TRIM(TRAILING '/' FROM p_feed_url));

    -- Check if this URL has already been suggested (any status)
    SELECT id INTO v_existing_suggestion_id
    FROM feed_suggestions
    WHERE LOWER(TRIM(TRAILING '/' FROM feed_url)) = v_normalized_url
    LIMIT 1;

    IF v_existing_suggestion_id IS NOT NULL THEN
        -- URL already suggested, just add user to waitlist
        INSERT INTO feed_waitlist (feed_url, user_id)
        VALUES (v_normalized_url, v_user_id)
        ON CONFLICT (feed_url, user_id) DO NOTHING;

        -- Return the existing suggestion ID
        RETURN v_existing_suggestion_id;
    END IF;

    -- Create new suggestion
    INSERT INTO feed_suggestions (
        feed_url,
        feed_title,
        feed_description,
        reason,
        suggested_by_user_id,
        suggested_by_email,
        status
    )
    VALUES (
        p_feed_url,
        p_feed_title,
        p_feed_description,
        p_reason,
        v_user_id,
        v_user_email,
        'pending'
    )
    RETURNING id INTO v_suggestion_id;

    -- Also add user to waitlist
    INSERT INTO feed_waitlist (feed_url, user_id)
    VALUES (v_normalized_url, v_user_id)
    ON CONFLICT (feed_url, user_id) DO NOTHING;

    RETURN v_suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. Create trigger to auto-subscribe users when feed is created
-- =====================================================

CREATE OR REPLACE FUNCTION auto_subscribe_waitlist()
RETURNS TRIGGER AS $$
DECLARE
    v_normalized_url TEXT;
    v_subscribed_count INTEGER;
BEGIN
    -- Normalize the feed URL for matching
    v_normalized_url := LOWER(TRIM(TRAILING '/' FROM NEW.url));

    -- Subscribe all users waiting for this feed URL
    INSERT INTO user_subscriptions (user_id, feed_id)
    SELECT fw.user_id, NEW.id
    FROM feed_waitlist fw
    WHERE LOWER(TRIM(TRAILING '/' FROM fw.feed_url)) = v_normalized_url
      AND fw.subscribed = FALSE
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_subscribed_count = ROW_COUNT;

    -- Mark waitlist entries as subscribed
    UPDATE feed_waitlist
    SET
        subscribed = TRUE,
        subscribed_at = NOW(),
        feed_id = NEW.id
    WHERE LOWER(TRIM(TRAILING '/' FROM feed_url)) = v_normalized_url
      AND subscribed = FALSE;

    -- Log the auto-subscription (optional, for debugging)
    IF v_subscribed_count > 0 THEN
        RAISE NOTICE 'Auto-subscribed % users to feed %', v_subscribed_count, NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_feed_created ON feeds;

-- Create trigger on feeds table
CREATE TRIGGER on_feed_created
    AFTER INSERT ON feeds
    FOR EACH ROW
    EXECUTE FUNCTION auto_subscribe_waitlist();

-- =====================================================
-- 4. Helper function to get waitlist count for a URL
-- =====================================================

CREATE OR REPLACE FUNCTION get_waitlist_count(p_feed_url TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
    v_normalized_url TEXT;
BEGIN
    v_normalized_url := LOWER(TRIM(TRAILING '/' FROM p_feed_url));

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM feed_waitlist
    WHERE LOWER(TRIM(TRAILING '/' FROM feed_url)) = v_normalized_url;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Function to check if feed has been created for a suggestion
-- =====================================================

CREATE OR REPLACE FUNCTION get_suggestion_feed_status(p_suggestion_id UUID)
RETURNS TABLE (
    feed_id TEXT,
    feed_title TEXT,
    waitlist_count INTEGER,
    subscribed_count INTEGER,
    is_feed_created BOOLEAN
) AS $$
DECLARE
    v_feed_url TEXT;
    v_normalized_url TEXT;
    v_linked_feed_id TEXT;
    v_linked_feed_exists BOOLEAN;
BEGIN
    -- Get the feed URL from the suggestion
    SELECT fs.feed_url INTO v_feed_url
    FROM feed_suggestions fs
    WHERE fs.id = p_suggestion_id;

    IF v_feed_url IS NULL THEN
        RETURN;
    END IF;

    v_normalized_url := LOWER(TRIM(TRAILING '/' FROM v_feed_url));

    -- Check if there's a pre-linked feed_id in the waitlist
    SELECT fw.feed_id INTO v_linked_feed_id
    FROM feed_waitlist fw
    WHERE LOWER(TRIM(TRAILING '/' FROM fw.feed_url)) = v_normalized_url
      AND fw.feed_id IS NOT NULL
    LIMIT 1;

    -- Check if the linked feed_id actually exists in the feeds table
    v_linked_feed_exists := FALSE;
    IF v_linked_feed_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM feeds WHERE id = v_linked_feed_id) INTO v_linked_feed_exists;
    END IF;

    -- First try to find an existing feed by URL match
    RETURN QUERY
    SELECT
        COALESCE(f.id, v_linked_feed_id) AS feed_id,
        COALESCE(f.title, lf.title) AS feed_title,
        (SELECT COUNT(*)::INTEGER FROM feed_waitlist fw2
         WHERE LOWER(TRIM(TRAILING '/' FROM fw2.feed_url)) = v_normalized_url) AS waitlist_count,
        (SELECT COUNT(*)::INTEGER FROM feed_waitlist fw2
         WHERE LOWER(TRIM(TRAILING '/' FROM fw2.feed_url)) = v_normalized_url
         AND fw2.subscribed = TRUE) AS subscribed_count,
        (f.id IS NOT NULL OR v_linked_feed_exists) AS is_feed_created
    FROM (SELECT 1) AS dummy
    LEFT JOIN feeds f ON LOWER(TRIM(TRAILING '/' FROM f.url)) = v_normalized_url
    LEFT JOIN feeds lf ON lf.id = v_linked_feed_id
    WHERE f.id IS NOT NULL OR v_linked_feed_id IS NOT NULL
    LIMIT 1;

    -- If no rows returned yet, return just the waitlist count
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            NULL::TEXT AS feed_id,
            NULL::TEXT AS feed_title,
            (SELECT COUNT(*)::INTEGER FROM feed_waitlist fw2
             WHERE LOWER(TRIM(TRAILING '/' FROM fw2.feed_url)) = v_normalized_url) AS waitlist_count,
            0 AS subscribed_count,
            FALSE AS is_feed_created;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Function to manually link a feed ID to waitlist users
-- =====================================================

-- Drop existing function first (return type may have changed)
DROP FUNCTION IF EXISTS link_feed_to_waitlist(TEXT, TEXT);

CREATE OR REPLACE FUNCTION link_feed_to_waitlist(
    p_feed_url TEXT,
    p_feed_id TEXT
)
RETURNS TABLE (
    subscribed_count INTEGER,
    already_subscribed INTEGER
) AS $$
DECLARE
    v_normalized_url TEXT;
    v_subscribed INTEGER := 0;
    v_already INTEGER := 0;
BEGIN
    -- Only allow owner to call this function
    IF auth.jwt() ->> 'email' != 'hsbazr@gmail.com' THEN
        RAISE EXCEPTION 'Only the owner can link feeds';
    END IF;

    v_normalized_url := LOWER(TRIM(TRAILING '/' FROM p_feed_url));

    -- Create the feed if it doesn't exist (minimal record - n8n will populate the rest)
    INSERT INTO feeds (id, url)
    VALUES (p_feed_id, p_feed_url)
    ON CONFLICT (id) DO NOTHING;

    -- Count already subscribed
    SELECT COUNT(*)::INTEGER INTO v_already
    FROM feed_waitlist fw
    WHERE LOWER(TRIM(TRAILING '/' FROM fw.feed_url)) = v_normalized_url
      AND fw.subscribed = TRUE;

    -- Subscribe all users waiting for this feed URL
    INSERT INTO user_subscriptions (user_id, feed_id)
    SELECT fw.user_id, p_feed_id
    FROM feed_waitlist fw
    WHERE LOWER(TRIM(TRAILING '/' FROM fw.feed_url)) = v_normalized_url
      AND fw.subscribed = FALSE
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_subscribed = ROW_COUNT;

    -- Mark waitlist entries as subscribed
    UPDATE feed_waitlist
    SET
        subscribed = TRUE,
        subscribed_at = NOW(),
        feed_id = p_feed_id
    WHERE LOWER(TRIM(TRAILING '/' FROM feed_url)) = v_normalized_url
      AND subscribed = FALSE;

    RETURN QUERY SELECT v_subscribed, v_already;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. Grant permissions
-- =====================================================

GRANT SELECT ON feed_waitlist TO authenticated;
GRANT EXECUTE ON FUNCTION get_waitlist_count(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_suggestion_feed_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION link_feed_to_waitlist(TEXT, TEXT) TO authenticated;

-- =====================================================
-- 8. Backfill: Add existing suggestion users to waitlist
-- =====================================================

-- Add all existing suggestion users to the waitlist (one-time migration)
INSERT INTO feed_waitlist (feed_url, user_id, created_at)
SELECT
    LOWER(TRIM(TRAILING '/' FROM feed_url)),
    suggested_by_user_id,
    created_at
FROM feed_suggestions
WHERE suggested_by_user_id IS NOT NULL
ON CONFLICT (feed_url, user_id) DO NOTHING;

-- =====================================================
-- Verification queries (run manually to test)
-- =====================================================

-- Check waitlist entries:
-- SELECT * FROM feed_waitlist ORDER BY created_at DESC LIMIT 10;

-- Check if trigger exists:
-- SELECT * FROM pg_trigger WHERE tgname = 'on_feed_created';

-- Test get_waitlist_count:
-- SELECT get_waitlist_count('https://example.com/feed');
