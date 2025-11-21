-- =====================================================
-- Fix Subscriber Count Display on Discover Page
-- =====================================================
-- This script updates get_discovery_feeds to dynamically count
-- subscribers from user_subscriptions table instead of relying
-- on the cached feeds.subscriber_count column (which may be out of sync).

-- =====================================================
-- 1. Update get_discovery_feeds to count subscribers dynamically
-- =====================================================

-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS get_discovery_feeds(TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_discovery_feeds(
    search_query TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    limit_param INTEGER DEFAULT 50,
    offset_param INTEGER DEFAULT 0
)
RETURNS TABLE (
    feed_id TEXT,
    feed_title TEXT,
    feed_description TEXT,
    feed_category TEXT,
    feed_image TEXT,
    feed_site_url TEXT,
    feed_url TEXT,
    subscriber_count BIGINT,
    last_entry_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id AS feed_id,
        f.title AS feed_title,
        f.description AS feed_description,
        f.category AS feed_category,
        f.image AS feed_image,
        f.site_url AS feed_site_url,
        f.url AS feed_url,
        -- Count subscribers dynamically from user_subscriptions
        (SELECT COUNT(*) FROM user_subscriptions us WHERE us.feed_id = f.id) AS subscriber_count,
        f.last_entry_at
    FROM feeds f
    WHERE
        -- Search filter
        (search_query IS NULL OR search_query = '' OR
         f.title ILIKE '%' || search_query || '%' OR
         f.description ILIKE '%' || search_query || '%' OR
         f.url ILIKE '%' || search_query || '%')
        -- Category filter
        AND (category_filter IS NULL OR category_filter = '' OR f.category = category_filter)
    ORDER BY
        (SELECT COUNT(*) FROM user_subscriptions us WHERE us.feed_id = f.id) DESC,
        f.last_entry_at DESC NULLS LAST
    LIMIT limit_param
    OFFSET offset_param;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 2. Sync function to update all subscriber_count values
-- =====================================================
-- Run this once to fix any existing discrepancies

CREATE OR REPLACE FUNCTION sync_all_subscriber_counts()
RETURNS TABLE (
    feed_id TEXT,
    old_count INTEGER,
    new_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH updated AS (
        UPDATE feeds f
        SET subscriber_count = (
            SELECT COUNT(*)::INTEGER
            FROM user_subscriptions us
            WHERE us.feed_id = f.id
        )
        RETURNING f.id, f.subscriber_count
    )
    SELECT
        u.id AS feed_id,
        COALESCE(old_f.subscriber_count, 0) AS old_count,
        u.subscriber_count::BIGINT AS new_count
    FROM updated u
    LEFT JOIN feeds old_f ON old_f.id = u.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. Fix the trigger to properly handle all inserts
-- =====================================================

CREATE OR REPLACE FUNCTION update_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE feeds
        SET subscriber_count = (
            SELECT COUNT(*)::INTEGER
            FROM user_subscriptions
            WHERE feed_id = NEW.feed_id
        )
        WHERE id = NEW.feed_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE feeds
        SET subscriber_count = (
            SELECT COUNT(*)::INTEGER
            FROM user_subscriptions
            WHERE feed_id = OLD.feed_id
        )
        WHERE id = OLD.feed_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (drop first to ensure clean state)
DROP TRIGGER IF EXISTS on_subscription_change ON user_subscriptions;

CREATE TRIGGER on_subscription_change
    AFTER INSERT OR DELETE ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriber_count();

-- =====================================================
-- 4. Run the sync to fix existing counts
-- =====================================================

-- This will update all feeds with correct subscriber counts
SELECT * FROM sync_all_subscriber_counts();

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION get_discovery_feeds(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_feeds(TEXT, TEXT, INTEGER, INTEGER) TO anon;

-- =====================================================
-- Verification queries (run manually)
-- =====================================================

-- Check subscriber counts match actual subscriptions:
-- SELECT
--     f.id,
--     f.title,
--     f.subscriber_count AS cached_count,
--     (SELECT COUNT(*) FROM user_subscriptions us WHERE us.feed_id = f.id) AS actual_count
-- FROM feeds f
-- WHERE f.subscriber_count != (SELECT COUNT(*) FROM user_subscriptions us WHERE us.feed_id = f.id);

-- Test the discovery feeds function:
-- SELECT feed_id, feed_title, subscriber_count FROM get_discovery_feeds() LIMIT 10;
