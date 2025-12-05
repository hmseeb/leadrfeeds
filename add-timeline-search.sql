-- =====================================================
-- Add Search Query Parameter to get_user_timeline
-- =====================================================
-- This migration adds database-level search capability to the timeline
-- by searching entry title, description, author, and feed title using ILIKE.

-- Drop existing function (parameter signature is changing)
DROP FUNCTION IF EXISTS get_user_timeline(uuid, integer, integer, text, boolean, boolean);

CREATE OR REPLACE FUNCTION get_user_timeline(
    user_id_param uuid,
    limit_param integer DEFAULT 50,
    offset_param integer DEFAULT 0,
    feed_id_filter text DEFAULT NULL,
    unread_only boolean DEFAULT false,
    starred_only boolean DEFAULT false,
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
    feed_image text,
    feed_category text,
    is_read boolean,
    is_starred boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.content,
    e.author,
    e.url,
    e.published_at,
    f.id,
    f.title,
    f.image,
    f.category,
    COALESCE(ues.is_read, false),
    COALESCE(ues.is_starred, false)
  FROM entries e
  JOIN feeds f ON e.feed_id = f.id
  JOIN user_subscriptions us ON us.feed_id = f.id AND us.user_id = user_id_param
  LEFT JOIN user_entry_status ues ON ues.entry_id = e.id AND ues.user_id = user_id_param
  WHERE
    (feed_id_filter IS NULL OR f.id = feed_id_filter)
    AND (NOT unread_only OR COALESCE(ues.is_read, false) = false)
    AND (NOT starred_only OR COALESCE(ues.is_starred, false) = true)
    -- Search filter: searches entry title, description, author, and feed title
    AND (
      search_query IS NULL OR search_query = '' OR
      e.title ILIKE '%' || search_query || '%' OR
      e.description ILIKE '%' || search_query || '%' OR
      e.author ILIKE '%' || search_query || '%' OR
      f.title ILIKE '%' || search_query || '%'
    )
  ORDER BY e.published_at DESC
  LIMIT limit_param
  OFFSET offset_param;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_timeline(uuid, integer, integer, text, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_timeline(uuid, integer, integer, text, boolean, boolean, text) TO anon;
