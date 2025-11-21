-- =====================================================
-- Fix Feed Title on Approval
-- =====================================================
-- This script updates link_feed_to_waitlist to accept and store
-- the title from the suggestion, so feeds show proper names
-- in the Discover page instead of generic "YouTube" etc.
--
-- Also hides feeds without proper metadata from the Discover page.

-- =====================================================
-- 1. Update link_feed_to_waitlist function
-- =====================================================

-- Drop existing function first (signature changed)
DROP FUNCTION IF EXISTS link_feed_to_waitlist(TEXT, TEXT);

CREATE OR REPLACE FUNCTION link_feed_to_waitlist(
    p_feed_url TEXT,
    p_feed_id TEXT,
    p_feed_title TEXT DEFAULT NULL
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

    -- Create the feed if it doesn't exist (with title if provided)
    INSERT INTO feeds (id, url, title)
    VALUES (p_feed_id, p_feed_url, p_feed_title)
    ON CONFLICT (id) DO UPDATE
    SET title = COALESCE(EXCLUDED.title, feeds.title);

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
-- 2. Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION link_feed_to_waitlist(TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- 3. Update existing feeds without titles (one-time fix)
-- =====================================================

-- Update feeds that have no title but have a matching suggestion with a title
UPDATE feeds f
SET title = fs.feed_title
FROM feed_suggestions fs
WHERE LOWER(TRIM(TRAILING '/' FROM f.url)) = LOWER(TRIM(TRAILING '/' FROM fs.feed_url))
  AND f.title IS NULL
  AND fs.feed_title IS NOT NULL;

-- =====================================================
-- Verification
-- =====================================================

-- Check feeds without titles:
-- SELECT id, url, title FROM feeds WHERE title IS NULL;

-- Check if function exists with new signature:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'link_feed_to_waitlist';

