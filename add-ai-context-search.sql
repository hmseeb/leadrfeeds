-- =====================================================
-- Add Search Query Parameter to get_ai_context
-- =====================================================
-- This migration adds search capability to the AI context function
-- allowing the Feed Assistant to receive context filtered by search query.

-- Drop existing functions (multiple signatures exist)
DROP FUNCTION IF EXISTS get_ai_context(uuid, text, boolean, integer);
DROP FUNCTION IF EXISTS get_ai_context(uuid, text, boolean, boolean, integer);

CREATE OR REPLACE FUNCTION get_ai_context(
    user_id_param uuid,
    feed_id_filter text DEFAULT NULL,
    starred_only boolean DEFAULT false,
    unread_only boolean DEFAULT false,
    hours_lookback integer DEFAULT 24,
    search_query text DEFAULT NULL
)
RETURNS TABLE(
    entry_id text,
    entry_title text,
    entry_description text,
    entry_content text,
    entry_author text,
    entry_url text,
    entry_published_at timestamp with time zone,
    feed_id text,
    feed_title text,
    feed_category text,
    feed_url text,
    feed_site_url text,
    is_starred boolean,
    is_read boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id AS entry_id,
    e.title AS entry_title,
    e.description AS entry_description,
    e.content AS entry_content,
    e.author AS entry_author,
    e.url AS entry_url,
    e.published_at AS entry_published_at,
    f.id AS feed_id,
    f.title AS feed_title,
    f.category AS feed_category,
    f.url AS feed_url,
    f.site_url AS feed_site_url,
    COALESCE(ues.is_starred, FALSE) AS is_starred,
    COALESCE(ues.is_read, FALSE) AS is_read
  FROM entries e
  INNER JOIN feeds f ON e.feed_id = f.id
  INNER JOIN user_subscriptions us ON us.feed_id = f.id AND us.user_id = user_id_param
  LEFT JOIN user_entry_status ues ON ues.entry_id = e.id AND ues.user_id = user_id_param
  WHERE
    e.published_at >= NOW() - (hours_lookback || ' hours')::INTERVAL
    AND (feed_id_filter IS NULL OR feed_id_filter = '' OR e.feed_id = feed_id_filter)
    AND (NOT starred_only OR COALESCE(ues.is_starred, FALSE) = TRUE)
    AND (NOT unread_only OR COALESCE(ues.is_read, FALSE) = FALSE)
    -- Search filter: searches entry title, description, author, and feed title
    AND (
      search_query IS NULL OR search_query = '' OR
      e.title ILIKE '%' || search_query || '%' OR
      e.description ILIKE '%' || search_query || '%' OR
      e.author ILIKE '%' || search_query || '%' OR
      f.title ILIKE '%' || search_query || '%'
    )
  ORDER BY e.published_at DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_ai_context(uuid, text, boolean, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_context(uuid, text, boolean, boolean, integer, text) TO anon;
