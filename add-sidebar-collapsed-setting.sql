-- =====================================================
-- Add Sidebar Collapsed Setting
-- =====================================================
-- This script adds a sidebar_collapsed column to user_settings
-- to persist the sidebar collapsed/expanded state across sessions.

-- =====================================================
-- 1. Add sidebar_collapsed column to user_settings
-- =====================================================

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS sidebar_collapsed BOOLEAN DEFAULT FALSE;

-- =====================================================
-- Verification
-- =====================================================

-- Check if column exists:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_settings' AND column_name = 'sidebar_collapsed';
