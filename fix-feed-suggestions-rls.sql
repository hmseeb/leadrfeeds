-- =====================================================
-- Fix Feed Suggestions RLS Policies
-- =====================================================
-- This script fixes the RLS policies to use JWT claims instead of
-- querying the auth.users table directly
--
-- Run this in Supabase SQL Editor to fix the permission error
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create their own suggestions" ON feed_suggestions;
DROP POLICY IF EXISTS "Users can view their own suggestions" ON feed_suggestions;
DROP POLICY IF EXISTS "Owner can view all suggestions" ON feed_suggestions;
DROP POLICY IF EXISTS "Owner can update any suggestion" ON feed_suggestions;

-- =====================================================
-- Updated RLS Policies (using JWT instead of users table)
-- =====================================================

-- Regular users can insert their own suggestions
CREATE POLICY "Users can create their own suggestions"
    ON feed_suggestions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = suggested_by_user_id);

-- Regular users can view their own suggestions
CREATE POLICY "Users can view their own suggestions"
    ON feed_suggestions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = suggested_by_user_id);

-- Owner can view all suggestions (using JWT email claim)
CREATE POLICY "Owner can view all suggestions"
    ON feed_suggestions
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'hsbazr@gmail.com'
    );

-- Owner can update any suggestion (approve/reject)
CREATE POLICY "Owner can update any suggestion"
    ON feed_suggestions
    FOR UPDATE
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'hsbazr@gmail.com'
    )
    WITH CHECK (
        auth.jwt() ->> 'email' = 'hsbazr@gmail.com'
    );

-- =====================================================
-- Update RPC Functions to use JWT
-- =====================================================

-- Function to get pending suggestions count (for owner badge)
CREATE OR REPLACE FUNCTION get_pending_suggestions_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::INTEGER FROM feed_suggestions WHERE status = 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit a feed suggestion
CREATE OR REPLACE FUNCTION submit_feed_suggestion(
    p_feed_url TEXT,
    p_feed_title TEXT DEFAULT NULL,
    p_feed_description TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_suggestion_id UUID;
    v_user_email TEXT;
BEGIN
    -- Get user email from JWT
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'User email not found';
    END IF;

    -- Insert suggestion
    INSERT INTO feed_suggestions (
        feed_url,
        feed_title,
        feed_description,
        reason,
        suggested_by_user_id,
        suggested_by_email,
        status
    ) VALUES (
        p_feed_url,
        p_feed_title,
        p_feed_description,
        p_reason,
        auth.uid(),
        v_user_email,
        'pending'
    )
    RETURNING id INTO v_suggestion_id;

    RETURN v_suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve a suggestion and create the feed
CREATE OR REPLACE FUNCTION approve_feed_suggestion(
    p_suggestion_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_feed_id UUID;
    v_suggestion RECORD;
    v_user_email TEXT;
BEGIN
    -- Get user email from JWT
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_email != 'hsbazr@gmail.com' THEN
        RAISE EXCEPTION 'Only owner can approve suggestions';
    END IF;

    -- Get suggestion details
    SELECT * INTO v_suggestion
    FROM feed_suggestions
    WHERE id = p_suggestion_id AND status = 'pending';

    IF v_suggestion IS NULL THEN
        RAISE EXCEPTION 'Suggestion not found or already processed';
    END IF;

    -- Check if feed with this URL already exists
    SELECT id INTO v_feed_id FROM feeds WHERE url = v_suggestion.feed_url;

    IF v_feed_id IS NOT NULL THEN
        RAISE EXCEPTION 'A feed with this URL already exists';
    END IF;

    -- Generate new feed ID
    v_feed_id := gen_random_uuid();

    -- Create the feed
    INSERT INTO feeds (
        id,
        url,
        title,
        description,
        category
    ) VALUES (
        v_feed_id,
        v_suggestion.feed_url,
        COALESCE(v_suggestion.feed_title, 'Untitled Feed'),
        v_suggestion.feed_description,
        extract_category(v_suggestion.feed_url)
    );

    -- Update suggestion status
    UPDATE feed_suggestions
    SET
        status = 'approved',
        reviewed_at = NOW(),
        reviewed_by_email = v_user_email
    WHERE id = p_suggestion_id;

    RETURN v_feed_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject a suggestion
CREATE OR REPLACE FUNCTION reject_feed_suggestion(
    p_suggestion_id UUID,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    -- Get user email from JWT
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_email != 'hsbazr@gmail.com' THEN
        RAISE EXCEPTION 'Only owner can reject suggestions';
    END IF;

    -- Update suggestion status
    UPDATE feed_suggestions
    SET
        status = 'rejected',
        reviewed_at = NOW(),
        reviewed_by_email = v_user_email,
        rejection_reason = p_rejection_reason
    WHERE id = p_suggestion_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Suggestion not found or already processed';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Grant permissions
-- =====================================================

-- Grant execute permissions on RPC functions to authenticated users
GRANT EXECUTE ON FUNCTION get_pending_suggestions_count() TO authenticated;
GRANT EXECUTE ON FUNCTION submit_feed_suggestion(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_feed_suggestion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_feed_suggestion(UUID, TEXT) TO authenticated;

-- =====================================================
-- Verification
-- =====================================================

-- Test that you can now query the table
-- SELECT * FROM feed_suggestions LIMIT 1;
